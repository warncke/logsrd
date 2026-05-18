# LogHost — Specification

## Overview

`LogHost` is a simple data holder that pairs a master host address with an ordered list of replica host addresses. It provides bidirectional conversion with a comma-separated string format where the first element is the master and the remaining elements are replicas.

## Component Specifications (TypeScript declarations)

### `LogHost` class

| Method / Property | Signature | Description |
|---|---|---|
| `constructor` | `(master: string, replicas: string[] = [])` | Stores master and optional replicas |
| `master` | `string` | Master host address (e.g. `"127.0.0.1:7000"`) |
| `replicas` | `string[]` | Replica host addresses |
| `toString()` | `(): string` | Returns `"master[,replica1,replica2,...]"` |
| `fromString` | `static (str: string): LogHost` | Parses comma-separated string; first element is master, rest are replicas |

### String format

```
<master>[,<replica1>[,<replica2>...]]
```

- Master is required
- Replicas are optional
- No validation of address format

## System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "LogHost Module"
        A[LogHost.fromString] --> B[Split by ,]
        B --> C[First element master]
        B --> D[Remaining elements replicas]
        C --> E[new LogHost master replicas]
        D --> E

        F[LogHost.toString] --> G[Collect master]
        G --> H{has replicas?}
        H -- yes --> I[Collect master,replica1,...]
        H -- no --> J[Return master only]
    end

    subgraph "Consumers"
        K[LogAddress] --> E
        K --> F
        L[LogConfig] --> A
    end
```

## Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant Caller
    participant LogHost as LogHost

    Note over Caller,LogHost: Construction
    Caller->>LogHost: new LogHost(master, replicas)
    LogHost-->>Caller: LogHost instance

    alt fromString
        Caller->>LogHost: fromString(127.0.0.1:7000,127.0.0.1:7001)
        LogHost->>LogHost: split by ,
        LogHost->>LogHost: master = 127.0.0.1:7000
        LogHost->>LogHost: replicas = [127.0.0.1:7001]
        LogHost-->>Caller: LogHost
    end

    Note over Caller,LogHost: Serialization
    Caller->>LogHost: toString
    alt has replicas
        LogHost-->>Caller: 127.0.0.1:7000,127.0.0.1:7001
    else no replicas
        LogHost-->>Caller: 127.0.0.1:7000
    end
```

## Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<meta charset="utf-8">
<body>
<script src="https://d3js.org/d3.v7.min.js"></script>
<div id="vis" style="text-align:center;font-family:monospace">
  <h3>LogHost — Master / Replica Pairing</h3>
  <svg width="800" height="400"></svg>
  <div>
    <button id="play-pause" data-testid="play-pause">▶ Play</button>
    <span>Keyframe: <span id="kf-current">0</span> / <span id="kf-total">0</span></span>
    <input type="range" id="kf-slider" min="0" max="0" value="0" step="1">
  </div>
