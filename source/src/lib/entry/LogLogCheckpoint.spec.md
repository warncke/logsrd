# LogLogCheckpoint Specification

**Module: Entry Types**

## 1. Overview

`LogLogCheckpoint` is a fixed-size 13-byte entry written periodically (every 128 KB block) into a per-log journal (log-of-logs). It records the negative offset and length of the last journaled entry, plus a `lastConfigOffset` pointing to the most recent configuration entry from the start of the file. This enables checkpoint-based recovery with config replay for logical logs.

## 2. Component Specifications (TypeScript Declarations)

```typescript
class LogLogCheckpoint extends LogEntry {
  // ── Public fields ──────────────────────────────────────────
  lastEntryOffset: number       // Negative offset (u16) from checkpoint to last entry start
  lastEntryLength: number       // Length (u16) of the last entry
  lastConfigOffset: number      // Offset (u32) of last config entry from file start
  crc: number | null            // Stored CRC32 checksum; null if not provided at construction

  // ── Constructor ────────────────────────────────────────────
  constructor({ lastEntryOffset, lastEntryLength, lastConfigOffset, crc? }: {
    lastEntryOffset: number
    lastEntryLength: number
    lastConfigOffset: number
    crc?: number
  })

  // ── Methods ────────────────────────────────────────────────
  byteLength(): number          // LOG_LOG_CHECKPOINT_BYTE_LENGTH (13)
  cksum(entryNum?: number): number  // CRC32(this.u8()); cached in this.cksumNum
  verify(): boolean             // crc !== null && crc === this.cksum()
  u8(): Uint8Array              // 8-byte payload (lazily built, cached in #entryU8)
  u8s(): Uint8Array[]           // [TYPE_BYTE, this.u8(), cksum Uint32LE]
  static fromU8(u8: Uint8Array): LogLogCheckpoint  // Deserialize from 13+ bytes
}
```

**Binary layout** (13 bytes, `LOG_LOG_CHECKPOINT_BYTE_LENGTH`):

| Offset | Size | Field            |
|--------|------|------------------|
| 0      | 1    | EntryType.LOG_LOG_CHECKPOINT (3) |
| 1      | 2    | lastEntryOffset (Uint16LE) |
| 3      | 2    | lastEntryLength (Uint16LE) |
| 5      | 4    | lastConfigOffset (Uint32LE) |
| 9      | 4    | cksum (Uint32LE) |

## 3. System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "LogLogCheckpoint (13-byte fixed entry)"
        LLC[LogLogCheckpoint]
        LLC --> OFFSET[lastEntryOffset: Uint16<br/>negative offset to last entry]
        LLC --> LENGTH[lastEntryLength: Uint16<br/>last entry byte length]
        LLC --> CONFIG_OFFSET[lastConfigOffset: Uint32<br/>offset of last config entry]
        LLC --> CRC[cksum: Uint32]
    end

    subgraph "Log-of-Logs File Structure"
        LOL[Log Log Journal]
        LOL --> BLOCK[128 KB Block]
        BLOCK --> ENTRIES[Log Entries ...]
        BLOCK --> CP[LogLogCheckpoint]
    end

    subgraph "Recovery"
        READER[LogLog Reader]
        READER -->|"scan backwards"| CP
        CP -->|"lastEntryOffset + lastEntryLength"| PREV_ENTRY[Previous Entry]
        CP -->|"lastConfigOffset"| CONFIG[Last Config Entry]
    end

    subgraph "Base Class"
        LE[LogEntry abstract]
        LE -.- LLC
    end

    CP -->|"static fromU8()"| DESERIALIZE[Deserialize from disk bytes]
```

## 4. Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant Writer as LogLog Writer
    participant LLC as LogLogCheckpoint
    participant Disk as Log-of-Logs File
    participant Reader as LogLog Reader

    Writer->>LLC: new({lastEntryOffset, lastEntryLength, lastConfigOffset, crc?})
    Note over LLC: lastEntryOffset is negative offset (u16)<br/>lastConfigOffset is absolute offset (u32) from file start

    Writer->>LLC: byteLength()
    LLC-->>Writer: 13

    Writer->>LLC: u8s()
    LLC->>LLC: u8() — build 8-byte payload
    LLC->>LLC: cksum() — CRC32(u8())
    LLC-->>Writer: [TYPE_BYTE, 8B payload, 4B cksum]

    Writer->>Disk: write 13 bytes

    Note over Disk: During recovery...

    Reader->>Disk: read block at block boundary
    Disk-->>Reader: 13-byte buffer

    Reader->>LLC: static fromU8(u8)
    LLC-->>Reader: LogLogCheckpoint instance

    Reader->>LLC: verify()
    Note over Reader: If valid, use offsets to reconstruct journal state<br/>Seek back to last entry via lastEntryOffset<br/>Seek to lastConfigOffset to replay config
```

