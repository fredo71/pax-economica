# Architecture

How the C# is organised, what depends on what, and in what order the engine gets built.

docs/engineSpec.md is the authority on *what behaviour means*. This document is the authority on *how the code is shaped*. Where they disagree about behaviour, the spec wins.

docs/codeStructure.md holds the contents — every project, file and class, and what calls what. This document holds the rules and the order they get built in.

## Current Stage

**Stage 0 — no engine code exists.** Next work is Stage 1 (Numbers), §Build Order below.

Update this section when a stage completes. It is the first thing read by anyone, human or agent, opening the project.

---

## Overview

The engine is one function. State and actions in, new state and whatever needs answering out.

```
Engine.Run(string state, string[] actions) -> EngineResult
EngineResult = { string State, Wake[] Wakes, Notice[] Notices }
```

It never pauses mid-tick. It finishes the tick, then reports what needs an answer — §5 line 515 calls phase 8 Wakes. An answer comes back as an action on the next call.

The AI sits outside. The engine cannot call a model, because it holds no reference to anything that could.

```
PaxEngine  <-- PaxSession --> PaxAi
                   ^
          +--------+--------+
          |                 |
   PaxEngine.Cli        PaxServer
```

| Project | Purpose |
|---|---|
| `PaxEngine` | the simulation. no network, no AI, no file reading |
| `PaxAi` | prompts, the model call, reading the reply |
| `PaxSession` | the loop: tick until a wake appears, ask, feed the answer back |
| `PaxEngine.Cli` | runs a scenario from the command line |
| `PaxServer` | the same loop, over HTTP |

Tests replace `PaxAi` with a fake that reads answers from a file, so no test touches the network.

---

## Layers

Dependencies point one way. A lower layer never references a higher one.

| Layer | Holds | Depends on |
|---|---|---|
| **Core** | diagnostics, values, the type language | nothing |
| **Expr** | lexer, parser, AST, evaluator | Core |
| **Model** | nodes, declarations, world, document load | Core, Expr |
| **Runtime** | tick, phases, writes, change | Core, Expr, Model |

Outside `PaxEngine`, the same rule runs across projects: `PaxSession` may reference `PaxEngine` and `PaxAi`; neither of those may reference anything. `PaxEngine` references only the .NET base library.

**The evaluator takes a world as a parameter; it is not part of the world.** A `partial class World` spanning both Model and Expr welds the two layers together and leaves neither testable alone.

If a layering violation is ever committed, split `PaxEngine` into per-layer assemblies so the compiler enforces what the rule could not.

---

## Layout

```
engine C#/
  PaxEngine.sln
  PaxEngine/                  the simulation
    Core/  Expr/  Model/  Runtime/
  PaxAi/                      prompts, model call, reading the reply
  PaxSession/                 the loop
  PaxEngine.Cli/              console host
  PaxServer/                  web api host
  PaxEngine.Tests/            xunit
  PaxSession.Tests/           xunit, fake AI
  PaxServer.Tests/            xunit, in-memory host
  tests/
    fixtures/                 small hand-written worlds
    scenarios/                golden-file scenarios
    answers/                  canned AI replies for the fake
  scratch/                    agent exploration, git-ignored
  docs/
  exemple.json
  CLAUDE.md
```

`PaxEngine.Cli` is its own project so the ability to run the engine does not live inside the test project, where nothing else can reach it.

What each file and class inside these is for: docs/codeStructure.md.

---

## The Hosts

### The engine is one method

```csharp
public static class Engine
{
    public static EngineResult Run(string state, string[] actions);
}

public sealed record EngineResult(string State, Wake[] Wakes, Notice[] Notices);
```

A document that cannot run throws (§15 line 1379). Refused writes and runtime notices come back in `Notices` (§15 lines 1397 and 1408). Running out of money is neither — the flow happens, the payer goes negative, a hook fires (§8 line 805).

### The loop

```
repeat:
    result = Engine.Run(state, actions)
    state  = result.State
    if no wakes and ticks remain:  actions = []  and go again
    if no wakes:                   stop
    actions = ai.Answer(result.Wakes)
```

`PaxSession` owns this. `PaxEngine.Cli` and `PaxServer` both call it. Tests call it with a fake AI.

