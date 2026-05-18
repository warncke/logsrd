# JSONLogEntry Specification

**Module: Entry Types**

## 1. Overview

`JSONLogEntry` stores a string or binary JSON payload within a log entry. It accepts either a pre-encoded `Uint8Array` or a JavaScript string (which it encodes via `TextEncoder` on first access). The entry type byte distinguishes it from other entry types, and its CRC32 checksum is computed over the type byte, entry number, and payload.

## 2. Component Specifications (TypeScript Declarations)

```typescript
class JSONLogEntry extends LogEntry {
  // ── Private fields ─────────────────────────────────────────
  #jsonStr: string | null        // Lazily decoded string representation
  #jsonU8: Uint8Array | null     // Lazily encoded binary representation

  // ── Constructor ────────────────────────────────────────────
  constructor({ jsonStr?, jsonU8? }: {
    jsonStr?: string | null
    jsonU8?: Uint8Array | null
  })
  // Must provide exactly one of jsonStr or jsonU8

  // ── Methods ────────────────────────────────────────────────
  byteLength(): number          // 1 (type byte) + payload.byteLength
  cksum(entryNum: number): number  // CRC32(u8(), CRC32(TYPE_BYTE, entryNum)); memoized
  u8(): Uint8Array              // Returns binary payload (cached in #jsonU8)
  u8s(): Uint8Array[]           // [TYPE_BYTE, this.u8()]
  str(): string                 // Returns string payload (cached in #jsonStr)
  static fromU8(u8: Uint8Array): JSONLogEntry  // Deserialize from raw bytes
}
```

**Binary layout** (variable length):

| Offset | Size | Field            |
|--------|------|------------------|
| 0      | 1    | EntryType.JSON (6) |
| 1      | var  | JSON payload (UTF-8 encoded string or raw Uint8Array) |

