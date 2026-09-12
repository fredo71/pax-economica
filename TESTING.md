
# Pax Economica — Testing

Two modes, one shared surface.

- **Automatic testing** runs with no human and no AI in the loop. It is how you find
  out that something which used to work has stopped working.
- **Manual, AI-driven testing** is exploration: write a small world, run it, look at
  what came out, decide what to try next. It is how you find out what the engine
  actually does, as opposed to what you assumed.

They are not alternatives. Exploration is how a behaviour is *discovered*; promotion
into the automatic suite is how it is *never rediscovered*. The rule that connects them
is in §4.3 and is the most important paragraph in this document.

Both modes drive the engine through exactly one surface: the CLI in §2. Nothing is
testable by hand that is not reachable from the CLI, and nothing is reachable from the
CLI that the automatic tests cannot also call.

---

## 1. Why this shape

The engine is a deterministic function from a JSON document to a JSON document
(`ARCHITECTURE.md` §1.3, §1.4). That single fact decides the whole testing strategy:

- Because state lives entirely in the document, a test fixture is just a file.
- Because runs are deterministic, expected output can be a file too, compared byte for
  byte, with no tolerance fudging and no flakiness.

So the backbone of the automatic suite is golden-file scenarios, and the backbone of
exploration is "write a small JSON, run it, read the output". Same files, same command,
different intent.

---

## 2. The CLI — the shared surface

Project `PaxEngine.Cli`, invoked as `pax` below. During development that is
`dotnet run --project PaxEngine.Cli --`; set a shell alias so the commands in this
document can be typed literally.

### 2.1 Commands

| Command | Purpose |
|---|---|
| `pax load <world.json>` | Parse, validate, report diagnostics. Runs no ticks. |
| `pax eval <expr> --world <w.json> [--as <node-id>]` | Evaluate one expression against a world and print the figure. |
| `pax tick <world.json> [--ticks N]` | Run N ticks, print the resulting document to stdout. |
| `pax trace <world.json> [--ticks N] [--watch a.b,c.d]` | Run N ticks, print a readable table, one row per tick. |
| `pax diff <a.json> <b.json>` | Structural diff of two worlds — what a tick changed. |
| `pax promote <world.json> --name <slug>` | Turn a scratch world into a permanent scenario test (§4.3). |

Later stages add `pax act` (apply an action), `pax hooks` (dump hook firings), and
`pax plan` (AI director output). They are listed here so the shape is clear, not
because they are needed now.

`pax eval` is the highest-value command and the easiest to leave out. For a language
engine it is the tightest loop that exists: it turns "the economy is wrong somewhere"
into a question answerable in five seconds.

### 2.2 Contract

This is what makes the CLI usable by a test runner and by an agent at the same time:

- **stdout carries the answer**, and nothing else. Deterministic, diffable, stable
  ordering. Safe to redirect into a golden file.
- **stderr carries diagnostics**, grouped by the three tiers of `ARCHITECTURE.md` §1.2.
- **Exit codes**: `0` success; `1` load error (the document cannot run); `2` usage
  error (bad arguments). A run that completes with rejections still exits `0` — a
  rejection is not a failure of the run, and conflating them would make every
  permissions test look like a crash.
- `--seed N` overrides `WORLD_SEED` without editing the document.
- `--json` prints machine-readable output where a human-readable form is the default.

Two consequences worth stating explicitly, because they are easy to violate and
expensive to fix later: never print a timestamp, an elapsed duration, or an absolute
file path to stdout. All three break golden comparison, and the failure looks like a
logic bug rather than a formatting one.

---

## 3. Automatic testing

`dotnet test`, xunit, in `PaxEngine.Tests`. Four kinds, cheapest first.

### 3.1 Expression tests — table-driven

The densest tests in the project, and the ones to write most of. One row per case:
an expression, an expected figure.

```csharp
[Theory]
[InlineData("2 + 3 * 4",      14)]
[InlineData("10 / 0",          0)]   // §2 DIV_EPSILON behaviour
[InlineData("7 % 3",           1)]
[InlineData("trunc(3.9)",      3)]
public void Arithmetic(string expr, double expected) =>
    Assert.Equal(expected, Eval(expr), precision: 9);
```

Every operator in §2 gets a row. Every coercion in §3 gets a row. When a bug is found
in an expression, the fix is accompanied by a new row — that is non-negotiable and it
costs one line.

### 3.2 Unit tests

For components with real logic of their own and no need for a world: `VType.Parse`
round-tripping, lexer edge cases, parser precedence and associativity, diagnostic
tiering, number formatting.

### 3.3 Golden scenario tests

The backbone. One directory per scenario:

