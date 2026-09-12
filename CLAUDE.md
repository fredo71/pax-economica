
# Working on this project

A C# engine for Pax Economica: a deterministic simulation whose entire state is a JSON
document.

## Current position

**Stage 0 — no engine code exists yet.** The next work is Stage 1 (Numbers), specified
in `ARCHITECTURE.md` §3.

Keep this section accurate. It is the first thing to read and the first thing to update
when a stage completes.

## Documents

| File | Read it for |
|---|---|
| `engine-spec.md` | what the language *means* — the authority on behaviour |
| `ARCHITECTURE.md` | how the C# is organised, and the build order |
| `TESTING.md` | how to test, both automatically and by hand |
| `exemple.json` | a full worked document — integration fixture, not a unit fixture |

Read the relevant section of the spec before implementing a feature. It is 1,500 lines;
it is sectioned; do not read all of it, and do not implement from memory of it.

## Commands

```
dotnet build                        # must be zero errors AND zero warnings
dotnet test                         # unit + expression + scenario + invariant tests
dotnet run --project PaxEngine.Cli -- load  <world.json>
dotnet run --project PaxEngine.Cli -- eval  "<expr>" --world <world.json>
dotnet run --project PaxEngine.Cli -- trace <world.json> --ticks 5
UPDATE_GOLDENS=1 dotnet test        # regenerate goldens — then READ THE DIFF
```

## Rules

These are the ones that caused the previous attempt to fail. They are not style
preferences.

1. **Never write code for stage N+1 while stage N is red.** Build and test must be
   green before new work starts. The previous attempt produced ~2,000 lines of
   well-written code that never once compiled, because nothing checked.
2. **Run what you write.** A feature is not done until it has been exercised through
   the CLI and covered by a test. "It should work" is not a status report.
3. **Evaluation is total** — no throwing on bad input. Bad input produces a diagnostic
   at the right tier (`ARCHITECTURE.md` §1.1, §1.2).
4. **Determinism is mandatory.** No `DateTime.Now`, no unseeded `Random`, no
   order-dependent iteration over unordered collections, no culture-sensitive
   formatting (§1.4).
5. **Layers point one way**, and the evaluator is not part of the world (§1.5).
6. **No type name shadowed by a field name** (§1.6). This alone broke the last attempt.
7. **When you find a bug, add the failing test first**, watch it fail, then fix it
   (`TESTING.md` §4.3).
8. **Never edit `exemple.json` to make something pass.** Shrink a copy instead.

## Scratch space

`scratch/` is git-ignored and exists for exploration — write throwaway worlds there
freely, no need to ask. When something there proves worth keeping, promote it into
`tests/scenarios/` (`TESTING.md` §4.3) rather than leaving it in scratch.

## Scope

Do one stage at a time, and stop at its boundary. If a stage turns out to need
something from a later stage, say so rather than quietly pulling the later stage
forward — the build order in `ARCHITECTURE.md` §4 is deliberate, and stage 6 before
stage 7 in particular is load-bearing.
