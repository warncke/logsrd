# LogAddress — Specification

**Module: Log Abstraction**

## Overview

`LogAddress` encodes a log's Base64URL identifier, its current host (master + replicas), and an ordered list of config-log hosts into a semi-colon-separated string format. It supports bidirectional conversion between the structured object and the string representation, enabling network transmission and configuration-file storage of log location.

## Component Specifications (TypeScript declarations)

### `LogAddress` class

| Method / Property | Signature | Description |
|---|---|---|
| `constructor` | `(logIdBase64: string, host?: LogHost \| null, config?: LogHost[] \| null)` | Initializes with required logId, optional host and config-log hosts |
| `logIdBase64` | `string` | Base64URL-encoded log identifier |
| `host` | `LogHost \| null` | Current host (master + replicas) |
| `config` | `LogHost[] \| null` | Ordered list of config-log hosts |
| `setConfig(config)` | `(LogHost[]): void` | Replaces config log hosts |
| `setHost(host)` | `(LogHost): void` | Replaces current host |
| `toString()` | `(): string` | Serializes to `"logId[;host][;config...]"` |
| `fromString` | `static (logAddress: string): LogAddress` | Parses the serialized format; minimum 22 chars |

### String format

```
<base64-logId>[;<master,replica1,...>[;<master,replica1,...>]...]
```

- Sections separated by `;`
- Hosts within a section separated by `,`
- At least 22 characters required (16 bytes × 4/3 ≈ 22 Base64 chars)

### Dependency graph

```
LogAddress ──► LogHost
```

## System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "LogAddress Module"
        A[LogAddress.fromString] --> B[Split by ;]
        B --> C[First segment → logIdBase64]
        B --> D[Second segment → LogHost.fromString → host]
        B --> E[Remaining segments → LogHost[] → config]

        F[LogAddress.toString] --> G[Join logIdBase64]
        G --> H[Join host.toString()]
        H --> I[Join config .toString()]
        I --> J[Final string with ; separators]
    end

    subgraph "Dependencies"
        K[LogHost] --> A
        K --> F
    end

    subgraph "Consumers"
        L[LogConfig.configLogAddress] --> A
        M[Network resolver] --> F
        M --> A
    end
```

## Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant Caller
    participant LogAddress as LogAddress
    participant LogHost as LogHost

    Note over Caller,LogHost: Deserialization
    Caller->>LogAddress: fromString("b64id;host1,rep1;chost1,crep1")
    LogAddress->>LogAddress: validate length >= 22
    LogAddress->>LogAddress: split(";")
    LogAddress->>LogAddress: shift() → logIdBase64
    LogAddress->>LogHost: fromString("host1,rep1")
    LogHost-->>LogAddress: LogHost{master, replicas}
    LogAddress->>LogAddress: set as host

    loop remaining sections
        LogAddress->>LogHost: fromString(section)
        LogHost-->>LogAddress: LogHost
        LogAddress->>LogAddress: push to config[]
    end

    LogAddress-->>Caller: LogAddress instance

    Note over Caller,LogHost: Serialization
    Caller->>LogAddress: toString()
    LogAddress->>LogAddress: collect logIdBase64
    alt host != null
        LogAddress->>LogHost: host.toString()
        LogHost-->>LogAddress: "master,replica1,..."
    end
    alt config != null
        loop each LogHost in config
            LogAddress->>LogHost: host.toString()
        end
    end
    LogAddress->>LogAddress: join with ";"
    LogAddress-->>Caller: "b64id;host1,rep1;chost1,crep1"
```

## Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<meta charset="utf-8">
<body>
<script src="https://d3js.org/d3.v7.min.js"></script>
<div id="vis" style="text-align:center;font-family:monospace">
  <h3>LogAddress — Serialization / Deserialization</h3>
  <svg width="800" height="400"></svg>
  <div>
    <button id="play-pause" data-testid="play-pause">▶ Play</button>
    <span>Keyframe: <span id="kf-current">0</span> / <span id="kf-total">0</span></span>
    <input type="range" id="kf-slider" min="0" max="0" value="0" step="1">
  </div>
</div>
<script>
(function() {
  const ANIMATION_DURATION_MS = 5000;
  const ANIMATION_KEYFRAMES = [
    { label: "Input String", detail: "\"b64id;master,rep1;cmaster,crep1\"" },
    { label: "Split by ;", detail: "→ [\"b64id\", \"master,rep1\", \"cmaster,crep1\"]" },
    { label: "Extract logIdBase64", detail: "First element: \"b64id\"" },
    { label: "Parse host", detail: "Second → LogHost.fromString(\"master,rep1\")" },
    { label: "Parse config", detail: "Remaining → LogHost[]" },
    { label: "toString()", detail: "Re-join with ; → round-trip verified" },
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
    .attr("fill", "#2980b9")
    .attr("stroke", "#1a5276")
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
    nodes.attr("fill", (d, i) => i === step ? "#e74c3c" : "#2980b9");
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
| 1 | `fromString` parses full address | Unit | All three sections (logId, host, config) correctly extracted |
| 2 | `fromString` with only logId | Unit | host=null, config=null |
| 3 | `fromString` with logId + host | Unit | host set, config=null |
| 4 | `toString` matches `fromString` input | Unit | `LogAddress.fromString(s).toString() === s` |
| 5 | `toString` with null host/config | Unit | Returns just logIdBase64 |
| 6 | Minimum length validation | Unit | String < 22 chars throws Error |
| 7 | Multiple config hosts | Unit | `config` array has correct number of `LogHost` entries |
| 8 | `setConfig` replaces config | Unit | Old config discarded, new one set |
| 9 | `setHost` replaces host | Unit | Old host discarded, new one set |
| 10 | Round-trip with real base64 | Unit | Use `LogId.newRandom()` → `base64()` → construct address → verify |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| LogAddress.test.spec.md | `source/src/lib/log/LogAddress.test.spec.md` |
