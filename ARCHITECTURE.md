
# Pax Economica — Engine Architecture

`engine-spec.md` says *what the language means*. This document says *how the C# is
organised and in what order it gets built*. When the two disagree about behaviour,
the spec wins; when they disagree about code structure, this document wins.

It is deliberately short. The detailed design covers Stage 1 only — later stages get
a paragraph each and are designed properly when they are reached, because the
architecture of the AI director is not knowable before the evaluator compiles.

---

## 1. Principles

These hold everywhere, in every stage. They are the rules an agent is expected to
follow without being reminded.

### 1.1 Evaluation is total

Spec §1 requires every operation to be defined. No expression evaluation path throws.
Reading a missing value yields the type's default; dividing by zero yields the
`DIV_EPSILON` behaviour; a malformed reference yields a diagnostic and a null figure.

`throw` is reserved for *programmer* error — a broken invariant inside the engine
itself. It is never how the engine reports bad input. Bad input is a diagnostic.

### 1.2 Diagnostics have three tiers, and they mean different things

| Tier | Meaning | Effect |
|---|---|---|
| `LoadError` | the document cannot be run | abort the scenario |
| `Rejection` | one write was refused (permissions, bounds, type) | drop that write, continue the tick |
| `Log` | something happened worth seeing | nothing |

Collapsing these is the most common way to make a simulator undebuggable. A rejection
that aborts the run turns a survivable data error into a dead scenario; a load error
that only logs produces a world that runs and is silently wrong.

Logs are capped, so a pathological document cannot exhaust memory through logging alone.

### 1.3 The document is the entire state

Load JSON, mutate, serialise JSON. There is no engine state outside the document:
no static mutable fields, no caches that survive a tick, nothing a save file would miss.

This is not purity for its own sake. It is what makes every test in `TESTING.md`
possible — you cannot snapshot-test a world whose real state lives in a private field.

### 1.4 Runs are deterministic

Same document plus same `WORLD_SEED` produces byte-identical output, on any machine,
on any run.

Concretely this forbids: `DateTime.Now`, unseeded `Random`, `GetHashCode` used for
anything ordered, iteration over a plain `Dictionary` where order affects results, and
culture-sensitive number formatting. Use ordered collections wherever iteration order
is observable, and format with `InvariantCulture` always. Keep `InvariantGlobalization`
switched on in the csproj.

Determinism is a testing strategy, not a nicety: it is what lets a golden file be an
assertion rather than a suggestion.

### 1.5 Layers point one way

```
Core      diagnostics, values, types          — depends on nothing
Expr      lexer, parser, AST, evaluator       — depends on Core
Model     nodes, declarations, world, load    — depends on Core, Expr
Runtime   tick, phases, writes, change        — depends on Core, Expr, Model
Cli       argument parsing, output formatting — depends on all
```

A lower layer never references a higher one.

**The evaluator takes a world as a parameter; it is not part of the world.** The
previous attempt made `World` a `partial class` spread across `Model/World.cs` and
`Expr/Evaluator.cs`, which welded the two layers together and meant neither could be
tested or reasoned about alone. Do not reintroduce this. `partial` is acceptable only
to split one large class *within a single layer*, and even then a smaller class is
better.

### 1.6 A type name never collides with a field name in scope

The previous attempt had a static helper class `Doc` and a field `World.Doc`. Inside
`World`, the field shadowed the class, so every call had to be written
`PaxEngine.Doc.Obj(...)`. It was written that way in 34 places and missed in 3 — which
is most of what stopped the project compiling.

Helper classes get names that cannot be shadowed: `JsonRead`, not `Doc`.

### 1.7 Files are small and named for one concept

One primary type per file, the file named after it. If a file passes roughly 400 lines,
it is describing more than one idea and should be split.

---

## 2. Layout

Three projects. Not more — layering inside the library is a documented rule, not a
compiler-enforced one, until it stops being obeyed.

```
engine C#/
  PaxEngine.sln
  PaxEngine/                  class library — the engine
    Core/
    Expr/
    Model/
    Runtime/
  PaxEngine.Cli/              console app — the harness surface
  PaxEngine.Tests/            xunit — automatic tests
  tests/
    fixtures/                 small hand-written worlds
    scenarios/                golden-file scenarios
  scratch/                    agent exploration, git-ignored
  engine-spec.md
  exemple.json
  ARCHITECTURE.md
  TESTING.md
  CLAUDE.md
```

`PaxEngine.Cli` exists as its own project for one reason: the ability to run the engine
must not live inside the test project, where nothing else can reach it. Everything an
agent or a human does to the engine by hand goes through this CLI.

