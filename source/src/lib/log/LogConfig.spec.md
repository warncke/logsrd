# LogConfig — Specification

**Module: Log Abstraction**

## Overview

`LogConfig` validates, stores, and initializes the configuration for a single log stream. It enforces mutual exclusivity between token-based and JWT-based authentication, auto-generates missing secrets, and guards access-level token constraints. The class is constructed from a plain `ILogConfig` object and validated through a JSON Schema compiled with AJV.

## Component Specifications (TypeScript declarations)

### `ILogConfig` interface

| Property | Type | Required | Description |
|---|---|---|---|
| `logId` | `string` | Yes | Unique log identifier |
| `type` | `"binary" \| "json"` | Yes | Log format |
| `master` | `string` | Yes | Master host address |
| `replicas` | `string[]` | No | Replica host addresses |
| `asyncReplicas` | `string[]` | No | Async replica host addresses |
| `access` | `"public" \| "private" \| "readOnly" \| "writeOnly"` | Yes | Access level |
| `authType` | `"token" \| "jwt"` | Yes | Authentication mechanism |
| `accessToken` | `string` | No | Base access token |
| `adminToken` | `string` | No | Admin token |
| `readToken` | `string` | No | Read-only token |
| `writeToken` | `string` | No | Write token |
| `superToken` | `string` | No | Super token |
| `jwtProperties` | `string[]` | No | JWT claim properties |
| `jwtSecret` | `string` | No | JWT signing secret |
| `stopped` | `boolean` | Yes | Whether the log is stopped |
| `configLogAddress` | `string \| LogAddress` | No | Address of this log's config stream |

### `LogConfig` class

| Method / Property | Signature | Description |
|---|---|---|
| `constructor` | `(config: ILogConfig)` | Copies properties, converts `configLogAddress` string to `LogAddress` |
| `replicationGroup()` | `(): string[]` | Returns `[master, ...replicas]` |
| `setDefaults()` | `(): Promise<void>` | Validates mutual exclusivity, auto-generates tokens/secret |
| `newFromJSON` | `static (json: any): Promise<LogConfig>` | Validates via JSON Schema, constructs, applies defaults |

### `InvalidLogConfigError` class

Extends `Error` with an `errors` field holding AJV `ErrorObject[]`.

### Exported constants

- `ProtectedProperties`: `string[]` — array of sensitive property names (`accessToken`, `adminToken`, `readToken`, `writeToken`, `superToken`, `jwtProperties`, `jwtSecret`).
- `LogConfigSchema`: `JSONSchemaType<ILogConfig>` — full JSON Schema definition.

### Dependency graph

```
LogConfig ──► LogAddress
LogConfig ──► ajv (AJV)
LogConfig ──► crypto (mz/crypto)
```

## System Architecture (Mermaid graph TB)

```mermaid
graph TB
    subgraph "LogConfig Module"
        A[JSON Input<br/>plain object] --> B[AJV Schema Validator<br/>LogConfigSchema]
        B -- valid --> C[LogConfig.newFromJSON]
        B -- invalid --> D[InvalidLogConfigError]
        C --> E[LogConfig.constructor<br/>Object.assign + string→LogAddress]
        E --> F[setDefaults]
        F --> G{authType}
        G -- token --> H[auto-generate accessToken<br/>if missing sub-tokens]
        G -- jwt --> I[auto-generate jwtSecret<br/>if missing, error on tokens]
        H --> J[access-level guard check]
        I --> J
        J --> K[Ready LogConfig]
    end

    subgraph "External Dependencies"
        L[AJV] --> B
        M[crypto.randomBytes] --> H
        M --> I
        N[LogAddress.fromString] --> E
    end

    subgraph "Consumer"
        O[LogHost / Replica manager] --> K
    end
```

## Detailed Data Flow (Mermaid sequenceDiagram)