## 3. System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "JSONLogEntry (variable-length payload)"
        JSON[JSONLogEntry]
        JSON --> TYPE[Type byte: EntryType.JSON]
        JSON --> PAYLOAD[JSON payload: string / Uint8Array]
    end

    subgraph "Internal Caching"
        JSON --> STR[#jsonStr: string]
        JSON --> U8[#jsonU8: Uint8Array]
        STR <-->|"TextEncoder / TextDecoder"| U8
    end

    subgraph "Enclosing Entry Types"
        GLE[GlobalLogEntry] --> JSON
        LLE[LogLogEntry] --> JSON
    end

    subgraph "Base Class"
        LE[LogEntry abstract]
        LE -.- JSON
    end

    JSON -->|"static fromU8()"| DESERIALIZE[Deserialize from disk bytes]
```

## 4. Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant App as Application
    participant JSON as JSONLogEntry
    participant Encoder as TextEncoder / TextDecoder
    participant Parent as Parent Entry (GlobalLogEntry / LogLogEntry)

    Note over App,JSON: Construction from string

    App->>JSON: new({jsonStr: '{"key":"value"}'})
    JSON->>JSON: store #jsonStr, #jsonU8 = null

    App->>JSON: byteLength()
    JSON->>JSON: u8().byteLength + 1
    JSON-->>App: number

    App->>JSON: u8()
    JSON->>JSON: #jsonU8 exists?
    Note over JSON: No — encode #jsonStr
    JSON->>Encoder: TextEncoder.encode(#jsonStr)
    Encoder-->>JSON: Uint8Array
    JSON->>JSON: cache in #jsonU8
    JSON-->>App: Uint8Array

    App->>JSON: str()
    JSON->>JSON: #jsonStr exists?
    Note over JSON: Yes — return cached
    JSON-->>App: string

    App->>JSON: cksum(entryNum)
    JSON->>JSON: CRC32(u8(), CRC32(TYPE_BYTE, entryNum))
    JSON-->>App: number

    Parent->>JSON: u8s()
    JSON-->>Parent: [TYPE_BYTE, this.u8()]

    Note over App,JSON: Deserialization from bytes

    App->>JSON: static fromU8(u8)
    JSON->>JSON: check type byte == EntryType.JSON
    JSON-->>App: new JSONLogEntry({jsonU8: payload})
```

## 5. Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>JSONLogEntry Animation</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0d1117; display: flex; flex-direction: column; align-items: center; padding: 2rem; }
  #container { max-width: 960px; width: 100%; }
  svg { display: block; margin: 0 auto; background: #161b22; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
  .controls { display: flex; gap: 12px; align-items: center; margin-top: 1rem; flex-wrap: wrap; justify-content: center; }
  button { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-size: 14px; cursor: pointer; }
  button:hover { background: #2ea043; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  label { color: #c9d1d9; font-size: 13px; }
  input[type="range"] { width: 240px; accent-color: #238636; }
  .stats { color: #8b949e; font-size: 12px; margin-top: 0.5rem; display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
  .byte-legend { display: flex; gap: 2px; justify-content: center; flex-wrap: wrap; margin: 0.5rem 0; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #c9d1d9; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #30363d; }
  #kf-total { color: #58a6ff; font-weight: 600; }
</style>
</head>
<body>
<div id="container">
  <svg id="vis" width="900" height="400"></svg>
  <div class="controls">
    <button id="play-pause" data-testid="play-pause">▶ Play</button>
    <button id="reset">↺ Reset</button>
    <label>Keyframe <span id="kf-current">0</span>/<span id="kf-total">0</span>
      <input type="range" id="kf-slider" min="0" max="0" value="0" step="1">
    </label>
  </div>
  <div class="stats">
    <span>State: <span id="state-value">idle</span></span>
    <span>Phase: <span id="phase-value">—</span></span>
  </div>
  <div class="byte-legend" id="legend"></div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
(function() {
  const ANIMATION_DURATION_MS = 1000;
  const ANIMATION_KEYFRAMES = [
    { label: "Construct with jsonStr", phase: "init", desc: "new JSONLogEntry({jsonStr: '{...}'}) stores string" },
    { label: "Lazy encode: str → u8", phase: "encode", desc: "u8() encodes #jsonStr via TextEncoder (cached in #jsonU8)" },
    { label: "u8s() = [TYPE_BYTE, payload]", phase: "serialize", desc: "TYPE_BYTE (0x06) followed by JSON payload bytes" },
    { label: "cksum(entryNum)", phase: "checksum", desc: "CRC32(payload, CRC32(TYPE_BYTE, entryNum))" },
    { label: "Lazy decode: u8 → str", phase: "decode", desc: "str() decodes #jsonU8 via TextDecoder (cached in #jsonStr)" },
    { label: "byteLength() = 1 + payload.len", phase: "measure", desc: "Returns type byte + payload size" },
    { label: "Deserialize: fromU8()", phase: "read", desc: "Static factory strips type byte, creates new instance" },
  ];
  const ANIMATION_VERIFICATION = [
    "Constructor throws if neither jsonStr nor jsonU8 provided",
    "u8() is memoized after first call",
    "str() is memoized after first call",
    "byteLength() must equal 1 + u8().byteLength",
    "cksum() computes CRC32(u8(), CRC32(TYPE_BYTE, entryNum)) and memoizes",
    "fromU8() throws if entryType does not match EntryType.JSON",
    "fromU8() correctly strips type byte and wraps remaining payload",
    "Round-trip: jsonStr → u8s() → fromU8() → str() matches original",
    "Round-trip: jsonU8 → u8s() → fromU8() → u8() matches original",
    "TYPE_BYTE must be Uint8Array([EntryType.JSON]) i.e. [6]",
  ];

  const LEGEND = [
    { label: "Type byte (1B)", color: "#f781bf" },
    { label: "JSON Payload (variable)", color: "#cab2d6" },
  ];

  const legendEl = document.getElementById("legend");
  LEGEND.forEach(l => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${l.color}"></span>${l.label}`;
    legendEl.appendChild(item);
  });

  const TOTAL_KF = ANIMATION_KEYFRAMES.length;
  document.getElementById("kf-total").textContent = TOTAL_KF;

  const width = 900, height = 400;
  const svg = d3.select("#vis");

  const byteCells = [
    ...Array(1).fill().map((_,i) => ({color:"#f781bf", label:"T", offset:i})),
    ...Array(16).fill().map((_,i) => ({color:"#cab2d6", label:"J", offset:1+i})),
  ];

  const cellW = 22, cellH = 22, gap = 1;
  const totalW = byteCells.length * (cellW + gap);
  const startX = (width - totalW) / 2;
  const infoY = 60;

  svg.append("text")
    .attr("x", width / 2).attr("y", 30)
    .attr("text-anchor", "middle").attr("fill", "#58a6ff")
    .attr("font-size", "18").attr("font-weight", "bold")
    .text("JSONLogEntry Binary Layout");

  svg.append("text")
    .attr("id", "phase-label")
    .attr("x", width / 2).attr("y", infoY)
    .attr("text-anchor", "middle").attr("fill", "#8b949e").attr("font-size", "13")
    .text("Click Play to animate");

  svg.append("text")
    .attr("id", "desc-label")
    .attr("x", width / 2).attr("y", infoY + 20)
    .attr("text-anchor", "middle").attr("fill", "#c9d1d9").attr("font-size", "12")
    .text("");

  const byteRects = svg.selectAll("rect.byte")
    .data(byteCells).join("rect").attr("class", "byte")
    .attr("x", (d,i) => startX + i*(cellW+gap)).attr("y", infoY+40)
    .attr("width", cellW).attr("height", cellH).attr("rx",3).attr("ry",3)
    .attr("fill", d => d.color).attr("stroke","#30363d").attr("stroke-width",1)
    .attr("opacity", 0.15);

  const byteLabels = svg.selectAll("text.bytelen")
    .data(byteCells).join("text").attr("class","bytelen")
    .attr("x", (d,i) => startX + i*(cellW+gap) + cellW/2)
    .attr("y", infoY+40+cellH/2+4)
    .attr("text-anchor","middle").attr("fill","#fff").attr("font-size","9")
    .attr("opacity",0)
    .text((d,i) => i);

  svg.selectAll("text.offset")
    .data(byteCells).join("text").attr("class","offset")
    .attr("x", (d,i) => startX + i*(cellW+gap) + cellW/2)
    .attr("y", infoY+40+cellH+14)
    .attr("text-anchor","middle").attr("fill","#484f58").attr("font-size","9")
    .text((d,i) => i);

  const timelineY = height - 60;
  svg.append("text").attr("x",width/2).attr("y",timelineY-10)
    .attr("text-anchor","middle").attr("fill","#8b949e").attr("font-size","11")
    .text("Keyframe Timeline");

  const kfBarW = Math.min(700, width-80), kfBarX = (width - kfBarW)/2;
  svg.append("rect").attr("x",kfBarX).attr("y",timelineY)
    .attr("width",kfBarW).attr("height",6).attr("rx",3).attr("fill","#30363d");
  svg.append("rect").attr("id","timeline-progress")
    .attr("x",kfBarX).attr("y",timelineY)
    .attr("width",0).attr("height",6).attr("rx",3).attr("fill","#238636");

  const kfSpacing = kfBarW / (TOTAL_KF-1||1);
  svg.selectAll("circle.kf-marker")
    .data(d3.range(TOTAL_KF)).join("circle").attr("class","kf-marker")
    .attr("cx", (d,i) => kfBarX + i*kfSpacing).attr("cy",timelineY+3)
    .attr("r",5).attr("fill","#484f58").attr("stroke","#30363d");
  svg.append("text").attr("id","kf-label")
    .attr("x",width/2).attr("y",timelineY+30)
    .attr("text-anchor","middle").attr("fill","#c9d1d9").attr("font-size","11").text("");

  let currentKF=0, playing=false, timer=null;
  const state = { keyframe:0, phase:"idle" };

  function jumpToKeyframe(idx) {
    if (idx<0) idx=0;
    if (idx>=TOTAL_KF) { idx=TOTAL_KF-1; if(playing) stop(); }
    currentKF=idx;
    const kf=ANIMATION_KEYFRAMES[idx];
    if(!kf) return;
    document.getElementById("kf-current").textContent=idx;
    document.getElementById("kf-slider").value=idx;
    document.getElementById("phase-value").textContent=kf.phase;
    document.getElementById("state-value").textContent=idx>=TOTAL_KF-1?"complete":(playing?"playing":"paused");
    svg.select("#phase-label").text(kf.label);
    svg.select("#desc-label").text(kf.desc);

    let hs=0, he=byteCells.length;
    if(idx===0 || idx===1  || idx===4 || idx===5){
      hs=0; he=byteCells.length;
    } else if(idx===2 || idx===6){
      hs=0; he=1;
    } else if(idx===3){
      hs=0; he=byteCells.length;
    } else { hs=0; he=byteCells.length; }

    byteRects.attr("opacity",(d,i)=>i>=hs&&i<he?1:0.15)
      .attr("stroke",(d,i)=>i>=hs&&i<he?"#58a6ff":"#30363d")
      .attr("stroke-width",(d,i)=>i>=hs&&i<he?2:1);
    byteLabels.attr("opacity",(d,i)=>i>=hs&&i<he?1:0);

    const progress = idx/(TOTAL_KF-1);
    svg.select("#timeline-progress").attr("width",progress*kfBarW);
    svg.selectAll("circle.kf-marker")
      .attr("fill",(d,i)=>i<=idx?"#238636":"#484f58")
      .attr("r",(d,i)=>i===idx?7:5);
    svg.select("#kf-label").text(`${idx}: ${kf.label}`);
    state.keyframe=idx; state.phase=kf.phase;
  }

  function resetAnimation() {
    stop(); jumpToKeyframe(0);
    document.getElementById("state-value").textContent="idle";
    document.getElementById("phase-value").textContent="—";
    svg.select("#phase-label").text("Click Play to animate");
    svg.select("#desc-label").text("");
    byteRects.attr("opacity",0.15).attr("stroke","#30363d").attr("stroke-width",1);
    byteLabels.attr("opacity",0);
    svg.select("#timeline-progress").attr("width",0);
    svg.selectAll("circle.kf-marker").attr("fill","#484f58").attr("r",5);
    svg.select("#kf-label").text("");
    state.keyframe=0; state.phase="idle";
  }

  function stop() {
    playing=false; if(timer){clearTimeout(timer);timer=null;}
    document.getElementById("play-pause").textContent="▶ Play";
    document.getElementById("state-value").textContent="paused";
  }

  function play() {
    if(currentKF>=TOTAL_KF-1) resetAnimation();
    playing=true;
    document.getElementById("play-pause").textContent="⏸ Pause";
    document.getElementById("state-value").textContent="playing";
    advance();
  }

  function advance() {
    if(!playing) return;
    if(currentKF>=TOTAL_KF-1){stop();return;}
    jumpToKeyframe(currentKF+1);
    timer=setTimeout(advance, ANIMATION_DURATION_MS/TOTAL_KF);
  }

  function togglePlay() { playing?stop():play(); }
  function getAnimationState() { return {...state, isPlaying:playing, totalKeyframes:TOTAL_KF}; }

  document.getElementById("play-pause").addEventListener("click", togglePlay);
  document.getElementById("reset").addEventListener("click", resetAnimation);
  document.getElementById("kf-slider").addEventListener("input", function() {
    if(playing) stop();
    jumpToKeyframe(parseInt(this.value));
  });

  jumpToKeyframe(0);
  window.ANIMATION_DURATION_MS=ANIMATION_DURATION_MS;
  window.ANIMATION_KEYFRAMES=ANIMATION_KEYFRAMES;
  window.ANIMATION_VERIFICATION=ANIMATION_VERIFICATION;
  window.jumpToKeyframe=jumpToKeyframe;
  window.resetAnimation=resetAnimation;
  window.getAnimationState=getAnimationState;
})();
</script>
</body>
</html>
```

## 6. Testing Requirements

| # | Test | Expected |
|---|------|----------|
| 1 | Construct with `jsonStr` | `#jsonStr` set, `#jsonU8` null |
| 2 | Construct with `jsonU8` | `#jsonU8` set, `#jsonStr` null |
| 3 | Construct with neither argument throws `Error` | `Error` thrown |
| 4 | Construct with both arguments (first wins by code) | Uses `jsonStr` |
| 5 | `u8()` returns `Uint8Array` with UTF-8 encoded string | Correct bytes |
| 6 | `u8()` is memoized (second call returns same reference) | Same `#jsonU8` |
| 7 | `str()` returns the original string | Deep equal |
| 8 | `str()` is memoized (second call returns same reference) | Same `#jsonStr` |
| 9 | `byteLength()` equals `1 + u8().byteLength` | Integer sum |
| 10 | `u8s()` returns `[TYPE_BYTE, u8()]` | 2-element array |
| 11 | `cksum()` computes `CRC32(u8(), CRC32(TYPE_BYTE, entryNum))` and memoizes | `cksumNum` set after first call |
| 12 | `fromU8()` throws on mismatched type byte | `Error` thrown |
| 13 | `fromU8()` correctly parses valid input | Payload wrapped as `jsonU8` |
| 14 | Round-trip (string): `new({jsonStr})` → `u8s()` → concat → `fromU8()` → `str()` | Original string |
| 15 | Round-trip (binary): `new({jsonU8})` → `u8s()` → concat → `fromU8()` → `u8()` | Original bytes |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| JSONLogEntry.test.spec.md | `source/src/lib/entry/JSONLogEntry.test.spec.md` |
