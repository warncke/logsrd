# CreateLogCommand — Create-Log Command Entry

**Module: Entry Types**

## Overview

`CreateLogCommand` is a concrete command entry that extends `JSONCommandType` to represent a **create-log** operation. It inherits the full JSON serialization/deserialization contract from `JSONCommandType` (which itself extends `CommandLogEntry` → `LogEntry`). The only customization is that the constructor automatically injects `CommandName.CREATE_LOG` (byte value `0x00`) as the command-name byte if `args.commandNameU8` is not already set.

**Inheritance:** `LogEntry` → `CommandLogEntry` → `JSONCommandType` → `CreateLogCommand`

**Purpose:** Encodes a "create a new log" command whose payload is a JSON string. The JSON value is stored as `commandValueU8` (UTF-8 encoded). Typical JSON payload contains parameters such as log name, retention policy, etc.

**Registry dispatch:** When the `CommandLogEntryFactory` reads a `CommandLogEntry` whose command-name byte is `0x00`, it looks up `COMMAND_CLASS[0]` → `CreateLogCommand` and instantiates this class.

---

## Component Specifications

### Full TypeScript Declaration

```typescript
import { CommandName } from "../../globals"
import JSONCommandType, { JSONCommandTypeArgs } from "./command-type/json-command-type"

const COMMAND_NAME_BYTE = new Uint8Array([CommandName.CREATE_LOG])

export default class CreateLogCommand extends JSONCommandType {
    constructor(args: JSONCommandTypeArgs) {
        if (!args.commandNameU8) {
            args.commandNameU8 = COMMAND_NAME_BYTE
        }
        super(args)
    }
}
```

### Property & Method Details

| Member | Source | Behaviour |
|---|---|---|
| `constructor(args)` | `CreateLogCommand` | If `args.commandNameU8` is falsy, sets it to `Uint8Array([0])`; delegates to `JSONCommandType` constructor |
| `value(): any` | `JSONCommandType` | Decodes `commandValueU8` via `TextDecoder`, then `JSON.parse` |
| `setValue(value: any): void` | `JSONCommandType` | `JSON.stringify`s the value, encodes via `TextEncoder`, stores to `commandValueU8` |
| `commandNameU8` | `CommandLogEntry` | The command-name byte (`Uint8Array([0])` for create-log) |
| `commandValueU8` | `CommandLogEntry` | The JSON-encoded payload bytes |
| `byteLength(): number` | `CommandLogEntry` | Returns `2 + commandValueU8.byteLength` |
| `cksum(entryNum): number` | `CommandLogEntry` | CRC32 of `TYPE_BYTE \|\| commandNameU8 \|\| commandValueU8` |
| `u8(): Uint8Array` | `CommandLogEntry` | Returns `commandValueU8` (payload only) |
| `u8s(): Uint8Array[]` | `CommandLogEntry` | Returns `[TYPE_BYTE, commandNameU8, commandValueU8]` |

---

## System Architecture

```mermaid
graph TB
    subgraph Inheritance
        LE[LogEntry]
        CLE[CommandLogEntry]
        JCT[JSONCommandType]
        CLC[CreateLogCommand]
    end

    subgraph "Sibling Command Types"
        SCC[SetConfigCommand]
        UCT[U32CommandType]
        SCT[StringCommandType]
    end

    subgraph "Registry Dispatch"
        CC[COMMAND_CLASS]
        CLCF[CommandLogEntryFactory]
    end

    subgraph "Globals"
        CN[CommandName enum]
    end

    LE --> CLE
    CLE --> JCT
    JCT --> CLC
    JCT --> SCC

    CLE --> UCT
    CLE --> SCT

    CC -->|"index 0 (CREATE_LOG)"| CLC
    CC -->|"index 1 (SET_CONFIG)"| SCC

    CLCF -->|"reads commandName byte 0x00"| CC
    CLCF -->|"instantiates"| CLC

    CN -->|"CREATE_LOG = 0"| CC
```

**Command-Name Byte Layout:**
```
┌──────────────┬──────────────────────┐
│ commandName  │ commandValue (JSON)   │
│ 1 byte (0x00)│ N bytes (UTF-8 JSON) │
└──────────────┴──────────────────────┘
```

---

## Detailed Data Flow