```mermaid
sequenceDiagram
    participant Caller
    participant LogConfigClass as LogConfig (static)
    participant Validator as AJV Schema
    participant Config as LogConfig (instance)
    participant Crypto as mz/crypto
    participant LogAddress

    Caller->>LogConfigClass: newFromJSON(rawJson)
    LogConfigClass->>Validator: schemaValidator(rawJson)
    Validator-->>LogConfigClass: valid=true
    Note over LogConfigClass: If invalid throws InvalidLogConfigError

    LogConfigClass->>Config: new LogConfig(json)
    Config->>LogAddress: fromString(configLogAddress) [if string]
    LogAddress-->>Config: LogAddress instance

    Config->>Config: setDefaults()
    Config->>Config: check authType
    alt authType === "token"
        Config->>Config: check accessToken / adminToken / readToken / writeToken
        alt missing base token
            Config->>Crypto: randomBytes(32)
            Crypto-->>Config: Buffer → base64 accessToken
        end
    else authType === "jwt"
        Config->>Config: error if any token present
        alt missing jwtSecret
            Config->>Crypto: randomBytes(32)
            Crypto-->>Config: Buffer → base64 jwtSecret
        end
    end
    Config->>Config: validate access-level token constraints
    Config-->>LogConfigClass: ready
    LogConfigClass-->>Caller: LogConfig instance

    Note over Caller: Caller can now use replicationGroup(),<br/>access configLogAddress, etc.
```

## Visualization (self-contained D3 HTML)

```html
<!DOCTYPE html>
<meta charset="utf-8">
<body>
<script src="https://d3js.org/d3.v7.min.js"></script>
<div id="vis" style="text-align:center;font-family:monospace">
  <h3>LogConfig — AuthType Mutual Exclusivity</h3>
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
    { label: "Config Received", detail: "newFromJSON(rawJson) called" },
    { label: "Schema Validation", detail: "AJV validates against LogConfigSchema" },
    { label: "Constructor", detail: "Object.assign + configLogAddress → LogAddress" },
    { label: "setDefaults: authType?", detail: "Branch on token vs jwt" },
    { label: "Token Path", detail: "Auto-generate missing accessToken" },
    { label: "JWT Path", detail: "Auto-generate missing jwtSecret" },
    { label: "Access Guard", detail: "Validate readToken/writeToken constraints" },
    { label: "Ready", detail: "LogConfig instance fully initialized" },
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

  // Draw timeline
  g.append("line")
    .attr("x1", xScale(0))
    .attr("y1", innerH / 2)
    .attr("x2", xScale(totalSteps - 1))
    .attr("y2", innerH / 2)
    .attr("stroke", "#ccc")
    .attr("stroke-width", 2);

  // Draw nodes
  const nodes = g.selectAll("circle")
    .data(ANIMATION_KEYFRAMES)
    .enter()
    .append("circle")
    .attr("cx", (d, i) => xScale(i))
    .attr("cy", innerH / 2)
    .attr("r", 10)
    .attr("fill", "#69b3a2")
    .attr("stroke", "#2c7a6b")
    .attr("stroke-width", 2);

  // Labels above
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

  // Detail text below
  const detailText = g.append("text")
    .attr("class", "detail")
    .attr("x", innerW / 2)
    .attr("y", innerH - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", "13px")
    .attr("fill", "#555");

  // Highlight ring
  const highlight = g.append("circle")
    .attr("r", 16)
    .attr("fill", "none")
    .attr("stroke", "#e74c3c")
    .attr("stroke-width", 3);

  let currentStep = 0;
  let intervalId = null;
  let isPlaying = false;

  function getAnimationState() {
    return { currentStep, totalSteps, isPlaying };
  }

  function jumpToKeyframe(step) {
    step = Math.max(0, Math.min(totalSteps - 1, Math.round(step)));
    currentStep = step;
    highlight.attr("cx", xScale(step)).attr("cy", innerH / 2);
    nodes.attr("fill", (d, i) => i === step ? "#e74c3c" : "#69b3a2");
    detailText.text(`${ANIMATION_KEYFRAMES[step].label}: ${ANIMATION_KEYFRAMES[step].detail}`);
    document.getElementById("kf-current").textContent = step;
    d3.select("#kf-slider").property("value", step);
  }

  const stepMs = ANIMATION_DURATION_MS / totalSteps;

  function tick() {
    const next = (currentStep + 1) % totalSteps;
    jumpToKeyframe(next);
  }

  function startAnimation() {
    if (intervalId) return;
    isPlaying = true;
    document.querySelector('#play-pause').textContent = '⏸ Pause';
    intervalId = setInterval(tick, stepMs);
  }

  function stopAnimation() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isPlaying = false;
    document.querySelector('#play-pause').textContent = '▶ Play';
  }

  function togglePlay() {
    if (isPlaying) stopAnimation();
    else startAnimation();
  }

  document.getElementById('play-pause').addEventListener('click', togglePlay);

  d3.select("#kf-slider")
    .on("input", function() {
      if (isPlaying) stopAnimation();
      jumpToKeyframe(+this.value);
    });

  // Init
  document.getElementById("kf-total").textContent = totalSteps - 1;
  d3.select("#kf-slider").attr("max", totalSteps - 1);
  jumpToKeyframe(0);

  // Expose for testing
  window.ANIMATION_DURATION_MS = ANIMATION_DURATION_MS;
  window.ANIMATION_KEYFRAMES = ANIMATION_KEYFRAMES;
  window.ANIMATION_VERIFICATION = true;
  window.jumpToKeyframe = jumpToKeyframe;
  window.resetAnimation = () => { stopAnimation(); jumpToKeyframe(0); };
  window.getAnimationState = getAnimationState;

  // ANIMATION_VERIFICATION check
  console.log('ANIMATION_VERIFICATION:', window.ANIMATION_VERIFICATION);
})();
</script>
</body>
```

