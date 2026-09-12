# Engine Architecture

How the engine turns a document into the next document: the stages, the data structures each stage produces, and the decisions behind them.

`docs/engineSpec.md` is the authority on behaviour. `docs/codeStructure.md` lists the files and classes. This document is the one that explains *how it works* and *why it is built this way*.

---

## 1. What the engine is

One pure function. Text in, text out.

```csharp
Engine.Run(string state, string[] actions) -> EngineResult
EngineResult = { string State, Wake[] Wakes, Notice[] Notices }
```

Nothing survives the call. Load, build, tick once, serialise, discard. There is no object kept between calls and no cache that outlives one `Run`.

That costs a full re-parse of every expression on every tick. It is accepted deliberately: at a few hundred holders it is irrelevant, and it is what makes the engine repeatable and trivially testable.

The engine never calls a model. When something needs an answer it says so in `Wakes` and returns. The answer comes back as an action on the next call. §5 line 515 — phase 8 is Wakes, at the end of the tick. The engine never pauses mid-tick.

---

## 2. The stages

```
document text
   │
   │  parse JSON                     System.Text.Json
   ▼
raw JSON tree
   │
   │  build + validate               factories, §4
   ▼
node tree  ──────────────┐
   │                     │  lex, parse, bind             §5
   │                     ▼
   │                 bound expressions
   │                     │
   │◄────────────────────┘
   │
   │  eight phases                   §6
   ▼
node tree, advanced
   │
   │  serialise
   ▼
document text
```

The JSON tree is thrown away once the node tree is built. Nothing after stage 2 sees a `JsonObject`.

---

## 3. Two trees, not one

JSON gives the **document** structure for free — holders, values, paths, the fixed skeleton of §17. No parser is written for it.

JSON gives nothing for what is *inside* an expression field. `exemple.json:35` is one opaque string to a JSON reader:

```
"sum( a.diplomacy.at_war as t where t.key == b apply t.value ) > 0"
```

So the compiler stages apply only to the contents of expression fields. Roughly eight fields carry them:

```
Value    Requires    Valid          When
Bounds   Applies_to  Contribution   Destroyed_when   Filter
```

Some string fields are *not* expressions — `On_match: "cancel"` is a keyword looked up in a fixed list. Which is which is decided by the field, not by inspecting the string.

---

## 4. JSON to node tree

### Factories, not deserialisation

Each node type has a private constructor and one static factory. Construction and validation are the same act, so an invalid object cannot exist.

```csharp
public sealed class EnumDecl
{
    public string   Name    { get; }
    public string[] Options { get; }

    private EnumDecl(string name, string[] options) { … }

    public static EnumDecl? From(JsonObject json, DocPath path, Diagnostics diag)
    {
        // 1. unknown keys          -> load error
        // 2. required key missing  -> load error
        // 3. wrong leaf type       -> load error
        // 4. recurse into children
    }
}
```

The factory recurses: the root builds catalog and state nodes, each of those builds its children, down to values. Every level checks only its own keys.

### The closed vocabulary

Any key not in a node's legal set is a **load error**, never a silent skip. §15 line 1392 already states this principle for permissions — "the vocabulary is closed, and a misspelling must not read as an unfamiliar actor tag" — and §15 line 1414 explains the cost of the alternative: a mechanic that quietly does nothing for forty ticks.

The legal set depends on position. §17 line 1467 — odd depths are keywords, even depths are authored names:

- **odd depth** — check the key against the node's closed set
- **even depth** — an authored name, any text; check the shape of what is inside instead

Because each class defines its own legal keys, the check falls out of the class rather than living in a separate table that can drift from it.

### Errors accumulate

A factory that threw on the first bad key would make an author fix one mistake per run. Instead `Diagnostics` is passed down, a failed factory returns `null`, and the load continues to find everything else. `Engine.Run` throws once at the end, carrying the whole list.

### Writing back out

Every node class also has `ToJson`. §17 line 1490 — an instance carries its declaration in full, so anything not modelled would be lost on save. The closed-vocabulary rule is what prevents that: nothing can be in the document that no class knows about.

The serialise-reload invariant in `docs/testing.md` proves it.

---

## 5. Expressions

### Stages

```
text  ->  tokens  ->  syntax tree  ->  bound tree  ->  figure
       lex        parse            bind          evaluate
```

**Lexer** — characters to tokens. Whitespace dropped, multi-character operators (`<=`, `!=`) handled by lookahead, words checked against the keyword set so `and` becomes an operator and `gdp` a name.

**Parser** — tokens to a syntax tree, by recursive descent, one function per precedence level, loosest first. §2 line 100:

```
not  >  * / %  >  + -  >  < > <= >=  >  == !=  >  and  >  or
```

