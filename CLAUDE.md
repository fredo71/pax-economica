introduction : this project is Pax Economica, a strategy game played on a map in the browser. the game is one JSON document; a C# server runs its turns and a TypeScript page shows it.

this file holds only general rules. what the project looks like right now -- its files, its docs, what is built and what is planned -- is in docs/, starting at docs/paxServer.md.

## Rules to Follow

### Priority

  - understandable comes first, and understandable means simple and self-contained. every other rule in this file serves it; when one of them makes the code harder to follow, the code wins.
  - write the plain, direct version first. split, extract or generalise only when a reader would otherwise struggle.
  - the reader is told things through names, not comments: a function whose name says it, a variable, a constant. a comment is the last resort.

### General

  - before writing any new helper/utility code (reading a JSON key, formatting a figure, parsing a type, emitting a diagnostic), check whether the project already has a shared location for that kind of task and reuse/extend what's there instead of duplicating it inline.
  - when a feature is described in docs/, read that section before implementing it. do not read all of the docs, and do not implement from memory of them.
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
  - do not optimise until the plain version is measurably too slow. in the page, that means rebuilding the
    whole view from its state every time, not updating only what changed.

### State in the page

  - a redraw is invisible: drawing the same game again leaves the page exactly as it was. only a change
    in the game (a new turn) changes what is shown. a browser refresh is not a redraw.
  - so anything the player can change on screen is state, kept by the file that draws it, and the view
    is rebuilt from that state. whatever lives only in the page's elements is wiped by the rebuild.
  - each file keeps the state its own view needs and reads only that. no file reads another's state;
    a value two files need is passed to both through their actions, and each keeps its own copy.
  - a file's state is private. the only way to change it is an exported function named for what
    happened (selectProvince, setInstitutionOpen, showGame), never a setter or an exported variable.
  - each such function changes the state, then redraws its view from it. if the state did not change,
    it does not redraw: rebuilt elements fire their own events (a <details> fires toggle), and that loops.
  - drawing reads the state and changes nothing. a browser event that changes state calls one of the
    actions; it never edits the state itself.

### Diagnostics and Failure

  - `throw` is reserved for programmer error, meaning a broken invariant inside the code itself. it is never how bad input is reported. the one exception is loading: input that cannot be loaded at all may be refused by throwing, since there is nothing to continue with.
  - a run that refuses some bad input and carries on is a successful run. conflating a refusal with a failure makes every test of that refusal look like a crash.

### Process

  - always give your plan before any change -- except changes trivial enough to be obviously correct on sight (a typo fix, a rename, a single-line correction to an already-diagnosed bug), which can be implemented directly.
  - before making any architecture change, always ask first -- do not break existing logic or interfaces without confirming.
  - stick to the scope of what was asked -- do not bundle in adjacent renames, reordering, or other "while I'm at it" changes just because they seem like natural improvements. if something adjacent seems worth changing too, mention it or ask instead of just doing it.
  - one step at a time. never start the next step while the current one does not build or does not pass its tests.
  - when a bug is found, add the failing test first, watch it fail, then fix it
  - when you need to ask the user anything, gather every question into one single list asked together in one place -- never scatter questions through the response or across separate messages. that list is the complete set of questions being asked, not a first round with more to follow.
  - every question must explain itself -- name and briefly describe whatever specific code, step, or concept it refers to, not just a bare reference assumed to already be understood. do not assume the user has been tracking every implementation detail alongside you.
