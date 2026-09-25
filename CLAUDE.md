introduction : this project is a simulation engine in C# for Pax Economica. the entire state of a run is one JSON document -- the engine loads it, ticks it, and writes it back out.

you can find in the docs for the following:
  - docs/paxServer.md : the web page -- a map anyone with the link can open. the current work: start here. its "Which docs still apply" table says which of the docs below are on hold
  - docs/engineSpec.md : the language itself -- expressions, values, holders, writes, change, entities, agency, the AI, spans. the authority on what any behaviour *means*
  - docs/architecture.md : layering, the projects and how they fit together, the loop that runs ticks and asks the AI, build order, and which stage the engine is currently at
  - docs/engineArchitecture.md : how the engine works -- the stages from text to next document, the factories that validate while building, the expression compiler, the tick, and the decisions behind each
  - docs/codeStructure.md : every project, file and class -- what each one is for, which spec section it implements, and what calls it
  - docs/testing.md : the cli surface, the automatic suite (expression tables, unit, golden scenarios, invariants), the AI-driven exploration loop, and the promotion rule that connects them
  - docs/developmentProcess.md : how a non-trivial change is planned and executed -- step definition, class purity vocabulary, determinism guardrails, the objective/algorithm/architecture/testing/documentation planning phases, plan document format, and execution/escalation rules
  - exemple/exemple.json : a full worked document. integration fixture, never a unit fixture

## Rules to Follow

### General

  - before writing any new helper/utility code (reading a JSON key, formatting a figure, parsing a type, emitting a diagnostic), check whether the project already has a shared location for that kind of task and reuse/extend what's there instead of duplicating it inline -- e.g. PaxEngine/Core/ holds everything every layer depends on (diagnostics, values, the type language); this generalizes to any other shared-responsibility folder.
  - read the relevant section of docs/engineSpec.md before implementing a feature. it is sectioned; do not read all of it, and do not implement from memory of it.
  - if documents are out of date, ask to update them