</div>
<script>
(function() {
  const ANIMATION_DURATION_MS = 4000;
  const ANIMATION_KEYFRAMES = [
    { label: "Construct", detail: "new LogHost(master, replicas)" },
    { label: "fromString", detail: "Parse comma-separated master,rep1,rep2" },
    { label: "Master Set", detail: "First element as master address" },
    { label: "Replicas Set", detail: "Remaining elements as replicas array" },
    { label: "toString", detail: "Serialize back to comma-separated string" },
  ];
  const totalSteps = ANIMATION_KEYFRAMES.length;

  const svg = d3.select("svg");
  const width = 800, height = 400;
  const margin = { top: 40, right: 20, bottom: 60, left: 20 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear()
    .domain([0, totalSteps - 1])
    .range([50, innerW - 50]);

  g.append("line")
    .attr("x1", xScale(0)).attr("y1", innerH / 2)
    .attr("x2", xScale(totalSteps - 1)).attr("y2", innerH / 2)
    .attr("stroke", "#ccc").attr("stroke-width", 2);

  const nodes = g.selectAll("circle")
    .data(ANIMATION_KEYFRAMES)
    .enter()
    .append("circle")
    .attr("cx", (d, i) => xScale(i))
    .attr("cy", innerH / 2)
    .attr("r", 10)
    .attr("fill", "#2c3e50")
    .attr("stroke", "#1a252f")
    .attr("stroke-width", 2);

  g.selectAll("text.label")
    .data(ANIMATION_KEYFRAMES)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", (d, i) => xScale(i))
    .attr("y", innerH / 2 - 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "11px")
    .attr("fill", "#333")
    .text((d) => d.label);

  const detailText = g.append("text")
    .attr("class", "detail")
    .attr("x", innerW / 2)
    .attr("y", innerH - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", "13px")
    .attr("fill", "#555");

  const highlight = g.append("circle")
    .attr("r", 16).attr("fill", "none")
    .attr("stroke", "#e74c3c").attr("stroke-width", 3);

  let currentStep = 0, intervalId = null, isPlaying = false;

  function getAnimationState() { return { currentStep, totalSteps, isPlaying }; }

  function jumpToKeyframe(step) {
    step = Math.max(0, Math.min(totalSteps - 1, Math.round(step)));
    currentStep = step;
    highlight.attr("cx", xScale(step)).attr("cy", innerH / 2);
    nodes.attr("fill", (d, i) => i === step ? "#e74c3c" : "#2c3e50");
    detailText.text(`${ANIMATION_KEYFRAMES[step].label}: ${ANIMATION_KEYFRAMES[step].detail}`);
    document.getElementById("kf-current").textContent = step;
    d3.select("#kf-slider").property("value", step);
  }

  const stepMs = ANIMATION_DURATION_MS / totalSteps;

  function tick() { jumpToKeyframe((currentStep + 1) % totalSteps); }
  function startAnimation() {
    if (intervalId) return;
    isPlaying = true;
    document.querySelector('#play-pause').textContent = '⏸ Pause';
    intervalId = setInterval(tick, stepMs);
  }
  function stopAnimation() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    isPlaying = false;
    document.querySelector('#play-pause').textContent = '▶ Play';
  }
  function togglePlay() { isPlaying ? stopAnimation() : startAnimation(); }

  document.getElementById('play-pause').addEventListener('click', togglePlay);
  d3.select("#kf-slider").on("input", function() {
    if (isPlaying) stopAnimation();
    jumpToKeyframe(+this.value);
  });

  document.getElementById("kf-total").textContent = totalSteps - 1;
  d3.select("#kf-slider").attr("max", totalSteps - 1);
  jumpToKeyframe(0);

  window.ANIMATION_DURATION_MS = ANIMATION_DURATION_MS;
  window.ANIMATION_KEYFRAMES = ANIMATION_KEYFRAMES;
  window.ANIMATION_VERIFICATION = true;
  window.jumpToKeyframe = jumpToKeyframe;
  window.resetAnimation = () => { stopAnimation(); jumpToKeyframe(0); };
  window.getAnimationState = getAnimationState;
  console.log('ANIMATION_VERIFICATION:', window.ANIMATION_VERIFICATION);
})();
</script>
</body>
```

## Testing Requirements

| # | Test | Type | Description |
|---|---|---|---|
| 1 | Create with master and replicas | Unit | `master` and `replicas` correctly stored |
| 2 | Create with default empty replicas | Unit | `replicas` defaults to `[]` |
| 3 | Parse from comma-separated string | Unit | `fromString("m, r1, r2")` correctly splits |
| 4 | Parse single-host string | Unit | `fromString("m")` returns empty replicas |
| 5 | toString with replicas | Unit | Returns `"master,replica1"` |
| 6 | toString without replicas | Unit | Returns `"master"` |

---

## 7. Source-Test Cross-References

### Source Coverage

| Source Spec | Path |
|---|---|
| LogHost.spec.md | `source/src/lib/log/LogHost.spec.md` |
