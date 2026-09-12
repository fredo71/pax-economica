# Testing

Two modes, one surface.

- **Automatic** — runs with no human and no AI. Finds out that something which used to work has stopped.
- **AI-driven exploration** — write a small world, run it, read the output, decide what to try next. Finds out what the engine actually does, as opposed to what was assumed.

Exploration *discovers* a behaviour; promotion into the automatic suite means it is never rediscovered. The rule connecting them is §Promotion, and it is the one that keeps exploration from being a treadmill.

Both drive the engine through the CLI below. Nothing is testable by hand that the CLI cannot reach; nothing the CLI reaches is unavailable to the automatic suite.

## Why This Shape

The engine is a deterministic function from document to document. Two consequences decide everything else:

- state lives entirely in the document, so a fixture is just a file
- runs are deterministic, so expected output is also just a file, compared byte for byte — no tolerances, no flakiness

---

## The CLI

Project `PaxEngine.Cli`. Written `pax` below; during development that is `dotnet run --project PaxEngine.Cli --`.

| Command | Purpose |
|---|---|
| `pax load <world.json>` | parse, validate, report diagnostics. runs no ticks |
| `pax eval <expr> --world <w.json> [--as <node-id>]` | evaluate one expression, print the figure |
| `pax tick <world.json> [--ticks N]` | run N ticks, print the resulting document |
| `pax trace <world.json> [--ticks N] [--watch a.b,c.d]` | run N ticks, print a table, one row per tick |
| `pax diff <a.json> <b.json>` | structural diff — what a tick changed |
| `pax promote <world.json> --name <slug>` | turn a scratch world into a permanent scenario |

Later stages add `pax act`, `pax hooks`, `pax plan`.

`pax eval` is the highest-value command. It turns "the economy is wrong somewhere" into a question answerable in five seconds, against a static world, without running a simulation to infer it.

### Contract

- **stdout is the answer, and nothing else.** Deterministic, stable ordering, safe to redirect into a golden file.
- **stderr is diagnostics**, grouped by tier.
- **exit codes**: `0` success, `1` load error, `2` usage error. A run completing *with rejections* exits 0 — a rejection is not a failed run.
- `--seed N` overrides `WORLD_SEED` without editing the document.
- `--json` where a human-readable form is the default.

---

## Automatic Suite

`dotnet test`, xunit, in `PaxEngine.Tests`. Four kinds, cheapest first.

### Expression tables

The densest tests in the project, and the ones to write most of.

```csharp
[Theory]
[InlineData("2 + 3 * 4",  14)]
[InlineData("10 / 0",      0)]   // §2 DIV_EPSILON
[InlineData("7 % 3",       1)]
[InlineData("trunc(3.9)",  3)]
public void Arithmetic(string expr, double expected) =>
    Assert.Equal(expected, Eval(expr), precision: 9);
```

Every §2 operator gets a row. Every §3 coercion gets a row. A bug fix in an expression arrives with a new row — one line.

### Unit tests

Components with logic of their own and no need for a world: `VType.Parse` round-tripping, lexer edges, parser precedence and associativity, diagnostic tiering, number formatting.

### Golden scenarios

The backbone. One directory each:

```
tests/scenarios/01-compound-growth/
  world.json      input document
  cmd.txt         e.g.  trace --ticks 5
  expected.txt    exact expected stdout
  README.md       one paragraph: what this proves
```

A single theory enumerates every directory, runs `cmd.txt` against `world.json`, asserts stdout matches byte for byte. Adding a test is "add a directory with three files".

```
UPDATE_GOLDENS=1 dotnet test
```

**Read the diff before committing it.** An unreviewed golden update is how a regression becomes the expected behaviour — it is the one failure mode this style has. Treat it exactly as suspiciously as an edit to a hand-written assertion, because that is what it is.

The per-scenario `README.md` is not bureaucracy. In six months it is the only thing standing between you and deleting a mysterious failing scenario.

### Invariants

Checked after every tick of every scenario:

- no figure exceeds `MAX_VALUE` or falls below its declared bound
- every write is applied or accompanied by a `Rejection` — never silently lost
- no `NaN` or infinity survives a tick
- the same document run twice is byte-identical
- **serialise-reload equivalence**: `Run(doc, 2)` equals `Run(Run(doc, 1), 1)`
- every id in the registry resolves to exactly one node

Serialise-reload equivalence is the important one. A failure means state is living outside the document, which breaks save/load in the game months later and is brutal to diagnose from the symptom.

### Fixtures

`tests/fixtures/` holds small hand-written worlds — `minimal.json` (smallest document that loads, ~20 lines), `compound.json` (one actor, one province, compounding), one per stage as stages land.

`exemple.json` is an integration fixture. It proves the whole thing holds together and is useless for isolating a bug, because when it fails you cannot tell which of two hundred declarations did it. **Never edit it to make a test pass** — copy it, shrink the copy to the smallest document that still reproduces, commit that.

---

## AI-Driven Exploration

### The loop

```
1. write        scratch/probe.json     -- smallest world expressing the question
2. run          pax load scratch/probe.json
3. interrogate  pax eval "province.gdp * 1.05" --world scratch/probe.json
4. advance      pax trace scratch/probe.json --ticks 5
5. read, form the next hypothesis, go to 1
```

`scratch/` is git-ignored. Nothing in it is precious or reviewed; create and delete freely there without asking.

### What makes it work

- **small worlds** — twenty lines, one number under investigation. probing `exemple.json` teaches almost nothing because too much is moving
- **one variable at a time** — change one declaration, re-run, compare
- **`eval` before `tick`** — find a wrong expression in five seconds rather than inferring it from a diverging simulation
- **`diff` to see what a tick did** — better than reading two 41 KB documents
- **hand-check the arithmetic** — the engine agreeing with itself proves nothing

### Promotion

**When exploration finds something worth knowing — a bug, a surprise, an interaction that took effort to understand — promote it before moving on.**

```
pax promote scratch/probe.json --name 07-bounds-clamp-on-negative-growth
```

Creates the scenario directory, records current output as `expected.txt`, leaves the `README.md` sentence to write. One command, so it actually happens.

If a bug was found, promote the failing case **first**, watch it fail, then fix it. A test that has never failed is not yet known to test anything.

### Limits

Not a substitute for the automatic suite. "I ran it and the output looks correct" is evidence, not proof — one run, one world, judged by the same system that produced it. Exploration proposes; the suite decides.

---

## Running Everything

```
dotnet build                        # zero errors AND zero warnings
dotnet test                         # unit + expression + scenario + invariant
pax trace exemple.json --ticks 10   # integration smoke test, read by eye
```

These three, in this order, are the definition of done in docs/architecture.md.