Each level grabs a tighter operand, then loops while its own operators appear. The loop gives left associativity; the call chain gives precedence. Parentheses need no rule — the primary parser recurses from the top.

The syntax tree is immutable and faithful to the source.

**Bind** — produces a second tree. The syntax tree is never modified: a node annotated in place would mix authored data with derived data, which `CLAUDE.md` forbids, and a side table would put a dictionary lookup in front of every read.

Binding performs the checks that are static:

| Check | Spec |
|---|---|
| formula referencing its own name other than via `prev` | §15 line 1381 |
| recursive function | §15 line 1385 |
| `list + scalar`, numeric reducer over a non-numeric collection | §15 line 1390 |
| declaration colliding with a reserved name | §15 line 1386 |
| function name not in the closed set | §2 lines 37-48 |

**Evaluate** — walk the bound tree, return a figure. A tree-walking interpreter, not compiled code.

### Names resolve late

Binding does **not** resolve a value name to a declaration. §6 line 643 — "That skip is where late binding lives." §15 line 1410 — reading a value a holder does not have returns the type default and logs, which is not an error.

So a name that does not exist yet was never going to fail, and a holder created mid-tick needs nothing invalidated. Name lookup happens at read time.

This also means a bound node cannot hold a direct pointer to a declaration. Late binding is a property of the language, not an optimisation that may be removed.

### Parse once per load

Expressions are lexed, parsed and bound once, when the document is loaded. Nothing re-parses during a tick. A holder created mid-tick has its own declarations bound at that point and added to the collection — nothing existing is touched.

### The pipeline is not a function call

`sum(x)` is ordinary call syntax. `x as t where p apply q` is not: `p` cannot be evaluated before `t` exists, where a function call evaluates its arguments first. So the pipeline gets its own node:

```
source      provinces
variable    "p"
filter      p.owner == self      optional
projection  p.gdp                optional
```

Evaluating it iterates the source and, for each element, makes a child context binding the variable, evaluates the filter there, and if truthy evaluates the projection there. This is what LINQ's `Where` and `Select` do, and the implementation uses them directly over `List<Value>`.

Note `min` and `max` appear twice in §2 — as scalar selection at line 40 and as reducers at line 43. Same name, two arities.

---

## 6. The tick

### Eight phases

§5 lines 507-515:

```
1  Economy        transactions fire; two-sided flows move
2  Movement       location/progress formulas advance
3  Encounters     one event per tile holding two or more entities
4  Updates        formulas referencing their own prev advance
5  Emissions      find-or-create instances; instances recompute magnitude
6  Destruction    destroyed_when evaluates; on_destroy fires
7  Hooks          conditions compare against phase 7 of the previous tick
8  Wakes          structural changes and fired hooks summon the AI
```

The tree is walked once per phase, each walk doing one job.

### Everything is frozen

§5 line 518 — a phase is the unit of frozen state. Every read inside a phase comes from the state as it stood at that phase's entry; writes land at the boundary.

`prev` is not a different kind of read. Every read is frozen. `prev.base` exists because §15 line 1381 makes a formula referencing its own name a load error, so it is the one legal way for a value to name itself. §5 line 522 — it means the value at entry to the current phase, not last tick.

### Most values compute themselves

§8 line 759 — **effects are pulled, not pushed.** A bomber does not push damage onto a province; the province's devastation reads how much bombing is happening to it. §8 line 735 — modifiers write nothing at all.

So the bulk of the document is locally computable: read the frozen state, produce a new figure, no coordination needed.

### A short list of things that push

| Source | Targets | Spec |
|---|---|---|
| transaction | own values, and the owner's where cost resolves up the chain | §8 line 732 |
| action effect | any value whose `writable_by` names the principal or the action | §8 line 731 |

These arrive at a value from elsewhere, so they are collected before they can be applied:

```csharp
record Delta (ValueId Target, double Contribution);   // numeric, sums
record Assign(ValueId Target, Value  Figure);         // ref/enum/bool/string
```

Two rules make collecting them unavoidable. §5 line 543 — deltas **sum**, so two writers in one phase both land and neither overwrites the other. §5 line 550 — two distinct non-numeric assignments in one phase mean *no write lands*. Neither can be expressed by writing into a copy of the world.

At the boundary, §5 line 540:

```
next = clamp( update(prev.base) + Σ deltas, bounds )
```

`update(prev.base)` is the value's own rule — local, runs for nearly every value. `Σ deltas` is the collected external contributions — empty for nearly every value. Almost everything changes every tick; almost nothing receives a delta.

### No deep copy

The write list *is* the working copy §5 line 518 refers to. Copying the world would not help: writing into a copy makes the second writer overwrite the first, where the rule is that they sum.

