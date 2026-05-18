# JSONCommandType Specification

## 1. Overview

`JSONCommandType` is a `CommandLogEntry` subclass for commands whose value is JSON-encoded. It supports construction from a parsed value object, a JSON string, or pre-encoded `Uint8Array` bytes. It provides `byteLength()`, `cksum()`, `u8s()`, and `setValue()` for mutating the command value after construction.

## 2. Component Specifications (TypeScript Declarations)

```typescript
class JSONCommandType extends CommandLogEntry {
  constructor({ commandNameU8, commandValueU8?, value? }: {
    commandNameU8: Uint8Array
    commandValueU8?: Uint8Array
    value?: any | string
  })

  value(): any
  setValue(value: any): void
  byteLength(): number
  cksum(seed: number): number
  u8s(): Uint8Array[]
}
```

## 3. System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "JSONCommandType"
        JCT[JSONCommandType]
        JCT -->|extends| CLE[CommandLogEntry]
    end

    subgraph "Value Sources"
        OBJ[from value object]
        STR[from JSON string]
        U8[from commandValueU8 bytes]
        OBJ --> JCT
        STR --> JCT
        U8 --> JCT
    end

    subgraph "Methods"
        JCT --> VAL[value(): parsed object]
        JCT --> SET[setValue(): mutate]
        JCT --> LEN[byteLength()]
        JCT --> CK[cksum(seed)]
        JCT --> SEG[u8s(): 3 segments]
    end
```

## 4. Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant App as Application
    participant JCT as JSONCommandType

    App->>JCT: new({commandNameU8, value: {key: "value"}})
    JCT->>JCT: JSON.stringify value
    JCT-->>App: value() returns {key: "value"}

    App->>JCT: new({commandNameU8, value: '{"key":"value"}'})
    JCT->>JCT: parse string, store JSON
    JCT-->>App: value() returns {key: "value"}

    App->>JCT: new({commandNameU8, commandValueU8})
    JCT->>JCT: store bytes, parse on demand
    JCT-->>App: value() returns object

    App->>JCT: byteLength()
    JCT-->>App: 2 + jsonBytes.length

    App->>JCT: cksum(seed)
    JCT->>JCT: CRC32 over all segments
    JCT-->>App: number

    App->>JCT: u8s()
    JCT-->>App: [typeByte, commandNameU8, jsonBytes]

    App->>JCT: setValue({b: 2})
    JCT->>JCT: replace value, invalidate cache
    App->>JCT: value()
    JCT-->>App: {b: 2}
```

## 5. Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>JSONCommandType Animation</title>
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
    <span id="state-label">State: <span id="state-value">idle</span></span>
    <span>Phase: <span id="phase-value">—</span></span>
  </div>
  <div class="byte-legend" id="legend"></div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
