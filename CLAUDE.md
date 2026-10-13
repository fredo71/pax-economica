introduction : this project is a simulation engine in C# for Pax Economica. the entire state of a run is one JSON document -- the engine loads it, ticks it, and writes it back out.

you can find in the docs for the following:
  - docs/paxServer.md : the web page -- a map anyone with the link can open. the current work: start here. its "Which docs still apply" table says which of the docs below are on hold
  - docs/engineSpec.md : the language itself -- expressions, values, holders, writes, change, entities, agency, the AI, spans. the authority on what any behaviour *means*
  - docs/architecture.md : layering, the projects and how they fit together, the loop that runs ticks and asks the AI, build order, and which stage the engine is currently at
  - docs/engineArchitecture.md : how the engine works -- the stages from text to next document, the factories that validate while building, the expression compiler, the tick, and the decisions behind each
  - docs/codeStructure.md : every project, file and class -- what each one is for, which spec section it implements, and what calls it
  - docs/testing.md : the cli surface, the automatic suite (expression tables, unit, golden scenarios, invariants), the AI-driven exploration loop, and the promotion rule that connects them
  - docs/developmentProcess.md : how a non-trivial change is planned and executed -- step definition, data structure and logic vocabulary, determinism guardrails, the objective/algorithm/architecture/testing/documentation planning phases, plan document format, and execution/escalation rules
  - exemple/exemple.json : a full worked document. integration fixture, never a unit fixture

## Rules to Follow

### Priority

  - understandable comes first, and understandable means simple and self-contained. every other rule in this file serves it; when one of them makes the code harder to follow, the code wins.
  - write the plain, direct version first. split, extract or generalise only when a reader would otherwise struggle.
  - the reader is told things through names, not comments: a function whose name says it, a variable, a constant. a comment is the last resort.

### General

  - before writing any new helper/utility code (reading a JSON key, formatting a figure, parsing a type, emitting a diagnostic), check whether the project already has a shared location for that kind of task and reuse/extend what's there instead of duplicating it inline -- e.g. PaxEngine/Core/ holds everything every layer depends on (diagnostics, values, the type language); this generalizes to any other shared-responsibility folder.
  - read the relevant section of docs/engineSpec.md before implementing a feature. it is sectioned; do not read all of it, and do not implement from memory of it.
  - if documents are out of date, ask to update them