```mermaid
sequenceDiagram
    participant Factory as CommandLogEntryFactory
    participant CC as COMMAND_CLASS[0]
    participant CLC as CreateLogCommand constructor
    participant JCT as JSONCommandType constructor
    participant CLE as CommandLogEntry constructor
    participant Instance as CreateLogCommand instance

    Note over Factory: Deserialization path (fromU8)
    Factory->>Factory: Read 1-byte entryType (0x04 = COMMAND)
    Factory->>Factory: Read 1-byte commandName (0x00 = CREATE_LOG)
    Factory->>CC: COMMAND_CLASS[0x00]
    CC-->>Factory: CreateLogCommand constructor
    Factory->>CLC: new CreateLogCommand({ commandNameU8, commandValueU8 })
    CLC->>CLC: args.commandNameU8 already set, skip override
    CLC->>JCT: super(args)
    JCT->>CLE: super(args.commandNameU8, args.commandValueU8)
    CLE-->>JCT: instance (commandNameU8, commandValueU8 set)
    JCT-->>CLC: instance
    CLC-->>Factory: CreateLogCommand instance

    Note over Factory: Construction path (from value)
    Factory->>CLC: new CreateLogCommand({ value: { name: "myLog", ttl: 3600 } })
    CLC->>CLC: args.commandNameU8 is undefined, set to Uint8Array([0])
    CLC->>JCT: super({ commandNameU8: [0], value: { name: "myLog", ... } })
    JCT->>JCT: typeof value !== "string" → JSON.stringify
    JCT->>JCT: new TextEncoder().encode(jsonString)
    JCT->>CLE: super({ commandNameU8: [0], commandValueU8: encoded })
    CLE-->>JCT: instance
    JCT-->>CLC: instance
    CLC-->>Factory: CreateLogCommand

    Note over Instance: Value access
    Instance->>Instance: value() → TextDecoder → JSON.parse → { name, ttl }
    Instance->>Instance: setValue({ name: "otherLog" }) → JSON.stringify → TextEncoder
```

---