If a layering violation is ever committed, split `PaxEngine` into `PaxEngine.Core`,
`PaxEngine.Expr` and so on, so the compiler enforces what the rule could not.

---

## 3. Stage 1 — Numbers

From spec §16: *"Expressions, sets, functions, values, kinds, types, defaults, bounds,
division, modulo, truncation, coercion, randomness, phase freezing. One province, one
actor, an economy that compounds. No AI, no entities, no map."*

### 3.1 What gets built

**Core**
- `Diagnostics` — the three tiers of §1.2, with a tick number on each entry.
- `VType` — the §3 type language: `int`, `float`, `bool`, `string`, `ref(kind)`,
  `enum(name)`, `list<T>`, `map<K,V>`. The type carries its own target, so there is no
  separate `references` field.
- `Value` — a runtime figure. Every accessor answers for every kind (§1.1).

**Expr**
- `Lexer` producing tokens; `Parser` producing an `Ast`. Precedence climbing; the
  grammar is §2.
- `Evaluator` — walks an AST against an evaluation context. Pure with respect to the
  world: it reads, it does not write.

**Model**
- `Node` — a holder in the document tree, with its parent, id, and backing JSON.
- `ValueDecl` — one declared value: type, default, bounds, permissions, calculation.
- `World` — loads the document, reads `Settings` / `Tag` / `Enum` / `Function`, builds
  the node tree, indexes declarations, and parses every expression once at load.
- `JsonRead` — the JSON accessor helpers (see §1.6 on the name).

**Runtime**
- `Tick` — the §5 phase order, including **phase freezing**: a calculation reads the
  figures as they stood at the start of the phase, not as they are being rewritten.

**Cli**
- `load`, `eval`, `tick`, `trace`. Defined in `TESTING.md`.

### 3.2 What is deliberately excluded

Entities, the map, movement, actions, approval, hooks, the AI, contracts, spans.
`exemple.json` contains `Entities`, `Actions` and `Contract` keys — Stage 1 ignores
them rather than half-implementing them. Ignoring a key is a `Log`, not a `Rejection`.

### 3.3 Done when

- `pax load tests/fixtures/minimal.json` exits 0 with no diagnostics.
- `pax trace tests/fixtures/compound.json --ticks 5` shows an economy compounding, and
  the numbers are right when checked by hand.
- Every §2 operator has an expression test; every §3 type has a coercion test.
- Phase freezing has an explicit test — a calculation that would give a different
  answer if the barrier leaked.
- The same run twice is byte-identical.
- `dotnet test` is green and committed.

Only then does Stage 2 begin.

---

## 4. Later stages

Sketches. Each gets a real design section here when it is reached.

**2 — Holders and declaration.** The seven kinds, templates, find-or-create, the
registry, reserved names (§14), runtime declaration. Confirm that a value declared on
one actor exists nowhere else.

**3 — Change.** Transactions, two-sided flows, modifiers, instances, composition,
permissions. A modifier placed by hand visibly alters an effective reading and vanishes
cleanly when removed. The spec calls out testing the phase barrier here specifically.

**4 — Entities and the map.** Types, blocks, movement, adjacency, encounters,
emissions, destruction. First stage that looks like a game.

**5 — Actions and authority.** The vocabulary, `requires`, `approval`, implicit
actions, the player's seat, ownership via `valid`. Playable against a static world.

**6 — Hooks.** `becomes`, `crosses`, latching, `respond`, the unpayable-transaction
hook. Nothing consumes them yet — log them and read the log. A wrong firing discipline
is invisible once the AI is attached, and very hard to find afterwards.

**7 — The AI.** Director, actor AIs, the plan, waking, structural change, the inbox,
the budget.

**8 — Contracts and adjudication.** Depends on everything.

**9 — Spans.** Commissioning, watching, halting. Last: it is a loop around a working
game and only makes sense once a tick is cheap.

Spec §16 marks **stage 6 before stage 7** as the load-bearing ordering decision.
Emissions sit in 4 rather than 3 because they need holders to place instances on.

---

## 5. Definition of done, for any stage

A stage is finished when all five hold:

1. `dotnet build` produces zero errors **and zero warnings**.
2. `dotnet test` is green.
3. The stage's behaviour is reachable from the CLI and has been run by hand at least once.
4. At least one golden scenario covers the stage end to end.
5. It is committed.

Not one of these was true of the previous attempt at any point. That is the whole
reason it produced roughly 2,000 lines of well-written code that had never executed.

**Corollary, and the single most important rule here: never write the code for stage
N+1 while stage N is red.** Broken-and-growing is the state to avoid; everything above
is machinery for noticing you are in it.
