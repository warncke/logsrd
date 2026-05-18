# JSONCommandType — JSON Command Type Base

**Module: Entry Types**

## Overview

`JSONCommandType` is an intermediate abstract class that extends `CommandLogEntry` and provides **JSON-specific serialization/deserialization** for command entries whose payload is a JSON value. It is the direct base class for `CreateLogCommand` and `SetConfigCommand`.

**Inheritance:** `LogEntry` → `CommandLogEntry` → `JSONCommandType`

**Two construction modes:**
1. **Raw-bypass:** When `args.commandNameU8` and `args.commandValueU8` are both provided, the bytes are passed through directly to `CommandLogEntry` (no JSON round-trip).
2. **Value-based:** When `args.commandNameU8` and `args.value` are provided, the value is serialized: if it is not already a string, it is `JSON.stringify`'d; then the string is `TextEncoder`-encoded and stored as `commandValueU8`.

**`value()` / `setValue()`:** Decode via `TextDecoder` → `JSON.parse`, encode via `JSON.stringify` → `TextEncoder`.

---

## Component Specifications

### Full TypeScript Declaration

```typescript
import CommandLogEntry from "../../command-log-entry"

export type JSONCommandTypeArgs = {
    commandNameU8?: Uint8Array
    commandValueU8?: Uint8Array
    value?: any
}

export default class JSONCommandType extends CommandLogEntry {
    constructor(args: JSONCommandTypeArgs) {
        if (args.commandNameU8 && args.commandValueU8) {
            super({
                commandNameU8: args.commandNameU8,
                commandValueU8: args.commandValueU8,
            })
        } else if (args.commandNameU8 && args.value !== undefined) {
            if (typeof args.value !== "string") {
                args.value = JSON.stringify(args.value)
            }
            super({
                commandNameU8: args.commandNameU8,
                commandValueU8: new TextEncoder().encode(args.value),
            })
        } else {
            throw new Error("JSONCommandType requires commandNameU8 and either commandValueU8 or value")
        }
    }

    value(): any {
        const text = new TextDecoder().decode(this.commandValueU8)
        return JSON.parse(text)
    }

    setValue(value: any): void {
        const jsonString = typeof value === "string" ? value : JSON.stringify(value)
        this.commandValueU8 = new TextEncoder().encode(jsonString)
    }
}
```

### Property & Method Details

| Member | Type / Signature | Overrideable | Description |
|---|---|---|---|
| `constructor(args)` | `(args: JSONCommandTypeArgs) => JSONCommandType` | Yes | Two-mode constructor: raw-bypass or value-based |
| `value()` | `() => any` | Yes | Decodes `commandValueU8` via `TextDecoder` → `JSON.parse` |
| `setValue(value)` | `(value: any) => void` | Yes | `JSON.stringify`s (if needed) → `TextEncoder` → `commandValueU8` |
| `commandNameU8` | `Uint8Array` | No (inherited) | 1-byte command discriminator |
| `commandValueU8` | `Uint8Array` | No (inherited) | Encoded JSON payload bytes |
| `byteLength()` | `() => number` | No (inherited) | Returns `2 + commandValueU8.byteLength` |
| `cksum(entryNum)` | `(entryNum: number) => number` | No (inherited) | CRC32 of type + name + value |

---

## System Architecture

```mermaid
graph TB
    subgraph "Inheritance Chain"
        LE[LogEntry]
        CLE[CommandLogEntry]
        JCT[JSONCommandType]
    end

    subgraph "Concrete Subclasses"
        CLC[CreateLogCommand]
        SCC[SetConfigCommand]
    end

    subgraph "Sibling Command Types"
        UCT[U32CommandType]
        SCT[StringCommandType]
    end

    subgraph "Constructor Decision"
        RAW["Branch 1: commandNameU8 + commandValueU8 → raw bypass"]
        VAL["Branch 2: commandNameU8 + value → JSON.stringify → TextEncoder"]
        ERR["Branch 3: neither → throw Error"]
    end

    LE --> CLE
    CLE --> JCT
    JCT --> CLC
    JCT --> SCC

    CLE --> UCT
    CLE --> SCT

    JCT --> RAW
    JCT --> VAL
    JCT --> ERR

    RAW --> CLE
    VAL --> CLE
```

**On-Wire Layout (with JSON payload):**
```
┌────┬──────────────┬──────────────────────────────┐
│ Ty │ commandName  │ commandValue (JSON bytes)     │
│0x04│ 1 byte       │ N bytes (UTF-8 JSON)         │
└────┴──────────────┴──────────────────────────────┘
```

