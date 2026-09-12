# Code Structure

Every project, file and class: what it is for, which spec section it implements, and what calls it.

`docs/architecture.md` holds the layering rules and the build order. This document holds the contents. Section numbers refer to `docs/engineSpec.md`.

---

## Projects

| Project | Kind | Purpose |
|---|---|---|
| `PaxEngine` | library | the simulation. no network, no AI, no file reading |
| `PaxAi` | library | everything that talks to a model: prompts, the call, reading the reply |
| `PaxSession` | library | the loop — tick until something needs answering, ask, feed the answer back |
| `PaxEngine.Cli` | console | runs a scenario from the command line |
| `PaxServer` | web api | the same loop, over HTTP |
| `PaxEngine.Tests` | tests | the engine alone |
| `PaxSession.Tests` | tests | the loop, with a fake AI |
| `PaxServer.Tests` | tests | the API in memory, with a fake AI |

```
PaxEngine  <-- PaxSession --> PaxAi
                   ^
          +--------+--------+
          |                 |
   PaxEngine.Cli        PaxServer
```

`PaxEngine` references nothing but the .NET base library. Nothing it does can reach the network, read a file, or call a model. That is what makes a run repeatable.

---

## The entry point

One public method. Everything else in `PaxEngine` is internal to it.

```csharp
public static class Engine
{
    public static EngineResult Run(string state, string[] actions);
}

public sealed record EngineResult(string State, Wake[] Wakes, Notice[] Notices);
```

Same document and same `WORLD_SEED` gives the same result every time.

### Wake

Something that needs an answer from an actor. §5 line 515 calls phase 8 Wakes and groups all three under that name.

| Kind | Raised by | Spec |
|---|---|---|
| `HookFired` | a `becomes` or `crosses` condition turned true | §12.4 |
| `Adjudication` | an action whose `requires` failed | §11.2 |
| `Approval` | an action naming actors whose consent is needed | §11.1 |

Carries which actor is being asked, which holder it concerns, and why.

### Notice

Something that happened and is worth reporting. Neither stops the run.

| Kind | Meaning | Spec |
|---|---|---|
| `Rejection` | the write did not happen; everything else continued | §15 line 1397 |
| `Log` | it happened, nothing stopped | §15 line 1408 |

A document that cannot run at all throws instead — §15 line 1379.

Running out of money is not a rejection. §8 line 805: the flow still happens, the payer goes negative, a hook fires.

---

## The loop

```
repeat:
    result = Engine.Run(state, actions)
    state  = result.State
    if no wakes and ticks remain:  actions = []  and go again
    if no wakes:                   stop
    actions = ai.Answer(result.Wakes)
```

The engine never pauses mid-tick. It finishes, then reports. An answer arrives as an action on the next call.

`PaxEngine.Cli` and `PaxServer` both run this. Tests run it with a fake that reads answers from a file, so nothing touches the network.

---

## PaxEngine

### Root

| File | Purpose | Calls |
|---|---|---|
| `Engine.cs` | the single public entry. loads, ticks once, serialises | `Loader`, `Tick`, `Serialize` |
| `EngineResult.cs` | pure data: new state, wakes, notices | — |
| `Wake.cs` | one thing needing an answer (§5 line 515) | — |
| `Notice.cs` | one rejection or log (§15) | — |
| `Serialize.cs` | `World` back to a JSON string | `Model/Document` |

### Core — depends on nothing

| Class | Purpose | Spec |
|---|---|---|
| `Diagnostics` | collects notices during a run, with a cap so logging cannot exhaust memory | §15 |
| `DeclaredType` | the type language: `int`, `float`, `bool`, `string`, `ref(kind)`, `enum(name)`, `list<T>`, `map<K,V>`. carries its own target, so nothing else declares shape | §3 |
| `Value` | a runtime figure. every accessor answers for every kind — no read is undefined | §1 line 26 |
| `Constants` | `DIV_EPSILON`, `MAX_VALUE`, `WORLD_SEED`, `wake_budget`, `liveliness`, read from the document's `Settings` | §15 lines 1366-1373 |
| `Chance` | `random()` as a hash over `(seed, holder, path, tick, call site)` — never a stream, so a formula read twice in one phase gives the same figure | §2 line 124, §1 line 22 |

### Expressions — depends on Core

| Class | Purpose | Spec |
|---|---|---|
| `Token` | one lexical item | §2 |
| `Lexer` | text to tokens | §2 |
| `SyntaxNode` | the node types: literal, name, unary, binary, member, call, set pipeline | §2 |
| `Parser` | tokens to `SyntaxNode`. precedence exactly C#'s: `not` > `* / %` > `+ -` > `< > <= >=` > `== !=` > `and` > `or` | §2 line 100 |
| `Evaluator` | walks a `SyntaxNode` against a context and a world. reads, never writes | §2 |
| `Functions` | the closed function set — arithmetic, comparison, logical, `if/min/max/clamp/abs/sign/trunc`, `random`, `as/where/apply`, `sum/count/avg/min/max`, roots, `adjacent`, `provinces_within`, `has`, `get`, `flatten` | §2 lines 37-48 |