```
tests/scenarios/01-compound-growth/
  world.json      the input document
  cmd.txt         e.g.  trace --ticks 5
  expected.txt    exact expected stdout
  README.md       one paragraph: what this proves, and why it matters
```

A single xunit theory enumerates every directory under `tests/scenarios/`, runs the
command in `cmd.txt` against `world.json`, and asserts stdout equals `expected.txt`
byte for byte. Adding a test is therefore "add a directory with three files" — a task
an agent performs reliably, unlike "write a test that asserts the right thing".

Regenerate after an intended behaviour change:

```
UPDATE_GOLDENS=1 dotnet test
```

**Then read the diff before committing it.** An unreviewed golden update is how a
regression becomes the new expected behaviour, and it is the one failure mode this
style of testing has. Treat a golden diff with the same suspicion as a change to the
assertion in a hand-written test — because that is exactly what it is.

`README.md` in each scenario is not bureaucracy. In six months the only thing standing
between you and deleting a mysterious failing scenario is the sentence explaining why
it exists.

### 3.4 Invariant tests

Properties that must hold across any run, checked after every tick of every scenario:

- No figure exceeds `MAX_VALUE` or falls below its declared bound.
- Every write is either applied or accompanied by a `Rejection` — never silently lost.
- No `NaN` or infinity survives a tick.
- Running the same document twice produces byte-identical output (determinism, §1.4).
- Every id in the registry resolves to exactly one node.

These catch whole classes of bug that no individual scenario was written to look for.

### 3.5 Fixtures

`tests/fixtures/` holds small, hand-written worlds:

- `minimal.json` — the smallest document that loads. Twenty lines or so.
- `compound.json` — one actor, one province, an economy that compounds.
- one fixture per stage as stages land.

`exemple.json` is a 41 KB integration fixture, not a unit fixture. It is excellent for
proving the whole thing holds together and useless for isolating a bug, because when it
fails you cannot tell which of two hundred declarations did it. **Never edit
`exemple.json` to make a test pass** — copy it, shrink the copy to the smallest document
that still reproduces, and commit that.

---

## 4. Manual, AI-driven testing

This is the mode you described: write a JSON, run it, read the result, decide the next
step. It is where an agent is genuinely better than a test suite, because it can look at
unexpected output and form a new hypothesis — which a golden file cannot.

### 4.1 The loop

```
1. write        scratch/probe.json        — smallest world expressing the question
2. run          pax load scratch/probe.json
3. interrogate  pax eval "fra.money * 1.05" --world scratch/probe.json
4. advance      pax trace scratch/probe.json --ticks 5
5. read the output, form the next hypothesis, go to 1
```

`scratch/` is git-ignored. Nothing in it is precious, nothing in it is reviewed, and an
agent may create and delete files there freely without asking. That is the point: a
space where exploration costs nothing.

### 4.2 What makes this work

- **Small worlds.** A twenty-line document where one number is under investigation.
  Probing `exemple.json` teaches almost nothing, because too much is moving.
- **One variable at a time.** Change one declaration, re-run, compare.
- **`pax eval` before `pax tick`.** If an expression is wrong, find out in five seconds
  against a static world rather than by inferring it from a diverging simulation.
- **`pax diff` to see what a tick did.** Far better than reading two 41 KB documents.
- **Hand-check the arithmetic.** The engine agreeing with itself proves nothing. At
  least once per stage, compute the expected figure on paper and compare.

### 4.3 The promotion rule

**When exploration finds something worth knowing — a bug, a surprising behaviour, a
subtle interaction that took effort to understand — promote it into
`tests/scenarios/` before moving on.**

```
pax promote scratch/probe.json --name 07-bounds-clamp-on-negative-growth
```

This creates the scenario directory, records the current output as `expected.txt`, and
leaves you to write the `README.md` sentence. One command, so it actually gets done.

Without this rule, AI-driven testing is a treadmill: the agent rediscovers the same
behaviours every session and re-fixes the same bugs, because nothing it learned was
written down anywhere a test runner can see. With it, every exploration session
permanently widens the automatic suite.

If a bug was found, promote the failing case **first**, watch it fail, then fix it. A
test that has never failed is not yet known to test anything.

### 4.4 What this mode is not

It is not a substitute for §3. An agent reporting "I ran it and the output looks
correct" is evidence, not proof — it is one run, on one world, judged by the same
system that produced it. Exploration proposes; the automatic suite decides.

---

## 5. Running everything

```
dotnet build                        # zero errors AND zero warnings
dotnet test                         # unit + expression + scenario + invariant
pax trace exemple.json --ticks 10   # the integration smoke test, read by eye
```

Those three commands are the definition of done in `ARCHITECTURE.md` §5, in the order
they should be run. Any of them failing means the current stage is not finished, and
per the corollary there, means no work starts on the next one.