---

## Detailed Data Flow

```mermaid
sequenceDiagram
    participant Caller
    participant JCT as JSONCommandType constructor
    participant CLE as CommandLogEntry constructor
    participant Instance as JSONCommandType instance

    rect rgb(200, 230, 200)
        Note over Caller,Instance: Raw-bypass path
        Caller->>JCT: new ({ commandNameU8, commandValueU8 })
        JCT->>JCT: args.commandNameU8 && args.commandValueU8 ?
        Note right of JCT: YES → raw bypass
        JCT->>CLE: super({ commandNameU8, commandValueU8 })
        CLE-->>JCT: instance (bytes stored as-is)
        JCT-->>Caller: JSONCommandType
    end

    rect rgb(220, 200, 230)
        Note over Caller,Instance: Value-based path
        Caller->>JCT: new ({ commandNameU8, value: { a: 1 } })
        JCT->>JCT: args.commandNameU8 && args.value !== undefined ?
        Note right of JCT: YES → value serialization
        JCT->>JCT: typeof value !== "string" → JSON.stringify
        JCT->>JCT: new TextEncoder().encode(jsonString)
        JCT->>CLE: super({ commandNameU8, commandValueU8: encoded })
        CLE-->>JCT: instance
        JCT-->>Caller: JSONCommandType
    end

    rect rgb(255, 220, 220)
        Note over Caller,Instance: Error path
        Caller->>JCT: new ({}) (neither provided)
        JCT->>JCT: Both conditions false
        JCT-->>Caller: throw Error("JSONCommandType requires...")
    end

    Note over Instance: Value access
    Instance->>Instance: value() → TextDecoder.decode → JSON.parse → any
    Instance->>Instance: setValue(42) → JSON.stringify("42") → TextEncoder → commandValueU8
```

---