### Effective values are computed lazily and cached per phase

§5 line 529 — a formula with no self-reference is not scheduled and not authoritatively stored; it is recomputed wherever read, with modifiers composed at the point of reading.

§5 line 531 — caching that within a phase is legitimate and free, because the inputs are frozen and the answer cannot change. The cache is cleared at each phase boundary.

---

## 7. Data structures

| Type | Role |
|---|---|
| `Value` | a runtime figure. every accessor answers for every kind — no read is undefined (§1 line 26) |
| `VType` | the type language of §3. carries its own target, so nothing else declares shape |
| `Diagnostics` | collects load errors, rejections and logs, with a cap |
| `DocPath` | where a node is, for error messages: `Actor.fra.Institution.economy.Values.money` |
| node classes | one per holder kind (§6 line 579) plus catalog kinds. private constructors, static factories |
| `Ast` | immutable syntax tree |
| `Bound` | the checked tree the evaluator walks |
| `Delta`, `Assign` | collected pushes, applied at the phase boundary |

Numbers are `double` throughout. §2 line 57 — all arithmetic evaluates in float; there is no integer arithmetic to mix with, so `int / int` does not truncate.

---

## 8. Decisions, and what was rejected

Kept here rather than in comments, per `CLAUDE.md`.

**Typed classes, not JSON carried through.** Validation at the boundary means nothing downstream can meet a malformed document. Carrying `JsonObject` would force every function to defend against a missing key forever.

**Factories, not a separate schema file.** A schema describing legal keys would still need the classes, and the two would drift. The class defines its own legal keys, so there is one source of truth. A schema can be *generated* from the classes later, to hand the model so it writes valid documents.

**Bound tree, not annotation in place.** Keeps authored data and derived data apart, and keeps §15's checks out of the parser so the parser only ever fails on malformed text.

**No runtime C# compilation.** Expressions arrive as text at runtime (§1 line 26), and C# cannot provide what the language requires: totality (§1 line 26 — no expression may fail or fail to terminate), saturating division (§2 line 63, where C# gives `Infinity`), `and`/`or` returning 0 or 1 rather than `bool`, and `random()` as a hash rather than a stream (§2 line 124). §15's load errors are checks a C# compiler would not make. The names in an expression are not C# symbols. LINQ is the right model for implementing the pipeline; it is not a substitute for the evaluator.

**No positional operations.** §2 line 53 — no indexing, `first`, `last` or `sort`. List concatenation composes in whatever order modifiers are walked, and that order is unobservable only because nothing can read a position.

**Randomness is a hash, not a stream.** §1 line 22 — a formula is recomputed wherever it is read, so a stream would return a different figure on a second read within one phase, breaking order-independence.

---

## 9. First slice

Expressions only. No document, no node tree, no tick.

```csharp
Evaluate("2 + 3 * 4")   ->  14
```

**Built:** `Lexer`, `Token`, `Ast`, `Parser`, `Value`, and the world-free part of `Functions`.

**Covered**

```
arithmetic   + - * / %
comparison   < > <= >= == !=
logical      and or not
selection    if  clamp  abs  sign  trunc,  and min/max over scalars
precedence   §2 line 100
division     saturation and modulo, §2 lines 62-68
```

**Excluded:** `as/where/apply`, all reducers, the roots (`provinces`, `actors`, `entities`, `contracts`), `adjacent`, `provinces_within`, `has`, `get`, `flatten`. Each needs a world. Also `random()` — §2 line 124 hashes against holder id, value path and tick, none of which exist yet.

`DIV_EPSILON` and `MAX_VALUE` live in the document's `Settings` (§15), which this slice has no document for, so the evaluator takes them as arguments.

### Tests

Table-driven, one row per rule, per `docs/testing.md`.

| Group | Rows drawn from |
|---|---|
| arithmetic | §2 line 37 |
| precedence and associativity | §2 line 100 — `2 + 3 * 4 == 14`, `10 - 3 - 2 == 5` |
| division | §2 lines 62-64 — `0/0 == 0`, saturation sign preserved |
| modulo | §2 lines 66-74 — `-7 % 3 == -1`, follows the dividend |
| truncation | §2 line 76 — toward zero, and `a == trunc(a/b)*b + (a%b)` |
| logical | §2 lines 89-92 — `3 and 5 == 1`, results always 0 or 1 |
| comparison | §2 line 38 — returns 0 or 1 |
| selection | §2 line 40 |
| totality | §1 line 26 — no input produces an exception |
| parse errors | malformed text yields a diagnostic, never a crash |

The last two are the ones that matter most: §1 line 26 requires that no expression can fail, and the AI writes expressions at runtime, so a malformed formula must produce a diagnostic rather than take the process down.