### Naming

  - the code is self-commenting through its names: variables, functions, classes and constants say what they are for
  - explicit does not mean long -- variable names should be as short as possible while staying self-explanatory, the same short-but-self-explanatory principle that applies to function names (e.g. DeclaredType, not DeclaredValueTypeAsParsedFromDocument)
  - name a variable or function by its purpose -- what it does or represents in the logic -- not by its technical/mechanical nature (its type, which JSON key it was read from, or how it's implemented). a long name that just restates the technical source (e.g. calculatedValueStringFromJsonObject) is not better than a short meaningless one (e.g. val) -- both fail to say what the value is for. prefer names like effectiveReading/baseFigure over value1/value2 when a value is one of several conceptually distinct roles.
  - variables must never be a single letter or a short letter cluster, even as part of a compound name (e.g. v, vPrev, vNext are not acceptable) -- spell out what the variable actually represents (e.g. frozenFigure, writtenFigure)
  - the same rule applies to every name in the project, not just variables: classes, types, methods, files and folders. no truncation and no acronyms -- write EnumDeclaration not EnumDecl, Expressions/ not Expr/, SyntaxNode not Ast, DeclaredType not VType, DocumentPath not DocPath. a reader who has not seen the word before must be able to say it out loud and guess what it is.
  - an acronym is only allowed when the user already uses it in conversation about this project (AI, JSON, CLI). a name invented for the code never gets one.
  - a function is an action, so its name starts with a verb (CheckColour, IsNationTag); classes, types and variables are nouns. a noun-named method (NationTag) reads as the thing itself.
  - a function that only answers yes or no returns a bool and is named Is... or Has...; it neither returns the value it judged nor throws. a function that refuses by throwing is named for that (Require..., Confirm...), so the reader knows where the failure comes from.
  - a type name is never shadowed by a field name in scope. a static helper class `Doc` alongside a field `World.Doc` forces every call to be written `PaxEngine.Doc.Obj(...)` and silently breaks the moment one is missed. give helper classes names that cannot be shadowed (e.g. JsonFields).

### Readability (every language)

  - every rule in this file applies to every language in the repo -- C#, TypeScript, and local scripts alike
  - one operation per line: give each intermediate result a named variable instead of chaining lookups, calls and object-building into one expression. the names are the explanation (e.g. `bool wasStillPending = pending.Remove(item);` then `if (!wasStillPending && ...)`). a single lookup that is immediately set counts as one operation and may stay on one line (`findElement("owner-name").textContent = owner.name`): splitting it adds a line without explaining anything
  - no magic values inline: a number, colour or string that means something gets a named constant (e.g. `MinimumInstanceCapacity = 64`, not a bare 64). a value already labelled by the key it sits under (`weight: 1` inside a named style object) counts as named
  - show types the reader cannot see at a glance. in TypeScript, annotate every declaration whose type is not obvious from its own line, and never let `any` spread: check untyped data (parsed JSON) where it arrives and give it a real type there
  - exception, TypeScript: a condition saved to narrow a type (`const hasActors = isRecord(actors);` then `if (hasActors) ...`) takes no type annotation. writing `: boolean` on it silently stops TypeScript narrowing through it, and the code then needs a cast to compile

### Comments

  - comments make code harder to follow, so a comment is the last resort. when a block needs explaining, give it a function whose name says it (see Function and Class Structure) instead of writing a comment above it.
  - write a comment only when no name can carry the knowledge. every sentence in it is one of two things: WHY it is this way (a constraint, a trap, a rejected alternative), or WHAT IF (a side effect or failure behaviour, e.g. "returns the default figure if unset, and logs").
  - never a comment that says WHAT the code does (the name's job) or HOW (the code's job), never one that repeats what a name already says, and never one about something the code does not actually do.
  - four lines is the cap for a comment block. going past it means the extra lines are a WHY that would otherwise cost someone real debugging time -- if they are not, cut them.
  - a comment that explains a rule of the language cites the spec section rather than restating it (e.g. "§5: reads the frozen figure, not the one being written"). the spec is the authority; a paraphrase in a comment goes stale silently.
  - design history belongs in docs/, not in a function header. what was tried, what was rejected, what was confirmed empirically -- that goes in the matching docs/ file, with at most a one-line pointer from the code. in a comment it has no natural stopping point and grows without bound.

### Function and Class Structure

  - a function exists to explain. when a block needs explaining to the reader, give it a function whose name says it, short but self-explanatory (TargetIsWritable, not CheckWhetherTargetValueCanBeWrittenByThisActor). the parent then reads as a list of named steps.
  - no function for any other reason: not to avoid repeating a few lines, not to make something shorter, not to follow a pattern. every extra function is a place the reader has to jump to. repeating a few simple lines is fine; extract only when the copies hold real logic that could drift apart.
  - a function does one job its name states. before adding logic to an existing function, check it still matches the name -- a reader trusts the name. a function that only applies a computed figure does not also evaluate the expression that produced it.
  - do not mix levels in one function: a tick phase and a string-to-double parse do not belong together.
  - functions take as few arguments as possible, so they are as easy to understand as possible. in order of preference: read a field the class already holds, so no argument at all; otherwise one data object for what genuinely comes from outside; loose parameters only when neither applies. a new value travels inside the data object already being passed, not as a loose parameter beside it. an argument that can be cheaply derived from another is not passed.
  - a data structure holds its own data and only that: it reads it, writes it, iterates over it and copies it. whatever decides or calculates lives in a separate class that takes the data structure as input. one exception: a constructor may check that its data is coherent, because that decides whether the object can exist.
  - a class that owns its state and the logic over it (a tick runner with its current tick) is fine as it is; the split above is for data structures that other code passes around.
  - organize code like a tree: entry point at the top, followed by the functions it calls, followed by the functions those call, etc. this allows reading top-to-bottom without jumping around -- the control flow becomes visible at a glance.
  - the tree spans files, not just one file: the entry point reads as a short list of steps, one call per module (e.g. main.ts: fetch, buildGame, drawGame). each module has one entry function that does its whole job, including its own checks and setup -- buildGame validates its own input, drawGame creates the map and its click handlers. the caller never assembles a module's internals.
  - no hidden side effects to coordinate code. prefer a check that only reads (does the clicked element carry the "province" class?) over switching off library behaviour (stopPropagation, bubblingMouseEvents) or a flag one handler sets and another reads and resets.
  - rebuild everything from scratch until that is measurably too slow. updating only what changed means keeping the previous state and handling every kind of change; do it only when a real need shows up.

  Example -- the names carry the explanation; the notes on the right are only about why each takes the argument it takes:

  int currentTick;

  void RunTick(Document document)
  {
    FreezeFigures();
    ChangeSet changes = CollectChanges();
    ApplyChanges(changes);
    WriteBack(document);
    AdvanceTick();
  }

  void FreezeFigures() { ... }                     // reads the class's own data: no argument
  ChangeSet CollectChanges() { ... }               // its result is the only way to reach ApplyChanges
  void ApplyChanges(ChangeSet changes) { ... }     // one data object, not loose parameters
  void WriteBack(Document document) { ... }        // the document can only come from outside
  void AdvanceTick() { currentTick++; }

### Determinism and State

  - the document is the entire state. no static mutable fields, no cache that survives a tick, nothing a save file would miss -- if state lives outside the document, save/load silently diverges from a live run and nothing in the test suite can see it.
  - same document and same WORLD_SEED produces byte-identical output, on any machine, on any run
  - forbidden, because each one breaks that: DateTime.Now, unseeded Random, GetHashCode used for anything ordered, iteration over an unordered collection where the order is observable in the output, culture-sensitive number formatting (use InvariantCulture always)
  - ticking twice in memory must equal ticking once, serialising, reloading, and ticking again. if those differ, state is living outside the document.
  - nothing printed to stdout may vary between runs -- no timestamps, no elapsed durations, no absolute paths. golden comparison depends on it, and the failure looks like a logic bug rather than a formatting one.

### Diagnostics and Failure

  - evaluation is total (§1) -- no expression path throws. a missing value yields the type's default, a malformed reference yields a diagnostic and a null figure.
  - `throw` is reserved for programmer error, meaning a broken invariant inside the engine itself. it is never how the engine reports bad input. bad input is a diagnostic. the one exception is loading: a document that cannot be loaded is a LoadError, and a loader with nothing to continue with may throw to refuse it (the server's constructors do).
  - the three tiers are not interchangeable:

| tier | meaning | effect |
|---|---|---|
| LoadError | the document cannot be run | abort the scenario |
| Rejection | one write was refused (permissions, bounds, type) | drop that write, continue the tick |
| Log | something happened worth seeing | nothing |

  - a run that completes with rejections is a successful run -- exit code 0. conflating a rejection with a failure makes every permissions test look like a crash.
  - logs are capped, so a pathological document cannot exhaust memory through logging alone

### Layering

  - dependencies point one way, and a lower layer never references a higher one:

```
Core      diagnostics, values, types          -- depends on nothing
Expressions      lexer, parser, syntax tree, evaluator       -- depends on Core
Model     nodes, declarations, world, load    -- depends on Core, Expressions
Runtime   tick, phases, writes, change        -- depends on Core, Expressions, Model
Cli       argument parsing, output formatting -- depends on all
```

  - the evaluator takes a world as a parameter; it is not part of the world. do not weld the two together with a `partial class` spanning both layers -- neither can then be tested or reasoned about alone.
  - `partial` is acceptable only to split one large class within a single layer, and a smaller class is better
  - simulation logic never lives in Cli. a command parses arguments, reads files, calls the engine, formats output -- if it needs more than about 30 lines of real work, that work belongs in PaxEngine, or the game will not be able to reach it.

### Process

  - always give your plan before any change -- except changes trivial enough to be obviously correct on sight (a typo fix, a rename, a single-line correction to an already-diagnosed bug), which can be implemented directly. see docs/developmentProcess.md for what a plan covers.
  - before making any architecture change, always ask first -- do not break existing logic or interfaces without confirming.
  - stick to the scope of what was asked -- do not bundle in adjacent renames, reordering, or other "while I'm at it" changes just because they seem like natural improvements. if something adjacent seems worth changing too, mention it or ask instead of just doing it.
  - one stage at a time, in the build order of docs/architecture.md. never start stage N+1 while stage N does not build or does not pass its tests.
  - when a bug is found, add the failing test first, watch it fail, then fix it
  - when you need to ask the user anything, gather every question into one single list asked together in one place -- never scatter questions through the response or across separate messages. that list is the complete set of questions being asked, not a first round with more to follow.
  - every question must explain itself -- name and briefly describe whatever specific code, step, or concept it refers to, not just a bare reference assumed to already be understood. do not assume the user has been tracking every implementation detail alongside you.