## 5. Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LogLogCheckpoint Animation</title>
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
  const ANIMATION_DURATION_MS = 1100;
  const ANIMATION_KEYFRAMES = [
    { label: "Type byte: LOG_LOG_CHECKPOINT", phase: "build", desc: "Write EntryType.LOG_LOG_CHECKPOINT (0x03) at offset 0" },
    { label: "Payload: lastEntryOffset (2B)", phase: "build", desc: "Write negative Uint16LE offset at offset 1" },
    { label: "Payload: lastEntryLength (2B)", phase: "build", desc: "Write Uint16LE length at offset 3" },
    { label: "Payload: lastConfigOffset (4B)", phase: "build", desc: "Write Uint32LE config offset at offset 5" },
    { label: "Checksum: cksum (4B)", phase: "checksum", desc: "Write CRC32 as Uint32LE at offset 9 — entry is 13 bytes total" },
    { label: "Verify checksum", phase: "verify", desc: "verify() compares stored crc vs computed cksum()" },
    { label: "Deserialize via fromU8()", phase: "read", desc: "Static factory parses 13-byte buffer into instance" },
    { label: "Recovery: seek to last entry", phase: "recovery", desc: "Use lastEntryOffset to find preceding entry" },
    { label: "Recovery: seek to last config", phase: "recovery", desc: "Use lastConfigOffset to find last config entry" },
  ];
  const ANIMATION_VERIFICATION = [
    "byteLength() must be exactly LOG_LOG_CHECKPOINT_BYTE_LENGTH (13)",
    "Type byte at [0] must equal EntryType.LOG_LOG_CHECKPOINT (0x03)",
    "lastEntryOffset at [1..2] as Uint16LE must match constructor argument",
    "lastEntryLength at [3..4] as Uint16LE must match constructor argument",
    "lastConfigOffset at [5..8] as Uint32LE must match constructor argument",
    "cksum at [9..12] as Uint32LE must match this.cksum()",
    "cksum() computes CRC32(u8()) and is memoized",
    "verify() returns false when crc is null",
    "verify() returns true only when stored crc === computed cksum()",
    "fromU8() throws if entryType does not match LOG_LOG_CHECKPOINT",
    "fromU8() correctly reconstructs all fields from raw bytes",
    "u8() is memoized (cached in #entryU8)",
  ];

  const LEGEND = [
    { label: "Type (1B)", color: "#f781bf" },
    { label: "lastEntryOffset (2B)", color: "#a6cee3" },
    { label: "lastEntryLength (2B)", color: "#b2df8a" },
    { label: "lastConfigOffset (4B)", color: "#33a02c" },
    { label: "cksum (4B)", color: "#fdbf6f" },
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

  const byteGroups = [
    { label: "T", color: "#f781bf", count: 1 },
    { label: "O", color: "#a6cee3", count: 2 },
    { label: "L", color: "#b2df8a", count: 2 },
    { label: "Cfg", color: "#33a02c", count: 4 },
    { label: "C", color: "#fdbf6f", count: 4 },
  ];

  let byteCells = [];
  byteGroups.forEach(g => {
    for (let i = 0; i < g.count; i++) {
      byteCells.push({ color: g.color, label: g.label, offset: byteCells.length });
    }
  });

  const cellW = 28, cellH = 28, gap = 2;
  const totalW = byteCells.length * (cellW + gap);
  const startX = (width - totalW) / 2;
  const infoY = 60;

  svg.append("text")
    .attr("x", width / 2).attr("y", 30)
    .attr("text-anchor", "middle").attr("fill", "#58a6ff")
    .attr("font-size", "18").attr("font-weight", "bold")
    .text("LogLogCheckpoint Binary Layout (13 bytes)");

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
    if(idx===0){hs=0;he=1;}
    else if(idx===1){hs=1;he=3;}
    else if(idx===2){hs=3;he=5;}
    else if(idx===3){hs=5;he=9;}
    else if(idx===4){hs=9;he=13;}
    else{hs=0;he=byteCells.length;}

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
| 1 | Construct with all fields, no `crc` | `crc` is `null` |
| 2 | Construct with explicit `crc` | `crc` matches provided value |
| 3 | `byteLength()` returns `13` | Always 13 |
| 4 | `u8()` produces 8-byte `Uint8Array` | `byteLength === 8` |
| 5 | `u8()` bytes 0–1 as `Uint16LE` match `lastEntryOffset` | Value equal |
| 6 | `u8()` bytes 2–3 as `Uint16LE` match `lastEntryLength` | Value equal |
| 7 | `u8()` bytes 4–7 as `Uint32LE` match `lastConfigOffset` | Value equal |
| 8 | `u8s()` returns `[TYPE_BYTE, u8(), cksum]` as 3-element array | 3 items |
| 9 | `u8s()` concatenated length equals 13 | `1 + 8 + 4 = 13` |
| 10 | `cksum()` computes `CRC32(u8())` and memoizes | `cksumNum` set after first call |
| 11 | `verify()` returns `false` when `crc` is `null` | `false` |
| 12 | `verify()` returns `true` only when `crc === cksum()` | `true` |
| 13 | `fromU8()` throws on mismatched type byte | `Error` thrown |
| 14 | `fromU8()` correctly parses valid 13-byte input | All fields match |
| 15 | `fromU8()` round-trip: construct → `u8s()` → `fromU8()` | Equal instance values |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| LogLogCheckpoint.test.spec.md | `source/src/lib/entry/LogLogCheckpoint.test.spec.md` |