### Commands return text, they do not print

```csharp
public sealed record CommandResult(int ExitCode, string Stdout, string Stderr);

public static class Commands
{
    public static CommandResult Run(string[] args);
}
```

`Commands` never touches `Console`. Two consequences, both load-bearing:

- tests exercise the real CLI path in-process — no process spawn, breakpoints work
- output composes: `pax tick` output is valid `pax tick` input

### Program.cs is the whole production entry point

```csharp
public static int Main(string[] args)
{
    var result = Commands.Run(args);
    Console.Out.Write(result.Stdout);
    Console.Error.Write(result.Stderr);
    return result.ExitCode;
}
```

---

## Build Order

From spec §16. Each stage is playable, or at least inspectable, before the next begins.

| # | Stage | Contains |
|---|---|---|
| 1 | **Numbers** | expressions, sets, functions, values, kinds, types, defaults, bounds, division, modulo, truncation, coercion, randomness, phase freezing. one province, one actor, an economy that compounds |
| 2 | **Holders and declaration** | the seven kinds, templates, find-or-create, the registry, reserved names (§14), runtime declaration |
| 3 | **Change** | transactions, two-sided flows, modifiers, instances, composition, permissions. test the phase barrier here |
| 4 | **Entities and the map** | types, blocks, movement, adjacency, encounters, emissions, destruction |
| 5 | **Actions and authority** | the vocabulary, `requires`, `approval`, implicit actions, the player's seat, ownership via `valid` |
| 6 | **Hooks** | `becomes`, `crosses`, latching, `respond`, the unpayable-transaction hook. nothing consumes them — log and read the log |
| 7 | **The AI** | director, actor AIs, the plan, waking, structural change, the inbox, the budget |
| 8 | **Contracts and adjudication** | depends on everything |
| 9 | **Spans** | commissioning, watching, halting |

Stage 6 before stage 7 is the load-bearing ordering decision — a wrong hook firing discipline is invisible once the AI is attached. Emissions sit in 4 rather than 3 because they need holders to place instances on.

---

## Stage 1 — Numbers

The only stage designed in detail here. Later stages get their section when reached.

### Components

| Layer | Type | Role |
|---|---|---|
| Core | `Diagnostics` | the three tiers, with a tick number per entry |
| Core | `VType` | §3 type language: `int`, `float`, `bool`, `string`, `ref(kind)`, `enum(name)`, `list<T>`, `map<K,V>`. the type carries its own target, so nothing else declares shape |
| Core | `Value` | a runtime figure. every accessor answers for every kind (§1) |
| Expr | `Lexer`, `Parser`, `Ast` | §2 grammar, precedence climbing |
| Expr | `Evaluator` | walks an AST against a context. reads, never writes |
| Model | `Node` | a holder: parent, id, backing JSON |
| Model | `ValueDecl` | one declared value: type, default, bounds, permissions, calculation |
| Model | `World` | loads the document, reads Settings/Tag/Enum/Function, builds the node tree, indexes declarations, parses every expression once at load |
| Model | `JsonRead` | JSON accessor helpers |
| Runtime | `Tick` | §5 phase order, including phase freezing |
| Cli | `load`, `eval`, `tick`, `trace` | docs/testing.md |

### Excluded

Entities, map, movement, actions, approval, hooks, AI, contracts, spans. `exemple.json` carries `Entities`, `Actions` and `Contract` keys — Stage 1 ignores them rather than half-implementing them. Ignoring a key is a `Log`, not a `Rejection`.

### Done when

- `pax load tests/fixtures/minimal.json` exits 0 with no diagnostics
- `pax trace tests/fixtures/compound.json --ticks 5` compounds, and the numbers are right by hand-check
- every §2 operator has a table row; every §3 coercion has a table row
- phase freezing has an explicit test — a calculation that would differ if the barrier leaked
- the same run twice is byte-identical

---

## Definition of Done, Any Stage

1. `dotnet build` — zero errors **and zero warnings**
2. `dotnet test` — green
3. the stage's behaviour is reachable from the CLI and has been run by hand at least once
4. at least one golden scenario covers the stage end to end
5. committed
6. the Current Stage section above is updated

Never start stage N+1 while stage N fails any of these.
