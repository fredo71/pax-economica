# Development Process

How a non-trivial change gets planned and executed: the vocabulary used to reason about classes and state, the phases a plan goes through, how the plan itself should be written, and how it gets executed once approved.

## When This Applies

Skip this process for changes that are obviously correct on sight — typo fixes, renames, a single-line correction to an already-diagnosed bug. Implement those directly.

Everything else goes through the phases below and ends as a plan presented to the user (via Plan Mode) for acceptance or rejection before any step begins.

---

## Vocabulary

### Step

A step is:
- one unit of work
- testable
- compiles
- represents exactly one functionality

**Example**: a feature that evaluates a modifier's expression and then applies the result to a value's effective reading is two steps, not one. Step 1 evaluates and exposes the figure, with nothing applied. Step 2 applies it.

### Class Purity

| Category | Criteria |
|---|---|
| **Pure data** | Stores and retrieves data; no other functionality. |
| **Pure function** | Reads and writes nothing outside its own parameters. |
| **Pure object** | Same arguments always produce the same outcome; relies only on memory owned by the class itself; is not pure data or a pure function. Equivalent to what the top-level CLAUDE.md calls a self-contained class. |
| **Unpure** | Doesn't meet any of the above. |

The evaluator is the case to watch: it must be a pure function of (expression, context, world). The moment it caches anything across calls it becomes unpure, and determinism stops being checkable.

### State Ownership

Every piece of state is in exactly one of these categories. Anything that doesn't fit is a design error, not a special case.

| Category | Criteria | Lifetime |
|---|---|---|
| **Document state** | Lives in the JSON document; survives serialisation. | The run, and every run loaded from the saved file. |
| **Derived state** | Rebuilt from the document at load (the node tree, the declaration index, parsed expression ASTs). | One load. Never written back. |
| **Phase state** | The frozen figures a phase reads, and the writes it has collected but not applied. | One phase of one tick. Discarded at the barrier. |
| **None** | A pure function's locals. | The call. |

Derived state is never the authority on anything. If a figure can be read from both the document and a derived index, the document wins and the index is a cache that must be rebuilt, not patched.

### Determinism Rules

- **The document is the entire state.** No static mutable field, no cache surviving a tick, nothing a save file would miss.
- **Same document plus same seed, byte-identical output.** On any machine, on any run.
- **Ordered iteration wherever order is observable.** A plain dictionary's enumeration order must never reach the output.
- **No ambient inputs.** No clock, no unseeded randomness, no hash codes used for ordering, no culture-sensitive formatting.
- **Serialise-reload equivalence.** Ticking twice in memory equals ticking, saving, reloading, ticking. A difference here means state escaped the document.
- **Clean output.** Nothing printed to stdout varies between runs — no timestamps, no durations, no absolute paths.

---

## Planning Phases

### 1. Objective

Reformulate the request back to the user in plain text before moving on, to confirm the actual target before any implementation thinking starts.

Name the spec sections the change is governed by. If the spec does not settle a question the change depends on, that is a question for the user, not a decision to make quietly — §18 lists what is deliberately still open.

### 2. Algorithm Selection

Weigh candidate algorithms against each other, in this order:
1. **Correctness against the spec** — the spec is the authority; an approach that is elegant but disagrees with it is rejected without further weighing.
2. **Minimum necessary performance** — assume a correct algorithm is efficient enough, and confirm that by measuring rather than optimizing upfront. Don't overcomplicate this step chasing performance that hasn't been shown to be a problem.

Where the spec defines behaviour by equation (bounds, coercion, division, composition), reproduce the equation in the plan rather than describing it in words.

### 3. Architecture

Decide which classes change or get added, using the purity categories above:
- Prefer pure data and pure functions.
- Where full purity isn't feasible, push as much of the class into pure data and pure functions as possible, and keep only what genuinely can't be pure in an object of its own.
- Avoid unnecessary class proliferation — split a task into multiple classes only when the pieces are genuinely separable, not for size alone. Each split is followed by the same question again: can this piece be made pure data or a pure function?
- **Minimal, purpose-stable entry points.** A class built around a calculation should expose one entry point where possible — or at most two, sharing the same purpose but reaching it by different methods (e.g. evaluating a cached AST and parsing-then-evaluating a literal source string), rather than multiple entry points with different purposes. An argument that's required internally but can be cheaply re-derived belongs *inside* the function, not passed in.
- State the layer each class belongs to, and confirm no dependency points upward.
- Classify any new state against the State Ownership table.

This phase produces a proposal, not an action — architecture changes are always confirmed with the user before being applied, per the top-level CLAUDE.md rule.

### 4. Testing

- **Prefer a golden scenario.** A directory under `tests/scenarios/` with a world, a command, and expected output proves the change end to end and keeps proving it. See docs/testing.md.
- **Expression-level changes get table rows**, not scenarios — one `[InlineData]` line per operator, coercion, or edge case is cheaper and more precise.
- **Say which invariant the change could break.** Determinism, serialise-reload equivalence, bounds, no-silent-write-loss. If the change can't break any of them, say that too.
- **Hand-check at least one number.** The engine agreeing with itself proves nothing; compute one expected figure on paper and compare.
- Where output isn't directly inspectable, add the smallest CLI surface that makes it so (a `--watch` column on `trace`, a new `pax` subcommand) rather than a temporary print that gets deleted.

### 5. Documentation

Identify here which docs/ files need updating, and which don't exist yet but should. The actual edit happens as the last step of execution, after every code step has passed.

A completed stage always updates the stage marker in docs/architecture.md.

---

## Plan Document Format

Prefer diagrams, equations, and lists over prose paragraphs — use prose only where the content genuinely doesn't reduce to any of those (e.g. the objective statement itself). Unless there's a good reason not to, a plan is laid out in this order:

1. **Objective** — plain text, with the governing spec sections named.
2. **Algorithms** — a short introduction to what each candidate does, then a step-by-step trace of the reasoning behind the one that was chosen. Equations wherever the spec states one, rather than describing the math in words.
3. **Architecture** — a diagram of the classes involved: their role, their layer, and which purity category each falls into. List the functions that will exist in code by name only (self-explanatory names, no bodies). Any new state, classified.
4. **Testing** — which scenarios and which table rows, what the expected output looks like, and which invariant is at risk.
5. **Steps** — short, referential entries pointing back to the sections above: which object gets implemented, and what happens once it exists (a test goes green, it gets wired into the tick, a CLI command exposes it).

---

## Execution

- Steps run in the planned order. Each is tested before moving to the next.
- Testing is done by the AI here — `dotnet build`, `dotnet test`, and the CLI are all runnable, so "it should work" is never a status report. Run it.
- Build warnings are failures. A step is not finished while the build is noisy.
- If a test fails, or an unanticipated problem surfaces mid-implementation that the plan didn't cover, stop and ask the user rather than improvising a fix.
- When a bug is found, the failing test is added first and observed failing, then fixed. A test that has never failed is not yet known to test anything.
- A golden file regenerated with `UPDATE_GOLDENS=1` has its diff read before being committed. An unreviewed golden update turns a regression into the new expected behaviour.
- Once every code step has passed, do the documentation step identified during planning.
- Compare the finished result against the original objective to check for drift before considering the plan complete.
- Check the finished code against the top-level CLAUDE.md rules (naming, comments, function and class structure, determinism, diagnostics, layering) before considering the plan complete — catch violations here rather than leaving them for the user to find.

The assembled plan is presented to the user via Plan Mode for acceptance or rejection before implementation begins.
