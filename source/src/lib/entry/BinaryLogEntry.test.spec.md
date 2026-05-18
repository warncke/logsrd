# BinaryLogEntry Specification

## 1. Overview

`BinaryLogEntry` is the simplest log entry type, wrapping raw binary data (`Uint8Array`). It serializes as a single `EntryType.BINARY` byte (0x05) followed by the raw data bytes. It is used as the inner payload for other entry wrappers and provides checksum, length, and round-trip serialization.

## 2. Component Specifications (TypeScript Declarations)

```typescript
class BinaryLogEntry extends LogEntry {
  constructor(data: Uint8Array)

  byteLength(): number
  u8(): Uint8Array
  u8s(): Uint8Array[]
  cksum(seed: number): number

  static fromU8(buffer: Uint8Array): BinaryLogEntry
}
```

## 3. System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "BinaryLogEntry"
        BE[BinaryLogEntry]
        BE --> DATA["data: Uint8Array"]
    end

    subgraph "Serialization"
        TB[EntryType byte: 0x05]
        PL[Raw payload bytes]
        TB --> FULL["[typeByte, ...data]"]
        PL --> FULL
    end

    subgraph "Used By"
        GLE[GlobalLogEntry]
        LLE[LogLogEntry]
        GLE --> BE
        LLE --> BE
    end

    subgraph "Base Class"
        LE[LogEntry abstract]
        LE -.- BE
    end
```

## 4. Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant App as Application
    participant BE as BinaryLogEntry
    participant Buffer as Buffer/Array

    App->>BE: new(Uint8Array(1,2,3))

    App->>BE: byteLength()
    BE-->>App: 1 + data.byteLength

    App->>BE: u8()
    BE->>BE: return data reference
    BE-->>App: Uint8Array

    App->>BE: u8s()
    BE-->>App: [typeByte(0x05), data]

    App->>BE: cksum(seed)
    BE->>BE: CRC32 over data with seed
    BE-->>App: number

    App->>BE: BinaryLogEntry.fromU8(buffer)
    BE->>BE: validate type byte at [0]
    BE->>BE: extract payload from [1..]
    BE-->>App: new BinaryLogEntry
```

## 5. Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>BinaryLogEntry Animation</title>
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
  const ANIMATION_DURATION_MS = 600;
  const ANIMATION_KEYFRAMES = [
    { label: "Raw data input", phase: "input", desc: "User provides Uint8Array data" },
    { label: "Prepend type byte (0x05)", phase: "serialize", desc: "EntryType.BINARY byte at offset 0" },
    { label: "Compute checksum", phase: "checksum", desc: "CRC32 over raw data with seed" },
    { label: "Deserialize via fromU8", phase: "deserialize", desc: "Parse type byte + payload back" },
  ];
  const ANIMATION_VERIFICATION = [
    "EntryType byte must be EntryType.BINARY (0x05)",
    "u8() must return the raw data reference",
    "byteLength() must equal 1 + data.byteLength",
    "u8s() must return [typeByte, data] with exactly 2 segments",
    "cksum() must produce consistent output for identical data",
    "cksum() must be cached on second call",
    "fromU8() must validate entry type and throw on mismatch",
    "Round-trip: u8s() concatenation → fromU8() must reconstruct original",
  ];

  const LEGEND = [
    { label: "Type Byte (1B)", color: "#f781bf" },
    { label: "Raw Data", color: "#a6cee3" },
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
    .text("BinaryLogEntry Serialization");

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
| 1 | Create from `Uint8Array` with known data | `byteLength()` returns `1 + data.length` |
| 2 | `u8()` returns the raw data | Deep equal to input |
| 3 | `u8s()` returns `[typeByte, data]` | Array length = 2 |
| 4 | `cksum(0)` returns a non-zero number | Type is number, value not 0 |
| 5 | Consistent checksum for identical data | Same data produces same cksum |
| 6 | `cksum(0)` is memoized (second call returns same value) | Same value |
| 7 | Serialization round-trip: `u8s()` concatenation → `fromU8()` | Reconstructed entry matches original |
| 8 | `fromU8()` throws on invalid entry type | Throws `"Invalid entryType"` |

---

## 7. Source-Test Cross-References

### Source Coverage

| Source Spec | Path |
|---|---|
| BinaryLogEntry.spec.md | `source/src/lib/entry/BinaryLogEntry.spec.md` |