## Visualization

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JSONCommandType — Construction Modes</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  body { font-family: system-ui, sans-serif; background: #1e1e2e; color: #cdd6f4; display: flex; justify-content: center; padding: 2rem; margin: 0; }
  #container { max-width: 800px; width: 100%; }
  h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  svg { display: block; margin: 0 auto; background: #181825; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  .cls-node { cursor: default; }
  .cls-label { font-size: 12px; font-family: monospace; text-anchor: middle; dominant-baseline: central; }
  .cls-edge { stroke: #585b70; stroke-width: 1.5; fill: none; marker-end: url(#arrow); }
  .box-class { fill: #313244; stroke: #585b70; stroke-width: 1; rx: 6; ry: 6; }
  .box-path { fill: #1e1e2e; stroke: #89b4fa; stroke-width: 1.5; rx: 6; ry: 6; }
  .box-error { fill: #1e1e2e; stroke: #f38ba8; stroke-width: 1.5; rx: 6; ry: 6; }
  .controls { margin-top: 1rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
  button { background: #313244; color: #cdd6f4; border: 1px solid #585b70; border-radius: 6px; padding: 0.4rem 1rem; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #45475a; }
  .info { font-family: monospace; font-size: 0.85rem; color: #a6adc8; }
</style>
</head>
<body>
<div id="container">
  <h1>JSONCommandType — Three Construction Modes</h1>
  <div id="vis"></div>
  <div class="controls">
    <button data-testid="play-pause" id="playPauseBtn">&#9654; Play</button>
    <button id="resetBtn">&#8634; Reset</button>
    <span class="info">Keyframe: <span id="kf-current">0</span> / <span id="kf-total">0</span></span>
  </div>
</div>

<script>
(function() {
  const nodes = [
    { id: "JSONCommandType",   x: 300, y: 20,  w: 200, h: 40, cls: "box-class" },
    { id: "Decision",          x: 280, y: 90,  w: 240, h: 40, cls: "box-class" },
    { id: "RawBypass",         x: 50,  y: 170, w: 280, h: 40, cls: "box-path", label: "Branch: commandNameU8 + commandValueU8" },
    { id: "ValueSerialize",    x: 360, y: 170, w: 280, h: 40, cls: "box-path", label: "Branch: commandNameU8 + value" },
    { id: "ThrowError",        x: 50,  y: 260, w: 280, h: 40, cls: "box-error", label: "Branch: neither → throw Error" },
    { id: "CommandLogEntry",   x: 500, y: 260, w: 220, h: 40, cls: "box-class" },
    { id: "JSON.stringify",    x: 360, y: 260, w: 120, h: 36, cls: "box-path", label: "JSON.stringify" },
    { id: "TextEncoder",       x: 360, y: 320, w: 120, h: 36, cls: "box-path", label: "TextEncoder" },
  ];

  const edges = [
    { src: "JSONCommandType", dst: "Decision" },
    { src: "Decision", dst: "RawBypass",         label: "both U8s" },
    { src: "Decision", dst: "ValueSerialize",     label: "name + value" },
    { src: "Decision", dst: "ThrowError",         label: "neither" },
    { src: "RawBypass",   dst: "CommandLogEntry" },
    { src: "ValueSerialize", dst: "JSON.stringify" },
    { src: "JSON.stringify", dst: "TextEncoder" },
    { src: "TextEncoder", dst: "CommandLogEntry" },
  ];

  const w = 800, h = 400;
  const svg = d3.select("#vis").append("svg").attr("width", w).attr("height", h);

  svg.append("defs").append("marker")
    .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
    .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#585b70");

  edges.forEach(e => {
    const s = nodes.find(n => n.id === e.src), d = nodes.find(n => n.id === e.dst);
    if (!s || !d) return;
    svg.append("line").attr("class", "cls-edge")
      .attr("id", "edge-"+e.src+"-"+e.dst)
      .attr("x1", s.x + s.w/2).attr("y1", s.y + s.h)
      .attr("x2", d.x + d.w/2).attr("y2", d.y);
  });

  nodes.forEach(n => {
    const g = svg.append("g").attr("id", "node-"+n.id).attr("class", "cls-node");
    g.append("rect").attr("x", n.x).attr("y", n.y).attr("width", n.w).attr("height", n.h)
      .attr("rx", 6).attr("class", n.cls);
    g.append("text").attr("class", "cls-label").attr("x", n.x + n.w/2).attr("y", n.y + n.h/2)
      .attr("fill", "#cdd6f4").text(n.label || n.id);
  });

  const KF = [];
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 0.2); d3.selectAll(".cls-edge").attr("opacity", 0.08); });
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 0.15); d3.selectAll(".cls-edge").attr("opacity", 0.05); ["JSONCommandType","Decision"].forEach(id => d3.select("#node-"+id).attr("opacity",1)); });
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 0.15); d3.selectAll(".cls-edge").attr("opacity", 0.05); ["JSONCommandType","Decision","RawBypass","CommandLogEntry"].forEach(id => d3.select("#node-"+id).attr("opacity",1)); d3.select("#edge-JSONCommandType-Decision").attr("opacity",0.5); d3.select("#edge-Decision-RawBypass").attr("opacity",0.5); d3.select("#edge-RawBypass-CommandLogEntry").attr("opacity",0.5); });
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 0.15); d3.selectAll(".cls-edge").attr("opacity", 0.05); ["JSONCommandType","Decision","ValueSerialize","JSON.stringify","TextEncoder","CommandLogEntry"].forEach(id => d3.select("#node-"+id).attr("opacity",1)); d3.select("#edge-JSONCommandType-Decision").attr("opacity",0.5); d3.select("#edge-Decision-ValueSerialize").attr("opacity",0.5); d3.select("#edge-ValueSerialize-JSON.stringify").attr("opacity",0.5); d3.select("#edge-JSON.stringify-TextEncoder").attr("opacity",0.5); d3.select("#edge-TextEncoder-CommandLogEntry").attr("opacity",0.5); });
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 0.15); d3.selectAll(".cls-edge").attr("opacity", 0.05); ["JSONCommandType","Decision","ThrowError"].forEach(id => d3.select("#node-"+id).attr("opacity",1)); d3.select("#edge-JSONCommandType-Decision").attr("opacity",0.5); d3.select("#edge-Decision-ThrowError").attr("opacity",0.5); });
  KF.push(() => { d3.selectAll(".cls-node").attr("opacity", 1); d3.selectAll(".cls-edge").attr("opacity", 0.35); });
  window.ANIMATION_KEYFRAMES = KF;

  let currentKF = 0, playing = false, timer = null;
  const $kfCurrent = d3.select("#kf-current");
  const $kfTotal   = d3.select("#kf-total");
  $kfTotal.text(KF.length - 1);

  function applyKF(idx) { currentKF = Math.max(0, Math.min(idx, KF.length-1)); $kfCurrent.text(currentKF); KF[currentKF](); }

  window.jumpToKeyframe = function(idx) { stop(); applyKF(idx); };
  window.resetAnimation = function() { stop(); applyKF(0); };
  window.getAnimationState = function() { return { currentKeyframe: currentKF, totalKeyframes: KF.length-1, isPlaying: playing }; };
  window.ANIMATION_DURATION_MS = KF.length * 800;
  window.ANIMATION_VERIFICATION = function() { const f=[]; if(!Array.isArray(window.ANIMATION_KEYFRAMES)) f.push("ANIMATION_KEYFRAMES missing"); if(typeof window.ANIMATION_DURATION_MS !== "number") f.push("ANIMATION_DURATION_MS missing"); if(typeof window.ANIMATION_VERIFICATION !== "function") f.push("ANIMATION_VERIFICATION missing"); if(typeof window.jumpToKeyframe !== "function") f.push("jumpToKeyframe missing"); if(typeof window.resetAnimation !== "function") f.push("resetAnimation missing"); if(typeof window.getAnimationState !== "function") f.push("getAnimationState missing"); if(!document.querySelector('[data-testid="play-pause"]')) f.push("[data-testid='play-pause'] missing"); if(!document.getElementById("kf-total")) f.push("#kf-total missing"); return { ok: f.length===0, failures: f }; };

  function stop() { playing=false; d3.select("#playPauseBtn").html("&#9654; Play"); if(timer) { clearTimeout(timer); timer=null; } }
  d3.select("#playPauseBtn").on("click", function() { if(playing) { stop(); return; } if(currentKF >= KF.length-1) applyKF(0); playing=true; this.innerHTML = "&#9646;&#9646; Pause"; (function step() { if(!playing) return; const next=currentKF+1; if(next>=KF.length) { stop(); applyKF(0); return; } applyKF(next); timer=setTimeout(step,800); })(); });
  d3.select("#resetBtn").on("click", () => window.resetAnimation());
  applyKF(0);
})();
</script>
</body>
</html>
```

---

## Testing Requirements

### Unit Tests

| # | Test | Expected Outcome |
|---|---|---|
| 1 | `new JSONCommandType({ commandNameU8: Uint8Array([1]), commandValueU8: encoder.encode('{}') })` | Raw-bypass: `commandValueU8` is the exact bytes provided |
| 2 | `new JSONCommandType({ commandNameU8: Uint8Array([1]), value: { a: 1 } })` | Value-based: `commandValueU8` is UTF-8 of `'{"a":1}'` |
| 3 | `new JSONCommandType({ commandNameU8: Uint8Array([1]), value: '{"b":2}' })` | Value-based with string value: `commandValueU8` is UTF-8 of `'{"b":2}'` (no double-stringify) |
| 4 | `new JSONCommandType({})` | Throws `Error("JSONCommandType requires commandNameU8 and either commandValueU8 or value")` |
| 5 | `new JSONCommandType({ commandNameU8: Uint8Array([1]) })` (no value, no commandValueU8) | Throws same error |
| 6 | `new JSONCommandType({ value: 42 })` (no commandNameU8) | Throws same error |

### Value Access Tests

| # | Test | Expected Outcome |
|---|---|---|
| 1 | `instance.value()` on instance with `commandValueU8 = encoder.encode('[1,2,3]')` | Returns `[1, 2, 3]` |
| 2 | `instance.setValue(null)` then `instance.value()` | Returns `null` |
| 3 | `instance.setValue([1, "a", true])` then `instance.value()` | Returns `[1, "a", true]` |
| 4 | `instance.setValue("plain")` (string input to setValue) | Stores `"plain"` (no JSON.stringify wrap) |

### Serialization Contract Tests

| # | Test | Expected Outcome |
|---|---|---|
| 1 | `instance.byteLength() === 2 + instance.commandValueU8.byteLength` | Always true |
| 2 | `instance.u8s()[2] === instance.commandValueU8` | Payload chunk matches |
| 3 | `instance.value()` after `instance.setValue(x)` yields `x` (for JSON-serializable `x`) | Round-trip fidelity |
| 4 | `instance.cksum(0)` is idempotent | Second call returns same number |

### Edge Cases

| # | Scenario | Assertion |
|---|---|---|
| 1 | `commandValueU8` contains malformed JSON | `value()` throws `SyntaxError` |
| 2 | `setValue(undefined)` | `JSON.stringify(undefined)` returns `undefined` → `TextEncoder.encode(undefined)` produces empty bytes |
| 3 | `setValue(() => {})` (function) | `JSON.stringify(function)` returns `undefined` → same as above |
| 4 | `value()` on empty `commandValueU8` (0-length) | `JSON.parse("")` throws `SyntaxError` |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| JSONCommandType.test.spec.md | `source/src/lib/entry/command/command-type/JSONCommandType.test.spec.md` |