(function() {
  const ANIMATION_DURATION_MS = 900;
  const ANIMATION_KEYFRAMES = [
    { label: "Construct with value object", phase: "construct", desc: "Pass value or commandValueU8" },
    { label: "Serialize to JSON bytes", phase: "serialize", desc: "JSON.stringify the value" },
    { label: "Compute byteLength", phase: "compute", desc: "Return 2 + jsonBytes.length" },
    { label: "Compute checksum", phase: "checksum", desc: "CRC32 over all segments" },
    { label: "Return u8s segments", phase: "segments", desc: "[typeByte, cmdName, jsonBytes]" },
    { label: "setValue mutates", phase: "mutate", desc: "Replace value, old value gone" },
    { label: "Throw on no data", phase: "error", desc: "Missing required constructor params" },
  ];
  const ANIMATION_VERIFICATION = [
    "value() returns parsed object from commandValueU8",
    "value() returns object from value object parameter",
    "value() returns object from value string parameter",
    "byteLength() returns > 2 for non-empty value",
    "cksum() returns a non-zero number",
    "cksum() is cached on second call",
    "u8s() returns 3 segments: [typeByte, cmdNameU8, valueU8]",
    "setValue() replaces value and new value is accessible via value()",
    "Constructor throws if neither commandValueU8 nor value provided",
  ];

  const LEGEND = [
    { label: "Construct", color: "#b2df8a" },
    { label: "Serialize", color: "#fdbf6f" },
    { label: "Compute", color: "#a6cee3" },
    { label: "Mutate", color: "#f781bf" },
    { label: "Error", color: "#fb9a99" },
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

  const infoY = 60;
  svg.append("text")
    .attr("x", width / 2).attr("y", 30)
    .attr("text-anchor", "middle").attr("fill", "#58a6ff")
    .attr("font-size", "18").attr("font-weight", "bold")
    .text("JSONCommandType Flow");

  svg.append("text")
    .attr("id", "phase-label")
    .attr("x", width / 2).attr("y", infoY)
    .attr("text-anchor", "middle").attr("fill", "#8b949e")
    .attr("font-size", "13")
    .text("Click Play to animate");

  svg.append("text")
    .attr("id", "desc-label")
    .attr("x", width / 2).attr("y", infoY + 20)
    .attr("text-anchor", "middle").attr("fill", "#c9d1d9")
    .attr("font-size", "12")
    .text("");

  const timelineY = height - 60;
  svg.append("text")
    .attr("x", width / 2).attr("y", timelineY - 10)
    .attr("text-anchor", "middle").attr("fill", "#8b949e")
    .attr("font-size", "11")
    .text("Keyframe Timeline");

  const kfBarW = Math.min(700, width - 80);
  const kfBarX = (width - kfBarW) / 2;

  svg.append("rect")
    .attr("x", kfBarX).attr("y", timelineY)
    .attr("width", kfBarW).attr("height", 6).attr("rx", 3)
    .attr("fill", "#30363d");

  svg.append("rect")
    .attr("id", "timeline-progress")
    .attr("x", kfBarX).attr("y", timelineY)
    .attr("width", 0).attr("height", 6).attr("rx", 3)
    .attr("fill", "#238636");

  const kfSpacing = kfBarW / (TOTAL_KF - 1 || 1);
  svg.selectAll("circle.kf-marker")
    .data(d3.range(TOTAL_KF))
    .join("circle")
    .attr("class", "kf-marker")
    .attr("cx", (d, i) => kfBarX + i * kfSpacing)
    .attr("cy", timelineY + 3)
    .attr("r", 5)
    .attr("fill", "#484f58")
    .attr("stroke", "#30363d");

  svg.append("text")
    .attr("id", "kf-label")
    .attr("x", width / 2).attr("y", timelineY + 30)
    .attr("text-anchor", "middle").attr("fill", "#c9d1d9")
    .attr("font-size", "11")
    .text("");

  let currentKF = 0;
  let playing = false;
  let timer = null;
  const state = { keyframe: 0, phase: "idle" };

  function jumpToKeyframe(idx) {
    if (idx < 0) idx = 0;
    if (idx >= TOTAL_KF) { idx = TOTAL_KF - 1; if (playing) stop(); }
    currentKF = idx;
    const kf = ANIMATION_KEYFRAMES[idx];
    if (!kf) return;

    document.getElementById("kf-current").textContent = idx;
    document.getElementById("kf-slider").value = idx;
    document.getElementById("phase-value").textContent = kf.phase;
    document.getElementById("state-value").textContent = idx >= TOTAL_KF - 1 ? "complete" : (playing ? "playing" : "paused");

    svg.select("#phase-label").text(kf.label);
    svg.select("#desc-label").text(kf.desc);

    const progress = idx / (TOTAL_KF - 1);
    svg.select("#timeline-progress").attr("width", progress * kfBarW);

    svg.selectAll("circle.kf-marker")
      .attr("fill", (d, i) => i <= idx ? "#238636" : "#484f58")
      .attr("r", (d, i) => i === idx ? 7 : 5);

    svg.select("#kf-label").text(`${idx}: ${kf.label}`);

    state.keyframe = idx;
    state.phase = kf.phase;
  }

  function resetAnimation() {
    stop();
    jumpToKeyframe(0);
    document.getElementById("state-value").textContent = "idle";
    document.getElementById("phase-value").textContent = "—";
    svg.select("#phase-label").text("Click Play to animate");
    svg.select("#desc-label").text("");
    svg.select("#timeline-progress").attr("width", 0);
    svg.selectAll("circle.kf-marker").attr("fill", "#484f58").attr("r", 5);
    svg.select("#kf-label").text("");
    state.keyframe = 0;
    state.phase = "idle";
  }

  function stop() {
    playing = false;
    if (timer) { clearTimeout(timer); timer = null; }
    const btn = document.getElementById("play-pause");
    btn.textContent = "▶ Play";
    document.getElementById("state-value").textContent = "paused";
  }

  function play() {
    if (currentKF >= TOTAL_KF - 1) { resetAnimation(); }
    playing = true;
    const btn = document.getElementById("play-pause");
    btn.textContent = "⏸ Pause";
    document.getElementById("state-value").textContent = "playing";
    advance();
  }

  function advance() {
    if (!playing) return;
    if (currentKF >= TOTAL_KF - 1) { stop(); return; }
    jumpToKeyframe(currentKF + 1);
    timer = setTimeout(advance, ANIMATION_DURATION_MS / TOTAL_KF);
  }

  function togglePlay() {
    if (playing) { stop(); }
    else { play(); }
  }

  function getAnimationState() {
    return { ...state, isPlaying: playing, totalKeyframes: TOTAL_KF };
  }

  document.getElementById("play-pause").addEventListener("click", togglePlay);
  document.getElementById("reset").addEventListener("click", resetAnimation);
  document.getElementById("kf-slider").addEventListener("input", function() {
    if (playing) stop();
    jumpToKeyframe(parseInt(this.value));
  });

  jumpToKeyframe(0);
  window.ANIMATION_DURATION_MS = ANIMATION_DURATION_MS;
  window.ANIMATION_KEYFRAMES = ANIMATION_KEYFRAMES;
  window.ANIMATION_VERIFICATION = ANIMATION_VERIFICATION;
  window.jumpToKeyframe = jumpToKeyframe;
  window.resetAnimation = resetAnimation;
  window.getAnimationState = getAnimationState;
})();
</script>
</body>
</html>
```

## 6. Testing Requirements

| # | Test | Expected |
|---|------|----------|
| 1 | Create with `commandNameU8` and `commandValueU8` | `value()` returns parsed object with `key: "value"` |
| 2 | Create with `commandNameU8` and `value` object | `value()` returns object with `key: "value"`, `num: 42` |
| 3 | Create with `commandNameU8` and `value` string | `value()` returns parsed object with `key: "value"` |
| 4 | `byteLength()` for a known value | Returns value > 2 |
| 5 | `cksum(0)` returns a non-zero number | Type is number, value not 0 |
| 6 | `cksum(0)` is memoized (second call returns same value) | Same value |
| 7 | `u8s()` returns `[typeByte, commandNameU8, valueU8]` | Array length = 3 |
| 8 | `setValue()` replaces existing value | New value accessible, old field undefined |
| 9 | Constructor throws with empty `{}` | Throws error about missing params |

---

## 7. Source-Test Cross-References

### Source Coverage

| Source Spec | Path |
|---|---|
| JSONCommandType.spec.md | `source/src/lib/entry/command/command-type/JSONCommandType.spec.md` |