### Naming

  - keep variable explicit
  - the code should be self commenting through variable names
  - explicit does not mean long -- variable names should be as short as possible while staying self-explanatory, the same short-but-self-explanatory principle that applies to function names (e.g. DeclaredType, not DeclaredValueTypeAsParsedFromDocument)
  - name a variable or function by its purpose -- what it does or represents in the logic -- not by its technical/mechanical nature (its type, which JSON key it was read from, or how it's implemented). a long name that just restates the technical source (e.g. calculatedValueStringFromJsonObject) is not better than a short meaningless one (e.g. val) -- both fail to say what the value is for. prefer names like effectiveReading/baseFigure over value1/value2 when a value is one of several conceptually distinct roles.
  - variables must never be a single letter or a short letter cluster, even as part of a compound name (e.g. v, vPrev, vNext are not acceptable) -- spell out what the variable actually represents (e.g. frozenFigure, writtenFigure)
  - the same rule applies to every name in the project, not just variables: classes, types, methods, files and folders. no truncation and no acronyms -- write EnumDeclaration not EnumDecl, Expressions/ not Expr/, SyntaxNode not Ast, DeclaredType not VType, DocumentPath not DocPath. a reader who has not seen the word before must be able to say it out loud and guess what it is.
  - an acronym is only allowed when the user already uses it in conversation about this project (AI, JSON, CLI). a name invented for the code never gets one.
  - a type name is never shadowed by a field name in scope. a static helper class `Doc` alongside a field `World.Doc` forces every call to be written `PaxEngine.Doc.Obj(...)` and silently breaks the moment one is missed. give helper classes names that cannot be shadowed (e.g. JsonFields).

### Readability (every language)

  - every rule in this file applies to every language in the repo -- C#, TypeScript, and local scripts alike
  - one operation per line: give each intermediate result a named variable instead of chaining lookups, calls and object-building into one expression. the names are the explanation (e.g. `bool wasStillPending = pending.Remove(item);` then `if (!wasStillPending && ...)`)
  - no magic values inline: a number, colour or string that means something gets a named constant (e.g. `MinimumInstanceCapacity = 64`, not a bare 64). a value already labelled by the key it sits under (`weight: 1` inside a named style object) counts as named
  - show types the reader cannot see at a glance. in TypeScript, annotate every declaration whose type is not obvious from its own line, and never let `any` spread: check untyped data (parsed JSON) where it arrives and give it a real type there
  - exception, TypeScript: a condition saved to narrow a type (`const hasActors = isRecord(actors);` then `if (hasActors) ...`) takes no type annotation. writing `: boolean` on it silently stops TypeScript narrowing through it, and the code then needs a cast to compile

### Comments

  - make sure to use comment to explain function and logic blocs
  - keep comments short: say what the function/block does and any non-obvious side effect (e.g. "returns null if the key is absent, no diagnostic raised"), not implementation detail or things already obvious from reading the code
  - let the code explain the function -- never comment on something the code does not actually do, and avoid repeating yourself (do not say the same thing in a comment twice, or say in a comment what a variable/function name already says)
  - every sentence in a comment is one of four things, and only two of them earn their place: WHAT it does (the function name's job -- one short clause at most, usually none), HOW it does it (the code's job -- always delete), WHY it is this way (a constraint, a trap, a rejected alternative -- keep), and WHAT IF (side effects and failure behaviour, e.g. "returns the default figure if unset, and logs" -- keep). before writing a comment line, ask which of the four it is; if it is WHAT or HOW, it does not go in.
  - four lines is the cap for a comment block. going past it means the extra lines are a WHY that would otherwise cost someone real debugging time -- if they are not, cut them.
  - a comment that explains a rule of the language cites the spec section rather than restating it (e.g. "§5: reads the frozen figure, not the one being written"). the spec is the authority; a paraphrase in a comment goes stale silently.
  - design history belongs in docs/, not in a function header. what was tried, what was rejected, what was confirmed empirically -- that goes in the matching docs/ file, with at most a one-line pointer from the code. in a comment it has no natural stopping point and grows without bound.

### Function and Class Structure

  - split functions by what they do, not by size: if the honest one-sentence description of a function's body is "it does X and then Y" where X and Y are different processes (e.g. collecting the writes a tick produces, then applying them), X and Y each get their own named function and the parent reads as a list of calls. length is only a symptom -- even a short function mixing two different jobs must be split, while a long function doing one indivisible job may stay.
  - before adding logic to an existing function, check that the addition still matches its established purpose (what its name says it does) -- if it doesn't, the logic belongs in a different function, existing or new, not folded in here because it's convenient. e.g. a function whose job is only to apply an already-computed figure should never grow to also evaluate the expression that produced it; that evaluation belongs in the function whose purpose is to evaluate, which this one then calls.
  - when splitting a function into smaller ones, keep the new function names short but still self-explanatory (e.g. TargetIsWritable, not CheckWhetherTargetValueCanBeWrittenByThisActor)
  - if a function starts getting too big, split it into subfunctions built around a shared goal -- e.g. group everything that decides whether a write is permitted (permissions, bounds, type match) into its own function, rather than splitting arbitrarily
  - avoid mixing high level (in term of logic) function with low-level logic -- a tick phase and a string-to-double parse do not belong in the same function
  - functions should take as few arguments as possible. in order of preference: read a field already accessible to it (a self-contained class's own data) with no argument needed at all; otherwise take a single data object if what it needs genuinely comes from outside; only fall back to individual loose parameters when neither applies, and even then keep it minimal -- things that are close in logic should be close in scope, not threaded through as separate arguments. a global/instance variable earns its place only if it is real state worth persisting, not just a value being passed through.
  - if a second argument can be derived from the first (or from data the function already has access to), prefer recomputing it inside the function over adding it as its own parameter -- but only when that recomputation is cheap. if deriving it duplicates non-trivial work (e.g. re-parsing an expression the caller already parsed), pass it in instead.
  - when a function already receives a data object and needs a new value, the value travels inside that object whenever it makes sense for the object to hold it (e.g. a new per-tick setting goes into the evaluation context already being passed) -- adding a loose parameter alongside an already-passed data object is the signal this rule is being broken. only fall back to a loose parameter when the value genuinely belongs to no object already in reach; if several such values travel together, create a data class for them.
  - data should be as pure as possible and function should be as pure as possible, meaning avoid mixing the two -- this applies to anything shared between several classes (its side effects would be invisible to whoever else holds that data). a self-contained class (all its state and behavior live together, visible in one place) can mix data and functions freely. see docs/developmentProcess.md's Class Purity table for the formal pure data / pure function / pure object / unpure vocabulary this implies, used when classifying classes during architecture planning.
  - organize code like a tree: entry point at the top, followed by the functions it calls, followed by the functions those call, etc. this allows reading top-to-bottom without jumping around -- the control flow becomes visible at a glance.

  Example:

  // real state that persists across ticks, not just a value being passed through -- that is what
  // earns a variable the right to be an instance variable instead of local data. no need to wrap
  // this in a data class or pass it as an argument either: any function in this self-contained
  // class can just read it directly.
  int currentTick;

  void RunTick(Document document)
  {
    FreezeFigures();
    ChangeSet changes = CollectChanges();
    ApplyChanges(changes);
    WriteBack(document);
    AdvanceTick();
  }

  // no arguments -- reads its own accessible data directly
  void FreezeFigures()
  {
    // snapshot the figures every calculation in this phase will read
  }

  // produces the data ApplyChanges needs. there is no way to make the two communicate other than
  // through this value, so we introduce it here -- but keep this kind of passing-through to a
  // minimum, only when it is genuinely the only way.
  ChangeSet CollectChanges()
  {
    // build and return the writes this tick produced
  }

  // needs data that only comes from outside -- one data class, not several loose parameters
  void ApplyChanges(ChangeSet changes)
  {
    // apply or reject each write
  }

  // gets its data passed in from the exterior (RunTick's own caller handed it down) -- nothing
  // inside this system can produce the document itself, so it has to be threaded in as an argument
  void WriteBack(Document document)
  {
    // serialise the new figures back into the document
  }

  // no arguments -- reads currentTick directly, same as FreezeFigures reads its own accessible data
  void AdvanceTick()
  {
    currentTick++;
  }

### Determinism and State

  - the document is the entire state. no static mutable fields, no cache that survives a tick, nothing a save file would miss -- if state lives outside the document, save/load silently diverges from a live run and nothing in the test suite can see it.
  - same document and same WORLD_SEED produces byte-identical output, on any machine, on any run
  - forbidden, because each one breaks that: DateTime.Now, unseeded Random, GetHashCode used for anything ordered, iteration over an unordered collection where the order is observable in the output, culture-sensitive number formatting (use InvariantCulture always)
  - ticking twice in memory must equal ticking once, serialising, reloading, and ticking again. if those differ, state is living outside the document.
  - nothing printed to stdout may vary between runs -- no timestamps, no elapsed durations, no absolute paths. golden comparison depends on it, and the failure looks like a logic bug rather than a formatting one.

### Diagnostics and Failure

  - evaluation is total (§1) -- no expression path throws. a missing value yields the type's default, a malformed reference yields a diagnostic and a null figure.
  - `throw` is reserved for programmer error, meaning a broken invariant inside the engine itself. it is never how the engine reports bad input. bad input is a diagnostic.
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
