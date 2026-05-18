# AppendQueue — Specification

## Overview

`AppendQueue` manages the serialized append pipeline for a single log stream. It accepts entries (with optional config data) via `enqueue`, then processes them one at a time through the server's persist, replicate, and subscribe layers. The queue exposes `waitHead()` and `waitConfig()` promises that resolve when the respective entry has been fully processed. Errors are propagated through `completeWithError`.

## Component Specifications (TypeScript declarations)

### `AppendQueue` class

| Method / Property | Signature | Description |
|---|---|---|
| `constructor` | `(log: Log \| AbstractLog)` | Initializes queue referencing the parent log |
| `enqueue` | `(entry: GlobalLogEntry, config?: ILogConfig): void` | Adds entry to queue; if config provided, stores config entry |
| `waitHead` | `(): Promise<GlobalLogEntry>` | Resolves when the head entry has been persisted |
| `waitConfig` | `(): Promise<GlobalLogEntry>` | Resolves when a config entry has been persisted |
| `hasEntries` | `(): boolean` | Whether queue has any pending entries |
| `hasConfig` | `(): boolean` | Whether queue has a pending config entry |
| `complete` | `(): void` | Signals that head entry processing is done |
| `completeWithError` | `(err: Error): void` | Rejects pending promises with error |

### Processing flow

1. `enqueue` is called with a log entry (and optionally config).
2. The queue background process (via `setTimeout`) picks up the entry.
3. The server persists the entry via `persist.newHotLog.enqueueOp`.
4. Replicas are updated via `replicate.appendReplica`.
5. Subscribers are notified via `subscribe.publish`.
6. `complete()` resolves the `waitHead` promise.
7. If the entry had config, `waitConfig` also resolves after completion.

## System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "AppendQueue Module"
        A[enqueue entry config] --> B[Store entry in queue]
        B --> C[Set head and config references]

        C --> D[Background process starts]
        D --> E[persist.newHotLog.enqueueOp]
        E --> F[replicate.appendReplica]
        F --> G[subscribe.publish]

        G --> H[complete]
        H --> I[Resolve waitHead]
        H --> J[Resolve waitConfig if config entry]

        K[completeWithError err] --> L[Reject all pending promises]
    end

    subgraph "Log Server"
        E
        F
        G
    end

    subgraph "Consumers"
        M[Log append caller] --> A
        M --> C
        M --> I
    end
```

## Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant Caller
    participant Queue as AppendQueue
    participant Log as Log
    participant Server

    Note over Caller,Server: Enqueue and process
    Caller->>Queue: enqueue(entry, config?)
    Queue->>Log: store reference
    Queue->>Queue: set head entry
    alt config provided
        Queue->>Queue: set config entry
    end

    Note over Queue: Background processing begins
    Queue->>Log: server.persist.newHotLog.enqueueOp
    Log-->>Queue: op.complete(op)

    Queue->>Log: server.replicate.appendReplica
    Log-->>Queue: void

    Queue->>Log: server.subscribe.publish
    Log-->>Queue: void

    Queue->>Queue: complete
    Queue-->>Caller: waitHead resolves with entry

    alt has config
        Queue-->>Caller: waitConfig resolves with config entry
    end

    Note over Caller,Server: Error path
    Caller->>Queue: enqueue(entry)
    Queue->>Queue: completeWithError(err)
    Queue-->>Caller: waitHead rejects with err
```

## Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<meta charset="utf-8">
<body>
<script src="https://d3js.org/d3.v7.min.js"></script>
<div id="vis" style="text-align:center;font-family:monospace">
  <h3>AppendQueue — Append Pipeline Processing</h3>
  <svg width="800" height="400"></svg>
  <div>
    <button id="play-pause" data-testid="play-pause">▶ Play</button>
    <span>Keyframe: <span id="kf-current">0</span> / <span id="kf-total">0</span></span>
    <input type="range" id="kf-slider" min="0" max="0" value="0" step="1">
  </div>
</div>
<script>
(function() {
  const ANIMATION_DURATION_MS = 6000;
  const ANIMATION_KEYFRAMES = [
    { label: "Entry Enqueued", detail: "enqueue(entry config?) called" },
    { label: "Persist Entry", detail: "persist.newHotLog.enqueueOp" },
    { label: "Replicate", detail: "replicate.appendReplica" },
    { label: "Notify Subscribers", detail: "subscribe.publish" },
    { label: "Complete", detail: "waitHead resolves with entry" },
    { label: "Config Resolve", detail: "waitConfig resolves if config entry" },
    { label: "Error Path", detail: "completeWithError rejects promises" },
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
    .attr("fill", "#16a085")
    .attr("stroke", "#0e6655")
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
    nodes.attr("fill", (d, i) => i === step ? "#e74c3c" : "#16a085");
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
| 1 | Enqueue entry and waitHead resolves | Unit | `waitHead()` returns the enqueued entry, `hasEntries()` true |
| 2 | Enqueue entry with config and waitConfig resolves | Unit | `waitConfig()` returns the config entry, `hasConfig()` true |
| 3 | hasEntries reports correctly | Unit | False when empty, true after enqueue |
| 4 | hasConfig reports correctly | Unit | False when empty, true after enqueue with config |
| 5 | completeWithError rejects waitHead | Unit | `waitHead()` throws the error passed to `completeWithError` |
| 6 | complete resolves waitHead | Unit | After `complete()`, `waitHead()` resolves with entry |

---

## 7. Source-Test Cross-References

### Source Coverage

| Source Spec | Path |
|---|---|
| AppendQueue.spec.md | `source/src/lib/log/AppendQueue.spec.md` |