## Visualization

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CreateLogCommand — Inheritance & Dispatch</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  body { font-family: system-ui, sans-serif; background: #1e1e2e; color: #cdd6f4; display: flex; justify-content: center; padding: 2rem; margin: 0; }
  #container { max-width: 900px; width: 100%; }
  h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  svg { display: block; margin: 0 auto; background: #181825; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  .cls-node { cursor: default; }
  .cls-label { font-size: 12px; font-family: monospace; text-anchor: middle; dominant-baseline: central; }
  .cls-edge { stroke: #585b70; stroke-width: 1.5; fill: none; }
  .cls-edge-active { stroke: #f5c2e7; stroke-width: 2.5; }
  .box-base { fill: #313244; stroke: #585b70; stroke-width: 1; rx: 6; ry: 6; }
  .box-active { fill: #45475a; stroke: #f5c2e7; stroke-width: 2; }
  .box-highlight { fill: #1e66f5; stroke: #89b4fa; stroke-width: 2; }
  .box-leaf { fill: #1e1e2e; stroke: #a6e3a1; stroke-width: 1; rx: 6; ry: 6; }
  .box-leaf-active { fill: #2e3e2e; stroke: #a6e3a1; stroke-width: 2.5; }
  .controls { margin-top: 1rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
  button { background: #313244; color: #cdd6f4; border: 1px solid #585b70; border-radius: 6px; padding: 0.4rem 1rem; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #45475a; }
  .info { font-family: monospace; font-size: 0.85rem; color: #a6adc8; }
</style>
</head>
<body>
<div id="container">
  <h1>CreateLogCommand — Inheritance Chain &amp; Dispatch</h1>
  <div id="vis"></div>
  <div class="controls">
    <button data-testid="play-pause" id="playPauseBtn">&#9654; Play</button>
    <button id="resetBtn">&#8634; Reset</button>
    <span class="info">Keyframe: <span id="kf-current">0</span> / <span id="kf-total">0</span></span>
  </div>
</div>

<script>
(function() {
  // ---- DATA ----
  const nodes = [
    { id: "LogEntry",          type: "base",    x: 370, y: 20,  w: 160, h: 36 },
    { id: "CommandLogEntry",   type: "base",    x: 340, y: 90,  w: 220, h: 36 },
    { id: "JSONCommandType",   type: "interm",  x: 310, y: 160, w: 280, h: 36 },
    { id: "CreateLogCommand",  type: "leaf",    x: 70,  y: 230, w: 320, h: 36 },
    { id: "SetConfigCommand",  type: "leaf",    x: 510, y: 230, w: 320, h: 36 },
    { id: "COMMAND_CLASS[0]",  type: "reg",     x: 50,  y: 310, w: 200, h: 36 },
    { id: "Factory",           type: "reg",     x: 630, y: 310, w: 220, h: 36 },
  ];

  const edges = [
    { src: "LogEntry",        dst: "CommandLogEntry" },
    { src: "CommandLogEntry", dst: "JSONCommandType" },
    { src: "JSONCommandType", dst: "CreateLogCommand" },
    { src: "JSONCommandType", dst: "SetConfigCommand" },
    { src: "COMMAND_CLASS[0]", dst: "CreateLogCommand", label: "dispatches" },
    { src: "Factory",         dst: "COMMAND_CLASS[0]",  label: "reads 0x00" },
  ];

  const w = 900, h = 400;
  const svg = d3.select("#vis").append("svg").attr("width", w).attr("height", h);

  // Arrow marker
  svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
    .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#585b70");

  // Edges
  const edgeG = svg.append("g");
  edges.forEach(e => {
    const src = nodes.find(n => n.id === e.src);
    const dst = nodes.find(n => n.id === e.dst);
    if (!src || !dst) return;
    const x1 = src.x + src.w / 2, y1 = src.y + src.h;
    const x2 = dst.x + dst.w / 2, y2 = dst.y;
    edgeG.append("line")
      .attr("class", "cls-edge")
      .attr("id", "edge-" + e.src + "-" + e.dst)
      .attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2)
      .attr("marker-end", "url(#arrow)");
  });

  // Nodes
  const nodeG = svg.append("g");
  nodes.forEach(n => {
    const cls = n.type === "base" ? "box-base" : n.type === "leaf" ? "box-leaf" : "box-base";
    const g = nodeG.append("g")
      .attr("id", "node-" + n.id)
      .attr("class", "cls-node " + cls);
    g.append("rect")
      .attr("x", n.x).attr("y", n.y)
      .attr("width", n.w).attr("height", n.h).attr("rx", 6);
    g.append("text")
      .attr("class", "cls-label")
      .attr("x", n.x + n.w / 2).attr("y", n.y + n.h / 2)
      .attr("fill", "#cdd6f4")
      .text(n.id);
  });

  // ---- KEYFRAMES ----
  const KF = [];
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.2);
    d3.selectAll(".cls-edge").attr("opacity", 0.08);
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.15);
    d3.selectAll(".cls-edge").attr("opacity", 0.05);
    ["LogEntry"].forEach(id => d3.select("#node-"+id).attr("opacity", 1));
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.15);
    d3.selectAll(".cls-edge").attr("opacity", 0.05);
    ["LogEntry","CommandLogEntry"].forEach(id => d3.select("#node-"+id).attr("opacity", 1));
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.15);
    d3.selectAll(".cls-edge").attr("opacity", 0.05);
    ["LogEntry","CommandLogEntry","JSONCommandType"].forEach(id => d3.select("#node-"+id).attr("opacity", 1));
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.15);
    d3.selectAll(".cls-edge").attr("opacity", 0.05);
    ["LogEntry","CommandLogEntry","JSONCommandType","CreateLogCommand"].forEach(id => d3.select("#node-"+id).attr("opacity", 1));
    d3.select("#edge-LogEntry-CommandLogEntry").attr("opacity", 1);
    d3.select("#edge-CommandLogEntry-JSONCommandType").attr("opacity", 1);
    d3.select("#edge-JSONCommandType-CreateLogCommand").attr("opacity", 1);
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 0.15);
    d3.selectAll(".cls-edge").attr("opacity", 0.05);
    ["LogEntry","CommandLogEntry","JSONCommandType","CreateLogCommand","Factory","COMMAND_CLASS[0]"].forEach(id => d3.select("#node-"+id).attr("opacity", 1));
    d3.selectAll(".cls-edge").attr("opacity", 0.25);
  });
  KF.push(() => {
    d3.selectAll(".cls-node").attr("opacity", 1);
    d3.selectAll(".cls-edge").attr("opacity", 0.35);
  });

  window.ANIMATION_KEYFRAMES = KF;

  // ---- STATE ----
  let currentKF = 0, playing = false, timer = null;
  const $kfCurrent = d3.select("#kf-current");
  const $kfTotal   = d3.select("#kf-total");
  $kfTotal.text(KF.length - 1);

  function applyKF(idx) {
    currentKF = Math.max(0, Math.min(idx, KF.length - 1));
    $kfCurrent.text(currentKF);
    KF[currentKF]();
  }

  window.jumpToKeyframe = function(idx) { stop(); applyKF(idx); };
  window.resetAnimation = function() { stop(); applyKF(0); };
  window.getAnimationState = function() {
    return { currentKeyframe: currentKF, totalKeyframes: KF.length - 1, isPlaying: playing };
  };
  window.ANIMATION_DURATION_MS = KF.length * 800;
  window.ANIMATION_VERIFICATION = function() {
    const f = [];
    if (!Array.isArray(window.ANIMATION_KEYFRAMES)) f.push("ANIMATION_KEYFRAMES missing");
    if (typeof window.ANIMATION_DURATION_MS !== "number") f.push("ANIMATION_DURATION_MS missing");
    if (typeof window.ANIMATION_VERIFICATION !== "function") f.push("ANIMATION_VERIFICATION missing");
    if (typeof window.jumpToKeyframe !== "function") f.push("jumpToKeyframe missing");
    if (typeof window.resetAnimation !== "function") f.push("resetAnimation missing");
    if (typeof window.getAnimationState !== "function") f.push("getAnimationState missing");
    if (!document.querySelector('[data-testid="play-pause"]')) f.push("[data-testid='play-pause'] missing");
    if (!document.getElementById("kf-total")) f.push("#kf-total missing");
    return { ok: f.length === 0, failures: f };
  };

  function stop() {
    playing = false;
    d3.select("#playPauseBtn").html("&#9654; Play");
    if (timer) { clearTimeout(timer); timer = null; }
  }

  d3.select("#playPauseBtn").on("click", function() {
    if (playing) { stop(); return; }
    if (currentKF >= KF.length - 1) applyKF(0);
    playing = true;
    this.innerHTML = "&#9646;&#9646; Pause";
    (function step() {
      if (!playing) return;
      const next = currentKF + 1;
      if (next >= KF.length) { stop(); applyKF(0); return; }
      applyKF(next);
      timer = setTimeout(step, 800);
    })();
  });

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
| 1 | `new CreateLogCommand({ value: { name: "test" } })` | `commandNameU8` equals `Uint8Array([0])` |
| 2 | `new CreateLogCommand({ value: { name: "test" } })` | `commandValueU8` is UTF-8 encoding of `'{"name":"test"}'` |
| 3 | `new CreateLogCommand({ commandNameU8: Uint8Array([0xFF]), value: 42 })` | Provided `commandNameU8` is preserved (not overridden to `[0]`) |
| 4 | `new CreateLogCommand({ commandNameU8: Uint8Array([0]), commandValueU8: encoder.encode('{"a":1}') })` | Raw-bypass construction succeeds |
| 5 | `instance.value()` returns parsed JSON object | `{ a: 1 }` for encoded `'{"a":1}'` |
| 6 | `instance.setValue({ b: 2 })` then `instance.value()` | Returns `{ b: 2 }` |
| 7 | `instance.byteLength()` | Equals `2 + commandValueU8.byteLength` |
| 8 | `instance instanceof CreateLogCommand` | `true` |
| 9 | `instance instanceof JSONCommandType` | `true` |
| 10 | `instance instanceof CommandLogEntry` | `true` |
| 11 | `instance instanceof LogEntry` | `true` |

### Registry Test

| # | Test | Expected |
|---|---|---|
| 1 | `COMMAND_CLASS[CommandName.CREATE_LOG]` | `CreateLogCommand` constructor |
| 2 | `new COMMAND_CLASS[0]({ value: "{}" })` | `instanceof CreateLogCommand` is `true` |
| 3 | `CommandLogEntryFactory.fromU8(u8)` where commandName byte is `0x00` | `instanceof CreateLogCommand` is `true` |

### Edge Cases

| # | Scenario | Assertion |
|---|---|---|
| 1 | Constructor with no `commandNameU8` and no `value` and no `commandValueU8` | Throws `Error("JSONCommandType requires commandNameU8 and either commandValueU8 or value")` |
| 2 | `value()` on empty `commandValueU8` | Throws `SyntaxError` from `JSON.parse` |
| 3 | `setValue(undefined)` | Encodes `"undefined"` as JSON string via `JSON.stringify` |
| 4 | `commandValueU8` contains invalid UTF-8 | `value()` may produce replacement characters or throw depending on `TextDecoder` mode |

---

## 7. Source-Test Cross-References

### Test Coverage

| Test Spec | Path |
|---|---|
| CreateLogCommand.test.spec.md | `source/src/lib/entry/command/CreateLogCommand.test.spec.md` |
