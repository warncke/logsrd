# LogLogEntryFactory Specification

## 1. Overview

`LogLogEntryFactory` provides static methods for deserializing `LogLogEntry` instances from raw `Uint8Array` buffers. It handles the 11-byte prefix parsing (entry type, entry number, length, CRC), dispatches inner entry deserialization, and supports partial buffer processing for streaming reads.

## 2. Component Specifications (TypeScript Declarations)

```typescript
class LogLogEntryFactory {
  static fromU8(buffer: Uint8Array): LogLogEntry
  static fromPartialU8(buffer: Uint8Array): { entry?: LogLogEntry; needBytes?: number; err?: Error }
  static entryLengthFromU8(buffer: Uint8Array): number
}
```

## 3. System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "LogLogEntryFactory"
        LLEF[LogLogEntryFactory]
        LLEF -->|fromU8| FULL[Full deserialization]
        LLEF -->|fromPartialU8| PART[Partial/streaming]
        LLEF -->|entryLengthFromU8| LEN[Extract length]
    end

    subgraph "Parsing Steps"
        FULL --> TYPE[Read EntryType byte]
        FULL --> NUM[Read 4-byte entryNum]
        FULL --> LEN2[Read 2-byte entryLength]
        FULL --> CRC[Read 4-byte CRC]
        FULL --> INNER[Deserialize inner entry]
    end

    subgraph "Nested Types"
        INNER --> JE[JSONLogEntry]
        INNER --> BE[BinaryLogEntry]
    end
```

## 4. Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant App as Application
    participant LF as LogLogEntryFactory
    participant Parser as Prefix Parser
    participant Inner as Inner Entry Factory
    participant LLE as LogLogEntry

    App->>LF: fromU8(buffer)
    LF->>Parser: extract 11-byte prefix
    Parser-->>LF: {entryNum, entryLength, crc}
    LF->>LF: validate entryType == LOG_LOG
    LF->>Inner: factory for inner entry type
    Inner-->>LF: inner LogEntry
    LF->>LLE: new LogLogEntry({...})
    LLE-->>App: LogLogEntry instance

    App->>LF: fromPartialU8(buffer)
    alt buffer < 11 bytes
        LF-->>App: { needBytes: 11 - buffer.length }
    else valid
        LF-->>App: { entry: LogLogEntry }
    end

    App->>LF: entryLengthFromU8(buffer)
    LF->>Parser: read bytes 5-6 as Uint16LE
    Parser-->>LF: entry length
    LF-->>App: number
```

## 5. Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LogLogEntryFactory Animation</title>
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
  const ANIMATION_DURATION_MS = 800;
  const ANIMATION_KEYFRAMES = [
    { label: "Receive buffer", phase: "input", desc: "Uint8Array arrives" },
    { label: "Verify EntryType byte", phase: "validate", desc: "First byte must be LOG_LOG (0x01)" },
    { label: "Extract entryNum (4B)", phase: "parse", desc: "Bytes 1-4 as Uint32LE" },
    { label: "Extract entryLength (2B)", phase: "parse", desc: "Bytes 5-6 as Uint16LE" },
    { label: "Extract CRC (4B)", phase: "parse", desc: "Bytes 7-10 as Uint32LE" },
    { label: "Deserialize inner entry", phase: "inner", desc: "Parse via inner factory" },
    { label: "Return LogLogEntry", phase: "output", desc: "Constructed LogLogEntry" },
  ];
  const ANIMATION_VERIFICATION = [
    "fromU8 throws 'Invalid entryType' if first byte is not LOG_LOG",
    "fromPartialU8 returns needBytes when buffer is shorter than 11 bytes",
    "entryLengthFromU8 extracts correct length from prefix",
    "Deserialized entry matches original entryNum and byteLength",
    "Supports JSONLogEntry as inner entry type",
  ];

  const LEGEND = [
    { label: "Validate", color: "#fb9a99" },
    { label: "Parse", color: "#b2df8a" },
    { label: "Inner", color: "#fdbf6f" },
    { label: "Output", color: "#a6cee3" },
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
    .text("LogLogEntryFactory Deserialization");

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
| 1 | Deserialize a valid `LogLogEntry` from `u8` | `entryNum` is 100, inner entry is `BinaryLogEntry` |
| 2 | Handle `LogLogEntry` with `JSONLogEntry` inner | `entryNum` is 5, inner entry is `JSONLogEntry` |
| 3 | `fromPartialU8()` with <11 bytes | Returns `{ needBytes: 11 - buffer.length }` |
| 4 | `fromPartialU8()` with invalid entry type | Returns `{ err }` |
| 5 | `fromU8()` with invalid entry type | Throws `"Invalid entryType"` |
| 6 | `entryLengthFromU8()` extracts correct length | Returns inner entry byte length |

---

## 7. Source-Test Cross-References

### Source Coverage

| Source Spec | Path |
|---|---|
| LogLogEntryFactory.spec.md | `source/src/lib/entry/LogLogEntryFactory.spec.md` |