## Testing Requirements

| # | Test | Type | Description |
|---|---|---|---|
| 1 | Valid JSON passes schema | Unit | `newFromJSON({logId, type, master, access, authType, stopped})` returns `LogConfig` |
| 2 | Invalid JSON throws | Unit | Missing required fields → `InvalidLogConfigError` with errors array |
| 3 | `authType="token"` with `jwtSecret` throws | Unit | Error message: "jwtSecret not allowed for authType token" |
| 4 | `authType="token"` missing all tokens → auto-generate | Unit | `accessToken` is set after `setDefaults` |
| 5 | `authType="jwt"` with tokens throws | Unit | Error message: "accessTokens not allowed for authType jwt" |
| 6 | `authType="jwt"` missing `jwtSecret` → auto-generate | Unit | `jwtSecret` is set after `setDefaults` |
| 7 | `access="public"` with `readToken` or `writeToken` throws | Unit | Error message includes "not allowed for access public" |
| 8 | `access="readOnly"` with `readToken` throws | Unit | Error message includes "not allowed for access readOnly" |
| 9 | `access="writeOnly"` with `writeToken` throws | Unit | Error message includes "not allowed for access writeOnly" |
| 10 | `replicationGroup()` returns correct array | Unit | `[master, ...replicas]` |
| 11 | `configLogAddress` string → `LogAddress` on construction | Unit | After constructor, `configLogAddress` is a `LogAddress` instance |
| 12 | `configLogAddress` null stays null | Unit | When input is null, no conversion attempted |
| 13 | `ProtectedProperties` constant | Unit | Contains all 7 sensitive property names |
| 14 | Invalid `authType` throws | Unit | Error message: "Invalid authType" |
| 15 | Schema validates enum values | Unit | `type` must be "binary" or "json"; `access` must be one of 4 values |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| LogConfig.test.spec.md | `source/src/lib/log/LogConfig.test.spec.md` |