`Evaluator` takes the world as a parameter. It is never part of the world, and it holds nothing between calls.

There is no indexing, `first`, `last` or `sort`. §2 line 53 — adding one breaks frozen phases the same day.

### Model — depends on Core, Expressions

| Class | Purpose | Spec |
|---|---|---|
| `Document` | the parsed JSON. knows the fixed skeleton: odd depths are keywords, even depths are names | §17 lines 1464-1471 |
| `JsonFields` | key lookup and typed reads off a JSON object | — |
| `Holder` | one holder: its kind, id, parent, and backing JSON | §6 |
| `HolderKind` | the seven: province, actor, entity, modifier instance, contract, world, institution | §6 line 579 |
| `ValueDeclaration` | one declared value: kind, type, expression, bounds, permissions. instances carry theirs in full rather than pointing at a template | §3, §17 line 1490 |
| `World` | the loaded document: holder tree, declaration index, parsed expressions | — |
| `Loader` | document to `World`. raises the load errors of §15 and creates the `empty` actor that owns unowned provinces | §15 line 1379, §6 line 583 |
| `Registry` | id to node. ids come from scanning the document, never a counter, so a reload produces the same ids | §5 line 571 |

Expressions are parsed once, at load. Nothing re-parses during a tick.

### Runtime — depends on Core, Expressions, Model

| Class | Purpose | Spec |
|---|---|---|
| `Tick` | the eight phases in order: Economy, Movement, Encounters, Updates, Emissions, Destruction, Hooks, Wakes | §5 lines 507-515 |
| `Phase` | the unit of frozen state. every read inside comes from entry; writes land at the boundary | §5 line 518, §1 line 20 |
| `WriteSet` | accumulates writes. numeric ones sum as deltas; ref, enum, bool and string assign, and two conflicting assignments mean no write lands | §5 lines 535-552 |
| `Permissions` | every write passes the target's own `writable_by` and `valid`. nothing else touches anything | §1 line 16, §8 |
| `Modifiers` | placing instances and composing them onto a value's effective reading | §9.3, §4 |
| `Hooks` | `becomes` and `crosses`, and the latch that stops a fired hook repeating while its condition holds | §12.4 lines 1212-1229 |
| `Wakes` | collects what phase 8 reports: fired hooks, adjudications, approvals | §5 line 515, §12.6 |
| `Actions` | invoking an action: evaluate `requires`, run effects, resolve `arg` paths against the effect's root | §11.1 |

There is no delete. A holder ends by a condition it declared itself — §1 line 18, §10.6.

---

## PaxAi

Everything non-repeatable lives here.

| Class | Purpose |
|---|---|
| `IAiClient` | one method: given wakes, return actions |
| `ModelClient` | the real call. which model is not yet decided |
| `FakeAiClient` | returns canned answers from a folder. used by every test |
| `PromptBuilder` | a wake plus the actor's own view of the world, to a prompt |
| `AnswerParser` | model text to actions, rejecting anything malformed |

`PromptBuilder` must respect §12.2 — an actor sees its own plan and inbox, not another actor's.

---

## PaxSession

| Class | Purpose |
|---|---|
| `Session` | the loop above. takes an `IAiClient`, so tests pass the fake |
| `SessionState` | the world document, plus the AI's text kept separately |

`SessionState` keeps them apart because §17 line 1496 says an actor's plan and inbox live alongside a save, never inside the world document. Nothing in the rules reads them, so they are not world state.

---

## PaxServer

| Piece | Purpose |
|---|---|
| `Program.cs` | host setup, dependency wiring |
| session endpoints | create a session, advance it, read it |
| `ISessionStore` | where sessions live. memory in tests, something durable in production |

The server owns HTTP, storage and configuration. It owns no simulation rules. Anything it computes about the world is a bug — that logic belongs in `PaxEngine`, or the CLI cannot reach it.

---

## Tests

| Project | Runs | Network |
|---|---|---|
| `PaxEngine.Tests` | expression tables, unit tests, golden scenarios, invariants | no |
| `PaxSession.Tests` | the loop with `FakeAiClient`, including a wake answered and fed back | no |
| `PaxServer.Tests` | the API in memory with `FakeAiClient` | no |

All three run on GitHub with no secrets. Testing against a real model is done by hand and never in the automatic suite.

See `docs/testing.md`.

---

## Rules that must hold

1. `PaxEngine` names no HTTP type, no model, and reads no file.
2. Dependencies point one way. `Core` <- `Expressions` <- `Model` <- `Runtime`, and nothing points back.
3. `Engine.Run` is the only public method into the simulation.
4. The same document and seed gives the same result, and ticking twice equals ticking, saving, reloading, ticking.
5. The AI is asked only at phase 8, never mid-tick.
