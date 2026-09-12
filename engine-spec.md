# Pax Economica — Engine Specification

**Version:** 3.0
**Status:** normative. Everything in this file is engine behaviour. Nothing in it is a game.

This file replaces Parts I–VII. The sample world that was interleaved with them is now `reference-scenario.md`, which is illustrative and carries no authority. Where this file says a decision is the scenario's, the engine has no opinion and none should be inferred.

Written to be implemented in order. §16 is the build order, and §17 is the shape of the document everything above reads.

---

## 1. Invariants

Four guarantees. Any mechanic that breaks one is wrong rather than interesting.

**Nothing is changed without its consent.** Every write passes a permission the target declared itself. A holder changes its own values; an action changes values whose permission set names it or names that action. Nothing else touches anything, so a holder is exactly as fragile, as taxable and as destructible as its own declaration says.

This is also why there is no delete operation. A verb that removed a node would be the one thing in the engine changing something its own declaration never permitted, so existence ends the same way everything else changes: by a condition the thing itself declared (§10.6).

**Values are frozen within a phase.** Every formula in a phase reads the same state, captured at the phase boundary. Writes accumulate separately and land at the next boundary. Order within a phase is unobservable.

Order-independence is a property the implementation has to preserve, not merely inherit. A sequential random generator breaks it outright — a `formula` is recomputed wherever it is read (§5), so a stream would return a different figure on the second read within one phase. Randomness is therefore a hash over coordinates, not a stream (§2).

**The baseline is a convention, not a guarantee.** A value declared for a type starts identical on every instance, and every instance stores its own declaration in full, so instances may legitimately diverge afterwards. This is deliberate — the AI reads the declaration wherever it reads a figure, and a scenario may want one nation's institution to differ from another's — but nothing structural enforces sameness, and a rule meant to stay shared across instances declares `"revisable_by": []` (§3) rather than being assumed to stay put.

**Every operation is total.** No expression can produce an undefined figure, fail, or fail to terminate. This matters because the AI writes expressions at runtime, and an engine that can be crashed by a malformed formula cannot let it.

---

## 2. Expressions

One closed function set. Formulas, conditions, hooks and validity checks all draw on it, and nothing outside it exists.

```
ENGINE

arithmetic      + − × ÷ %
comparison      < > <= >= == !=          returning 0 or 1
logical         and, or, not             returning 0 or 1
selection       if(c, a, b), min, max, clamp, abs, sign, trunc
chance          random(), random(a, b), random_int(a, b)
sets            as, where, apply
reducers        sum, count, avg, min, max
roots           provinces, actors, entities, contracts
map             adjacent(p), provinces_within(p, n)
presence        <holder>.has(name)
search          <holder>.get(tag), get_effective(tag), get_base(tag)
shape           flatten
```

There is no pathfinding. `provinces_within` returns a set of provinces, never a route.

**There is no positional operation on a set or list.** No indexing, no `first`, no `last`, no `sort`. This is a standing constraint rather than an omission: list concatenation (§3) composes in whatever order modifiers are walked, and that order is unobservable *only* because nothing can read a position. Anything positional added later breaks the frozen-phase invariant the same day, and would have to arrive with a rule fixing composition order.

### Division, modulo and truncation

All arithmetic evaluates in float. There is no integer arithmetic to mix with, so `/` is always real division and `int / int` does not truncate.

```
ENGINE

x / y  =  0                       when |x| < DIV_EPSILON and |y| < DIV_EPSILON
       =  sign(x) * MAX_VALUE     when |y| < DIV_EPSILON
       =  x / y                   otherwise

x % y  =  0                       when |y| < DIV_EPSILON
       =  remainder, sign following the DIVIDEND, as in C#
```

`DIV_EPSILON` and `MAX_VALUE` are engine constants (§15). The sign is preserved, so a negative numerator over zero returns negative. `0 / 0` is 0, because a saturating answer has no meaning when there is nothing to divide.

Modulo by zero returns 0 rather than saturating, because `|x % y| < |y|` always holds — as the divisor shrinks toward zero so does the result, so zero is the limit rather than an arbitrary choice.

**`%` follows the dividend**, so `-7 % 3` is `-1`, not `2`. State this loudly: truncated-mod versus floor-mod is the classic silent cross-language difference, and a model trained mostly on Python will assume the wrong one.

**`trunc(x)` discards the fractional part, toward zero**, and integer division is written `trunc(a / b)`. The direction is forced rather than chosen: the identity `a == trunc(a/b) * b + (a % b)` only holds with truncation toward zero, so `%` following the dividend and `trunc` rounding toward zero are one decision, not two.

This is the rule that makes ratio expressions safe. A denominator of zero means the quantity being divided by is absent, and saturating is almost always the right reading — a demand of zero should produce an unbounded ratio, not a collapsed one. Downstream, `min`, `clamp` and `bounds` contain it.

### Logical operators

C#'s semantics, spelled as words because that is what the scenarios already
use and what reads in a JSON string. Any nonzero figure is true; the result
is always 0 or 1.

```
ENGINE

not a       1 when a is zero, else 0
a and b     1 when both are nonzero, else 0        &&
a or b      1 when either is nonzero, else 0       ||
```

Precedence follows C# exactly, so an expression a model writes from habit
parses the way it expects:

```
ENGINE

not   >   * / %   >   + −   >   < > <= >=   >   == !=   >   and   >   or
```

**They short-circuit, and that is observationally free here.** In C#, `&&`
skipping its right operand matters because evaluation can have effects or
throw. In this engine an expression can do neither — §1 makes every operation
total, and nothing in the function set writes — so skipping is a speed
decision that no formula can detect. Even `random()` is unaffected, being a
hash over coordinates rather than a draw from a stream.

**`and` is not multiplication**, despite §2's older "conditionality is
multiplication" framing, which stands for *scaling* a magnitude by a
condition. As a logical operator it must normalise: `3 and 5` is 1, where
`3 * 5` is 15. Multiplication remains the right tool for
`-0.3 * (winter_severity > 0.5)`, where the comparison is already 0 or 1 and
the product is a magnitude rather than a truth value.

### Chance

Randomness is a **pure function of coordinates**, never a stream:

```
ENGINE

random() = hash( WORLD_SEED, holder_id, value_path, tick, call_site )
```

`call_site` is the static index of that `random()` occurrence within its expression, assigned at parse time, so two draws in one formula differ while each stays stable.

```
random()             uniform float in [0, 1)
random(a, b)         uniform float in [a, b)
random_int(a, b)     uniform int in [a, b], inclusive
```

Total on every input: `random(5, 5)` is 5, and reversed bounds return `a` rather than failing.

Everything §1 requires falls out. The same coordinates give the same figure however many times they are read, so a formula read in phase 1 and again in phase 4 draws once. Nothing is consumed, so call order cannot matter. One seed persists instead of generator state, and a tick replays identically.

A hook trigger of `becomes random() < 0.05` fires on roughly one tick in twenty, re-arming per §12.4's latch rule. No event system is required; the hook vocabulary already had the shape and only lacked a source of chance.

### Roots and sets

`provinces`, `actors`, `entities` and `contracts` are the global sets of every holder of that kind. Qualified, `p.entities` is the set of entities located in province `p`, which is a different set from the root `entities`.

**Institutions have no root**, though they are holders (§6). A root exists for things you find by *searching* — you do not know which provinces are hostile, so you filter `provinces`. An institution you find by *naming*: `self.faction_opposition.loyalty`, because its identity is which holder carries it plus its own name. There is nothing a root would let you reach that a path does not.

A set expression is a pipeline. A reducer wraps it.

```
ENGINE

<set> as <name> [where <condition>] [apply <expression>]
```

Four things may fill the `<set>` position: a root, a qualified root (`p.entities`), a tag gather (`<holder>.get(tag)`), and a stored `list<T>` or `map<K,V>` (§3).

`as` binds each element of the set to `<name>` for the rest of the pipeline. **There is no implicit binding, and no bare name is a legal reference.** Every reference is `self.<field>` or `<bound-name>.<field>` — nothing else parses — precisely so the same three letters can never mean two different things depending on how deeply an expression happens to be nested.

The one place a bound name stands alone is when it binds a **scalar** rather than a holder — an element of `list<float>` has no field to reach for, so `where x > 5` must parse. This does not reopen the ambiguity above: a name introduced by `as` is declared inside the expression that uses it, which is exactly what a bare field name is not.

Binding an element of a `map<K,V>` yields a key/figure pair, addressed `<name>.key` and `<name>.value` — the same `<bound-name>.<field>` form as everything else.

`where` filters the bound set by a condition and returns a set of holders. `apply` maps each bound element to an expression and returns a set of its results. Both clauses are optional and chainable.

```
sum( provinces as p where p.owner == self apply p.gdp )
count( self.location.entities as e where e.owner != self.owner )
avg( entities as e where e.type == "field_army" apply e.morale )
```

Bindings nest without shadowing outward: a name introduced by an outer `as` is still visible inside a pipeline nested within it, which is what makes a two-level query expressible at all —

```
sum( provinces as p where p.owner == self
       apply sum( p.entities as e where e.owner == p.owner apply e.cost ) )
```

`count` accepts a set of holders or a set of numbers. The other reducers require numbers; `sum(provinces)` is a load error, and so is `sum` over a map, which would have to guess between keys and values — pick a side with a pipeline, `sum( self.trust as t apply t.value )`. `count` over a map is unambiguous and legal.

**There are no loops and no recursion.** Everything that would need one is a filter and a reduction over a finite set. Every reducer is defined on the empty set — `sum`, `count` and `avg` return 0; `min` and `max` return 0 — so an expression written against conditions that never occur returns zero rather than failing.

**The absent case needs no handling anywhere.** This is the main practical payoff of totality: a filter over a set that does not exist yields the empty set, which reduces to zero, which is almost always the right answer.

Set algebra and `unique` are deferred until something needs them.

### Presence

```
ENGINE

<holder>.has(<name>)     1 when <name> is a usable key on that holder, else 0
```

**It tests whether a key can be used, not what it holds.** Any key — a value, an institution, an entity, a modifier instance — and a value sitting at its type default still answers 1, because it is there to be read. A name that resolves to nothing answers 0.

That distinction is the point. §3 makes a missing read return the type default, so a figure of 0 cannot tell you whether the value is absent or merely zero; `has` is what separates them, and §6's aggregation rule is the same question asked over a set — "aggregations skip holders that lack the value entirely, because a zero and an absence are different facts."

A path through an id that no longer resolves answers 0, which is how a scenario tests whether something it points at still exists — and, with `destroyed_when` (§10.6), how anything expires when the thing it depended on is gone.

### Tags and `get`

`apply` reads a named field off a set whose shape you already know. `get` is for the opposite case: gathering every contribution to a concept without enumerating, or even knowing, everywhere it might come from.

A **tag** is a declared name — `cost`, `revenue`, whatever a scenario needs — registered once and tracked like any other runtime declaration (§7.5). A value names the tags it carries:

```json
{ "value": "upkeep", "applies_to": {"kind": "entity_army"}, "tags": ["cost"] }
```

```
ENGINE

<holder>.get(<tag>)
```

`get` walks everything reachable from its target, however deep and through however many kinds of holder, and returns the figure of every value carrying that tag, as a `list<T>` where `T` is the tag's declared type (§7.5). Matching is by declared tag only, never by a value's own name — a value called `cost` that carries no `cost` tag is invisible to it, and a value called anything else that does carry the tag is found. This is what lets a new unit type join an existing sum by declaring one tag, with the formula that reads it — `sum( self.get(cost) )` — never edited and never aware the new type exists.

**Three spellings, two meanings**, mirroring the reference suffixes of §4 so there is one rule to learn rather than two:

```
ENGINE

<holder>.get(tag)             effective, the default
<holder>.get_effective(tag)   explicit alias for the default
<holder>.get_base(tag)        nominal, ignoring modifiers
```

`get_base` differs from `get` only where a tagged **`value`** carries modifiers — a `formula` has one reading (§4), so for a formula-kind contributor the two return the same figure.

**The walk emits in canonical order**, sorted by `(holder_id, value_path)`. No expression can observe that order, since nothing reads a position, so this is not a correctness rule. It is what keeps a stored result reproducible: without it the same tag on the same tick yields a differently-ordered list across runs, save files churn, and the document rendered to the AI differs for identical state.

Because the result is an ordinary `list<T>`, it can be stored, passed and reduced like any other. A tag whose own type is a list gives `list<list<T>>` — awkward but legal, and `flatten` is exactly the tool for it.

A single `get` call already returns a flat list; there is nothing nested yet to flatten. `flatten` earns its place once a set-valued expression is used *inside* `apply`, which produces one set per bound element:

```
sum( flatten( provinces as p where p.owner == self apply p.get(upkeep) ) )
```

**A value may carry more than one tag.** `upkeep` might be tagged both `cost` (it draws down the treasury) and, in a scenario with logistics, `supply_draw` (it also strains a different pool) — two reducers, each seeing only the tag it asks for and unaware of the other.

### Conditionality is multiplication

Comparison returns 0 or 1, so a conditional effect is a product.

```
-0.3 * (winter_severity > 0.5)
```

**No construct anywhere in this specification takes a separate condition field**, with one exception: an emission's `when` (§9.4), which gates whether an instance exists at all rather than scaling a magnitude. Everything else that should not apply evaluates to zero and contributes nothing.

Equality applies to enums, strings and refs. Two refs are equal when they hold the same id.

### Selection

`if(c, a, b)` returns `a` when `c` is nonzero, `b` otherwise. Any nonzero figure counts as true.

For numbers this is redundant with multiplication, which is the preferred form. It exists because multiplication has no meaning for non-numeric types: a string or a ref cannot be scaled by 0.

`min`, `max`, `clamp`, `abs` and `sign` are ordinary numeric functions and carry no conditional meaning.

### Functions

A scenario, or the AI, may name an expression and reuse it.

```
fn hostile(a, b) = sum( a.relations as r where r.target == b apply r.at_war ) > 0
```

A function takes parameters and returns one figure or one set. **Functions are named expressions, not procedures** — no statements, no sequencing, no assignment, no recursion. They are expanded at load, so a call costs nothing at runtime and an expression built from total functions is itself total.

Anyone may declare a function, including the AI, and functions may call other functions. A function name is registered like any other runtime declaration (§7.2) and is subject to find-or-create.

Parameters are how a function reaches outside its own bindings. `a` and `b` are ordinary names introduced by the function's own parameter list, exactly like an `as` binding — there is no other way for `hostile` to refer to two different holders at once, since nothing in this language is ever bare.

---

## 3. Values

A named figure on a holder. Every value declares a **kind** and a **type**. They are orthogonal: the kind says how the value changes, the type says how it is stored and what it defaults to.

### Kind

```
ENGINE

value      a stored figure, set by direct write. Composable modifiers may
           target it.
formula    a calculation over named values and formulas, recomputed
           wherever read. Never a modifier target — to influence what it
           computes, modify one of the things it reads instead.
```

A `formula` may reference its own last figure as `prev.base` or `prev.effective` (§4) — there is no bare `prev`. A `formula` referencing its own name any other way is a load error.

### Type

```
ENGINE

int    float    bool    string
ref(<kind>)              enum(<name>)
list<T>                  map<K, V>
```

**The type carries its own target.** `ref(actor)`, `enum(diplomatic_state)`, `list<ref(province)>`, `map<ref(actor), float>`. There is no separate `references` field, because a map has two positions that might be refs and one field cannot describe both — and because §11.1's parameters rest on a path implying the shape of what belongs at it, which a self-describing type can answer alone.

`int` and `float` are both numeric; §2 covers how they interact, which is that they do not — every expression evaluates in float and the declared type coerces on store.

`list<T>` and `map<K,V>` nest freely. A map's key may be any scalar type.

### Defaults

Defaults come from the type, not the declaration.

| type | default |
|---|---|
| `int`, `float` | 0 |
| `bool` | 0 |
| `enum(<name>)` | first option declared for that enum |
| `ref(<kind>)` | null |
| `list<T>`, `map<K,V>` | empty |
| `string` | `""` |

**Reading a value a holder does not have returns the type default and logs it.** Not an error, halts nothing. A `ref` holds an **id**, resolved through an index, and an id that resolves to nothing returns the target type's default — so nothing holds a live pointer and no destruction has to invalidate anything.

Reducers **skip** elements of a `list<ref(…)>` that no longer resolve, rather than counting them as present zeroes. §6's aggregation rule gives the reason: a zero and an absence are different facts, and a dangling id is an absence.

This is a deliberate softening: the AI declares values during play and will mistype references, and an engine that errors on every one of them cannot let the AI author anything. The defence against a mechanic quietly half-working for forty ticks is the registry (§7.2), not a hard failure at read time.

### Declaration

```json
ENGINE

{
  "Kind": "value",
  "Type": "float",
  "Value": "0.4",
  "calculated_value": 0.4,
  "Bounds": [0, 1],
  "Writable_by": ["director"],
  "Modifiable_by": ["director"],
  "Description": "Terrain difficulty before modifiers"
}
```

**Four keys are required on every value: `Kind`, `Type`, `Value` and `calculated_value`.** Everything else is optional.

`Value` is the declaration — a literal for a `value`, an expression for a `formula`. `calculated_value` is the current **base** figure, never the effective reading (§4), seeded from `Value` at load when `Value` is a literal and diverging from it the first time a write lands. Storing effective instead would double-count contributions on the next composition and make `prev.base` unrecoverable.

Every value carries one, on every kind, because the AI must read a number wherever it reads a value rather than an expression it would have to evaluate itself. For a `value` and for a self-referencing `formula` that figure is authoritative and must persist; for a `formula` with no self-reference it is derived, carried for reading, and recomputed at load rather than trusted.

**A value declared on one holder exists only there.** Declaring it on France does not create it on every actor, nothing is evaluated for holders that lack it, and there is no automatic propagation. Instance values die with their holder.

A declaration may also carry `Tags` — names it opts into for `get` (§2, §7.5) to find it by, independent of the value's own name.

`Bounds` are optional, and **legal only on `int` and `float`**. Not on lists, maps, strings, bools, enums or refs: there is no element-wise clamping, no per-key clamping, and no length bound. A `map<ref(actor), float>` that should stay within `[-1, 1]` writes `clamp()` into whatever computes it, which is cheaper than a second meaning for `Bounds` on every collection type.

The engine imposes no bounds by default; runaway compounding is a design choice. Values may go negative freely, and what a negative figure means is scenario business.

**The engine has no scale convention.** A world of millions and a world of dozens are both correct, and two scenarios with incompatible scales will not compose. The registry's expected-range field is the only cross-scenario discipline.

### Permissions

```
ENGINE

writable_by     principals permitted to write calculated_value — the figure
modifiable_by   principals permitted to compose modifiers onto it
revisable_by    principals permitted to write anything else in the
                declaration — kind, type, value, bounds, tags, valid,
                and the three permission lists themselves
```

Three lists because there are exactly three things that can be done to a value: set its figure, compose onto its effective reading, change its rule. They are not an arbitrary subset.

**`revisable_by` is what makes a rule a rule.** §11.1's parameters can target any depth, so rewriting a formula is an ordinary write to `value` — which means revision was always permission-gated and needs no separate flag. A declaration nobody may revise says `"revisable_by": []`, and one only the director may revise says `["director"]`, which a boolean could never express.

**`revisable_by` governs itself.** Otherwise an empty list is removable by whoever can revise the declaration containing it, and the lock is decorative. Being self-governing makes `[]` a fixed point: nobody may revise it, including to unlock it. This is the whole of what §12.5 previously needed a separate mechanism for.

A block (§10.3) carries `revisable_by` and nothing else, having no figure to write and nothing to compose onto — which reads correctly, since a block *is* a rule.

Principals: `director`, `owner`, `player`, `actor` (any actor), and named actor tags. `owner` is the actor on whose behalf a write is made, checked against who owns the holder being written — Argentina's AI acting is Argentina, a player on Japan is Japan, and neither satisfies `owner` on the other's holdings.

**The principal also routes control, not only permission.** `player` and `owner` are separate entries because they mean different things about *who acts*:

```
ENGINE

player      the person acts on it directly
owner       the nation's AI acts on it; the player may prompt and argue
director    the director changes it, answering to nobody
```

So the same declaration that gates a write decides whose hands it is in, value by value, with no second system. A tax dial may be `player` while mobilisation is `owner`, inside one institution, and that is how much of a nation the player actually drives.

`owner` resolves to nobody on `World`, which owns nothing, and to **any party** on a contract — which is how a bilateral agreement stays writable by both signatories without either being "the" owner, having refused in §6 to scope a contract to one side.

**`writable_by` gates every write channel.** There are three (§8), and the one an actor or player uses is the action effect.

**Absent means open; empty means nobody.**

```
ENGINE

writable_by absent     any principal may write the figure
writable_by ["x"]      only x
writable_by []         nobody
```

The same three readings apply to all three lists. A permission list is a **restriction**, declared where a restriction is wanted, rather than a grant that must be declared everywhere before anything functions — and an explicitly empty list is how a scenario says a thing is closed rather than merely unmentioned.

This is a deliberate softening in the same spirit as the default-on-read above. The opposite default made every AI-authored value inert on creation unless the AI also remembered to declare its own permissions, which is the kind of ceremony that gets forgotten and then debugged for an hour. Locking something down is now the deliberate act, which is the rarer one.

It has a consequence worth stating plainly: an undeclared value is not "unreachable until someone wires it up," it is **offered to every actor from the first tick**, since §8's implicit action makes an open permission a visible option. A province's `owner` in particular must always carry an explicit declaration — otherwise the capture rule of §10.5 is not permissive, it is absent.

**Permissions inherit, nearest declaration wins.** A list declared on a node governs everything beneath it until a descendant declares its own; resolution walks up from the value, self included.

```
ENGINE

Actor.fra                      Writable_by: ["director"]
  Institution.economy                  —                  → director
    Values.gdp                         —                  → director
    Values.tax                   Writable_by: ["owner"]   → owner
```

**A child overrides; it does not narrow.** A value inside a director-only institution may declare `["owner"]` and become owner-writable. Intersection sounds safer and cannot express the commonest shape there is — an institution that is mostly engine-managed with one dial the owner is meant to turn.

**Only the two permission lists inherit.** `Valid`, `Bounds`, `Tags`, `Kind`, `Type` and the rest are local: a `Valid` written for one value cannot govern its siblings, and an institution tagged `cost` would otherwise sweep every value beneath it into `get(cost)`.

**They inherit independently.** A node declaring only `writable_by` does not reset `modifiable_by` to open — that keeps walking up on its own. Coupling them would make locking writes silently unlock modifiers.

Since declarations are static after load, every value's effective permissions are computed once at load. Inheritance is an authoring convenience with no evaluation cost.

**`writable_by` and `modifiable_by` are independent.** A `value` may carry both (an owner sets the base, the director also layers modifiers on top), either alone, or neither.

**A `writable_by` entry may also name a specific action, not just a principal.** A write passes if the acting principal is directly named, *or* if the write is happening as the effect of an action whose own name is listed. This is what makes "writable by the owner, but only by invoking this one action, never directly" expressible — a plain principal grants the same permission across every channel (§8), so locking a value to a single action means naming the action itself rather than the principal that may call it.

**Modifiers may only target `value`, never `formula`.** A `formula` is already a composition of other named things — to influence what it computes, modify one of those, so there is never any ambiguity about which underlying figure actually changed. A `formula` is never writable and never modifiable; both lists have nothing to say about it.

---

## 4. Reading a value

Every `value` has a **base** and an **effective** reading. A `formula` has only one — base and effective are identical, since it can never carry a modifier (§3).

```
ENGINE

effective(h, f) = clamp( base(h, f) + Σ contribution, bounds )
```

**Bounds clamp on both sides.** Base is clamped when written and the composed figure is clamped again, so no value is ever outside its bounds at any point in a tick.

**Every modifier contributes one figure, always added.** There is no separate proportional channel. A modifier wanting proportional-feeling behaviour — "+25% of the base" — computes `prev.base * 0.25` itself; because it reads the true base rather than another modifier's result, several such modifiers still combine additively instead of compounding (three bonuses of +25%, +40% and +30% of the same base sum to the same total either way, ×1.95 not ×2.73). A flat penalty also stays flat regardless of what else is composing onto the value, instead of being scaled by unrelated proportional bonuses — no cross-talk between modifiers that don't know about each other.

**Bounds is what keeps a stacked value sane, not a separate floor.** A value that should never go negative declares `bounds: [0, ...]`; one that legitimately can (growth, say) doesn't. This is scenario business, the same as every other bound.

**A field referencing its own last figure must say which reading it means.** There is no bare `prev` (§14) — only `prev.base` or `prev.effective`.

- `prev.base` is the safe default: this field's own last stored figure, with no active modifier ever folded in. Almost everything should use this.
- `prev.effective` is a deliberate exception: it lets an active modifier's contribution become permanent the next time the field updates — a one-off event permanently adding to a treasury, say — rather than expiring cleanly when the modifier is removed. Reaching for it is a stated choice on the page, not an accident.

Reading any *other* field still defaults to effective with no suffix needed — there is no self-reference there, so nothing to permanently ratchet.

```
ENGINE

self-reference        prev.base | prev.effective    one is MANDATORY;
                                                    bare prev is a load error
any other reference   <ref>                         effective, the default
                      <ref>.base                    nominal, ignoring modifiers
                      <ref>.effective               explicit alias for default
```

**The asymmetry is load-bearing.** A self-reference can ratchet: read your own effective figure, store it, and a modifier's contribution becomes permanent instead of expiring. Another holder's value cannot, because nothing is written back into it. So the mandatory suffix sits exactly where the hazard is, and requiring it elsewhere would be ceremony with nothing behind it.

`.effective` is legal everywhere and required nowhere. It costs one parser alias and buys a single uniform rule — *any reference takes an optional `.base` or `.effective`; bare means effective; self-references must pick one* — instead of a rule about which position permits which suffix. These expressions are written at runtime by a model, and §7.2's registry exists because models drift on exactly this kind of positional detail.

**`prev.effective` is derived, never stored.** There is one stored figure per value and it is base (§3); a second stored field would reintroduce the double-count. Deriving it needs the phase-entry snapshot of **two** things, and the second is the one that gets missed:

```
ENGINE

1  the value's own base at phase entry
2  which modifier instances were live at phase entry, and each one's
   Contribution figure
```

Modifier membership is not stable across a tick — emissions create instances in phase 5, destruction removes them in phase 6 — so *the modifiers live now* is not *the modifiers live at phase entry*. A `prev.effective` computed against current membership reads a different figure than the one §5 froze, and the error is silent. §5's freezing rule already covers this; it has to be applied to the modifier index and to instances' own values, not only to the target's base.

**Modifiers never write anything.** They alter what a `value`'s effective reading composes to. A `flat: -10` on a field bounded `[0, 1]` yields 0 while active, and when it expires the term leaves the sum. Nothing is saved and nothing is restored, so a modifier cannot fail to revert and an over-large magnitude is harmless.

---

## 5. The tick

One tick is one month.

### Phases

```
ENGINE

1  Economy        transactions fire; two-sided flows move
2  Movement       location/progress-style formulas advance, before Encounters
                  can react to them
3  Encounters     one event per tile holding two or more entities
4  Updates        formulas that reference their own prev advance
5  Emissions      find-or-create instances; instances recompute magnitude
6  Destruction    destroyed_when evaluates; on_destroy fires
7  Hooks          conditions compare against phase 7 of the previous tick
8  Wakes          structural changes and fired hooks summon the AI
```

**A phase is the unit of frozen state.** Every read inside a phase comes from the state as it stood at that phase's entry. Writes accumulate into a working copy and land at the phase boundary. The next phase reads what the last one left.

This is the rule that lets a battle survive to the end of the tick. An encounter reduces `strength` in phase 3; the field's own formula advances in phase 4 and its `prev.base`/`prev.effective` is the post-battle figure, so attrition applies to what survived rather than silently overwriting it from a stale snapshot.

**`prev.base`/`prev.effective` mean the value at entry to the current phase**, not last tick.

Two guarantees follow from freezing per phase rather than per write, and both are the point:

- Upkeep and a contract payment in the same tick both see the opening balance. Both are phase 1.
- Two armies compute losses against each other at full strength, and mutual destruction is possible. Both are phase 3.

A `formula` with no self-reference is not itself a phase. It is not scheduled, and it is not *authoritatively* stored; it is recomputed wherever read, from the current phase's frozen inputs, with modifiers composed (on the `value`s it reads) at the point of reading.

It still carries a `calculated_value` (§3), because the AI must read a number rather than an expression. That figure is derived rather than state: it is written for reading, and recomputed at load rather than trusted. Without the distinction a stale derived figure in a save file is indistinguishable from real state. Caching it within a phase is legitimate and free — the inputs are frozen, so the answer cannot change.

### Writes within a phase

**Numeric writes are deltas.** At the phase boundary:

```
ENGINE

next = clamp( update(prev.base) + Σ deltas, bounds )
```

Addition commutes, so multiple writers in one phase are order-independent and no ordering rule is needed. A transaction contributing `-8` and a block contributing `-0.5` simply sum.

**Ref, enum, bool and string writes are assignments**, and cannot be summed.

```
ENGINE

If a non-numeric value receives two or more distinct values in one phase,
no write lands, and the conflict is logged.
```

Total and order-independent. It also produces the right semantics for contested ownership by accident: a tile two forces both claim stays with whoever holds it until one claimant remains. Nobody has to write a rule for that.

**Collections inherit both rules rather than adding a third.**

```
ENGINE

list<T>          concatenation. Lists concatenate only with lists;
                 list + scalar is a load error.

map<K,V>         merge. Writes to different keys commute like set union.
                 Writes to the same key take the rule above for V —
                 numeric sums deltas, non-numeric takes the conflict rule.
```

Concatenation is order-dependent in form and order-independent in effect, because §2 admits no operation that can read a position. That is the standing constraint §2 states, and the reason it must hold.

**Ids are derived from the document, never from a counter.** `"Id": "auto"` resolves by scanning what already exists, so a save, a reload and a replay produce the same ids and every stored `ref` keeps resolving. Creations pending in one phase are assigned in a canonical order — sorted by `(template, creating holder id, effect index)` — so two creations in one phase do not depend on which effect ran first.

**Existence is checked against the working copy.** An entity reduced to zero has its already-computed effects land in full, then takes no further action and is swept in phase 6.

---

## 6. Holders

Everything that carries values is one of these. The engine knows no others.

**Province.** `owner` is the only field the engine requires, because aggregation needs an answer to "whose is this." There is no rule against creating or destroying one — the engine has no idea what a province means, and a scenario that wants to add or remove territory may. Nothing needs to guard this; it simply is not a guarantee.

`owner` is never null. Unowned territory belongs to an actor named `empty`, which is prompted to take no action, so no aggregation anywhere needs null handling. **The loader creates `empty` rather than requiring a scenario to declare it**, since the alternative is a null `owner`, which this sentence says never happens and nothing downstream handles.

`neighbors` is a fixed list of province references, declared once alongside `owner` and never changed at runtime — the map's adjacency is scenario geography, not something play alters. `adjacent(p)` (§2) reads it directly; nothing else may need to.

A province holds the set of entities located on it, reachable as `p.entities`.

Province count should be coarse — tens to low hundreds. Fine granularity overwhelms the AI's context and produces detail the player cannot act on.

**Actor.** Anything that can own, act, and sign. Only the AI creates actors. An actor holds no engine-required fields at all.

**Entity.** Anything that exists at a place or under an owner. §10.

**Modifier instance.** A modifier placed on a target is itself a holder, with values, an update rule and a death condition. §9.3.

**Contract.** An agreement between actors, with parties and a shared lifetime. §11.4.

**World.** The single holder for values that belong to nobody in particular — a tech level, a calendar, anything a scenario needs exactly one of, with nowhere else to live. Not an actor: it cannot own, act or sign, and takes no part in anything scoped to actors, so `sum(actors ...)` never sweeps it in by accident. There is exactly one, and a value attaches to it the same way a value attaches to any other single named holder (§3).

**Institution.** A named grouping of values inside an actor, a province or `World` — an economy, a ministry, a faction, a diplomatic register. It carries values, takes modifier instances at a path, declares emissions (§9.4) and may declare `destroyed_when` (§10.6), which is everything a holder does.

An institution is the only kind with **no root set** (§2). The others are found by searching; an institution is found by naming — `self.faction_opposition.loyalty` — because its identity is which holder carries it plus its own name.

The fourth is the least obvious and the most load-bearing. Because a holder writes only to itself or where permitted, a bomber cannot damage a province — it places a modifier there, and that modifier is thereafter its own thing with its own life. Artillery and aircraft both feed the same one. **The modifier instance is the third party that makes cross-holder effects possible without cross-holder writes.**

The fifth is a deliberate exception. A contract's defining property is a lifetime shared across two holders, which none of the other kinds can express; scoping it to one party would make it directional, and a bilateral agreement that only one side holds drifts the moment either is revised.

The sixth carries no special relational property the way the fourth and fifth do — it exists purely because §3's declaration model has no room for a value belonging to nothing at all, and `World` is the minimal fix for that rather than a new exception to it.

The seventh is what makes internal structure expressible without new machinery. A faction is an institution on an actor whose `writable_by` excludes `owner`: the nation can see its own generals' loyalty and cannot edit it, and — since permissions inherit (§3) — one line on the institution node locks everything beneath it. If that faction should also press on the world, it declares an emission like any other holder.

### Relations are not a kind

The engine has no relation concept and no accessor for one. A scenario builds them from the pieces above, and the shape follows what the relation has to do:

```
ENGINE

dense figures        a map on an institution — trust, opinion, threat.
                     Every pair has one, most are neutral, none needs a
                     lifecycle.  map<ref(actor), float> on `diplomacy`.

something that acts  an institution or an entity. A war that emits
                     attrition onto provinces, can be ended, and carries
                     hooks needs a holder, not a figure.
```

These store different facts and do not duplicate each other: one is how France regards England, the other is the war they are in and what it is doing to the map.

**Relations are directional.** A one-sided war and asymmetric trust come free, but setting one direction and forgetting the other produces a war where only one side is fighting. Nothing enforces symmetry; a scenario wanting it declares a function reading both directions.

Whether every pair exists from the start or only meaningful ones are created is a scenario decision, and an unusually safe one: for every reducer except `count`, an absent relation and a relation at all-default figures give the same answer, so formulas written against one model work unchanged against the other.

A war is a relation plus what is happening on tiles. There is no front object and no war object.

### Aggregation

National figures are never stored; they are summed over holders.

**Aggregations skip holders that lack the value entirely.** `sum(actors as a apply a.institutional_strength)` sums the ones that have it rather than treating the rest as zero, because a zero and an absence are different facts.

That skip is where late binding lives. A scenario addition declaring `energy_output` on a new entity type is picked up by an existing national sum with no formula edited. `get` (§2) generalizes this further: it needs no set to already be assembled, only a tag.

Note the asymmetry with §3: a *direct read* of a missing value returns the type default; an *aggregation* skips it. `<holder>.has(v)` tests presence where the difference matters.

---

## 7. Declaration

### 7.1 Runtime declaration

Most values are declared in the scenario file. Some come into existence mid-game, because they belong to one government and did not exist when the scenario was written. These are ordinary values; the only difference is when they are declared, and to whom. Runtime declarations are almost always scoped to a single named holder.

### 7.2 The registry

**Every runtime declaration is registered before use.** The registry carries the name, the holder, the description, the expected range, and the tick it appeared, and it is shown to the AI each tick.

Because a missing read returns a default rather than failing, the registry is the primary defence against drift — the AI declaring `occupation`, then `occupied`, then `military_occupation` on three successive ticks while formulas keyed on the first quietly read zeroes forever. It also shows which holder each runtime value belongs to.

Expected ranges are not decoration. The engine has no scale convention, so without a stated one two authors pick incompatible scales.

### 7.3 Templates

**A template is an identifier plus a kind.** It declares defaults for anything a holder can have: values, blocks, transactions. One mechanism covers entity types, modifier templates and province presets.

```json
ENGINE

{ "template": "devastation", "holder": "modifier", ... }
```

`holder` names which kind the template produces: `entity`, `modifier`, `contract`, `institution`. Naming anything else is a load error. Provinces and actors have no templates — actors are authored individually.

**Every template kind may declare `arg`**, so one template varies between call sites: an entity's starting size, a modifier's magnitude, an institution created with a starting severity. A template that cannot be parameterised is only reusable by coincidence.

**Find-or-create.** A holder may look for a template, use it if it exists, and add it if it does not. This is what stops the same concept accumulating three names over three ticks, and it does so by making reuse the cheaper path rather than by asking the AI to be disciplined.

**Templates are flat.** No inheritance, no archetype chains. Reuse is by reference and override.

A preset for a holder that already exists is expanded at load, not consulted at runtime.

### 7.4 Labels

A label is a string value whose purpose is selecting a UI treatment. Labels are ordinary values; formulas may read them, which is bad practice but not illegal. Labels change during play, and nothing enforces correspondence between a label and the values beneath it.

### 7.5 Tags

A tag is a name shared across otherwise-unrelated value declarations so that `get` (§2) can gather everything answering to it without knowing in advance where each contributor lives. `cost` is the standing case: an entity's upkeep and a contract's penalty are unrelated declarations that both need to reduce the same actor's `money`, and neither should have to know the other exists.

**A tag declares a type**, the same way a value does:

```json
{ "tag": "cost", "type": "float", "description": "reduces the holder's money" }
```

**A tag is registered once, find-or-create like a template (§7.3), and tracked in the registry (§7.2)** — name, type, description, the tick it first appeared — so the AI reuses `cost` instead of quietly starting a second, parallel pool under a different spelling.

**A value's type must match every tag it carries.** `get` feeds straight into reducers like `sum`/`avg`, which need numbers; a `ref` or `string` value can't answer to a numeric tag. A value declaring a tag whose type it doesn't match is a load error (§15) — caught once, not discovered the first time something tries to sum it.

**Tagging is inert on its own.** A tag nothing ever `get`s does nothing; `get`-ing a tag nothing has declared returns the empty set, which reduces to zero — the same softening as every other absent case in this engine (§3).

### 7.6 Enums

An enum's options are declared once, globally, in the same two-level shape a tag uses:

```json
ENGINE

{ "enum": "diplomatic_state", "options": ["peace", "tension", "war"],
  "description": "..." }
```

A value binds to one through its type — `enum(diplomatic_state)` — the same way `ref(actor)` names what it points at. The **first option declared is the default** (§3), so the order is meaningful and not decoration.

Writing a figure outside the declared options is a write-time rejection (§15), not a silent miss. Enums are registered and find-or-create like tags and templates.

### 7.7 Functions

A named expression (§2) is a declaration like any other, registered in §7.2 and subject to find-or-create. It has a name, a parameter list and one expression, and it may carry `revisable_by` — a scenario that does not want the AI redefining what counts as hostile declares an empty list once.

---

## 8. Writes

Three operations. Nothing else changes anything.

| | writes | may target | expires |
|---|---|---|---|
| self-write | own `value`s | own values | no |
| action effect | `value`s | any value whose `writable_by` names the principal or the action | no |
| transaction | `value`s | own values, and the owner's, where cost resolves up the chain | no |
| creation | — | brings a holder into being | the new holder decides |

Modifiers are not on this list because **modifiers write nothing** (§4). Nor is deletion, because there is none — existence ends by a condition the thing declared itself (§1, §10.6).

**There is no separate agent write.** A writable field is reached through an **implicit action** the engine generates for it:

```
ENGINE

For every value whose effective writable_by is non-empty, the engine
synthesizes an action:

    available   = that value's effective writable_by
    parameters  = one, typed as the value
    effect      = write it to that path
    requires    = true
```

Nothing is authored. A settings-style field still costs its author one permission entry and no ceremony, because the action is generated rather than written.

Three things follow. §12.6 gives a woken actor "the actions its authority permits," and with no second channel that list is now the whole of what an actor can do. There is one gate rather than a rule about every channel. And an open permission becomes a *visible option* instead of an invisible capability, which is what makes §3's open default honest rather than quietly permissive.

**`valid` does not become `requires`.** They fail differently and must stay apart: a failed `valid` is a write-time rejection (§15) — the write does not happen, everything else continues — where a failed `requires` goes to adjudication (§11.2), which is an AI call. An implicit action carries `requires: true` and keeps the value's own `valid` as the write-time check it already was. Merging them would turn every out-of-range nudge into an AI call.

**The director is the one exception**, as §12.1 already says: it never invokes an action and has no `self`, so it writes directly, gated only by whether `writable_by` names `director`.

**Effects are pulled, not pushed.** A bomber does not push damage onto a province; the province's devastation reads how much bombing is happening to it. The active party is the one being changed, except where both parties agreed in advance, which is what a contract is.

Pull looks backwards until you notice what it buys. A holder cannot be changed in a way its own declaration did not anticipate, so an entity is exactly as fragile, as taxable and as destructible as its author said it was.

**Permissions are what make ownership work.** A province declares who may write its `owner` and under what conditions; an entity standing there writes it through the implicit action. The engine needs no capture rule, no reducer returning a holder, and no province-side combat logic — see §10.5.

**Naming an action instead of a principal is how consent to a specific move is given once.** An entity type declaring `"writable_by": ["defect"]` on its `owner` says: this may be rewritten, by anybody, but only through that action and on its terms. That is the whole mechanism behind a unit changing sides — the target does not consent at the moment it happens, because it consented when its type was declared. The same shape covers anything an outside party may do to a holder that the holder anticipated.

---

## 9. Change

### 9.1 Transactions

A discrete write to a `value`.

```
ENGINE

on_create      once, when the holder comes into existence
each_tick      recurring, in phase 1
on_destroy     once, at removal
```

Only a `value` may be written; a transaction against a `formula` is a load error. Every transaction passes the target value's `writable_by`.

**Cost resolves up the ownership chain.** An army's upkeep is charged to its owner's treasury, because the army has no treasury. It passes the owner's permissions, which ownership grants. Cost is charged when an action commits, not when it completes, or an army is queued for free and paid for later.

**The engine has no shortfall policy.** When transactions in one phase would overdraw a value, what happens is scenario business. Values may go negative freely.

The one thing the engine insists on: **a transaction that could not be paid in full fires a notification hook.** What an unpayable army means is the hook's answer. That it went unpaid is not something a scenario may fail to notice.

### 9.2 Two-sided flows

**There is no transfer primitive.** A flow between two holders is a pair of modifiers reading one computed figure with opposite signs — one raising the payer's cost pool, one lowering the payee's — placed by whatever declares the flow, usually a contract (§11.4).

```
ENGINE

actual_payment      a formula on the contract, computed once
fra ← modifier contributing  +actual_payment  to its cost
eng ← modifier contributing  −actual_payment  to its cost
```

**Conservation is a convention, not a construction.** One figure referenced twice with opposite signs stays balanced as long as both ends keep referencing it; two independently computed amounts desynchronise the instant the source cannot pay. The engine does not enforce this — computing the amount once and reading it from both ends is the discipline that keeps it true.

**A flow that cannot be afforded still happens.** The source pays into the red and a hook fires. The debt is visible, the AI is asked about it, and what an unpayable obligation means — default, seizure, renegotiation, war — is the hook's answer.

Flows are instantaneous. A scenario wanting shipping time or interdiction declares a convoy entity and moves it, which is ordinary movement.

### 9.3 Modifiers

A modifier changes what formulas see while leaving the stored figure untouched. What distinguishes it from a transaction is that it composes and expires: many may target one value, they sum rather than overwrite, and removing one restores the original by arithmetic.

A modifier is **declared** once as a template and **instantiated** on a target. The declaration carries what does not vary — `target_value`, `reason`, `hooks`, `destroyed_when`, its permissions. The instance is a holder.

**Instantiating copies the template**, and the copy has its own figures. This is the whole of it, and getting it wrong is the easiest mistake in the engine: a template declaring `age` with `destroyed_when: "age >= 5"` must produce one `age` per instance, or a modifier attached to England at tick 40 inherits France's clock from tick 3 and expires the moment it is created.

**Each instance has an id and lives inside the holder it is attached to.** An id is what lets one holder carry several instances of one template — which §9.4's `on_match: "add"` requires, since "three aircraft bombing the same tile each get their own instance" cannot be expressed by a list of template names. Living inside its target is also why destruction needs no cascade rule: destroy the holder and the instances go with it, as part of the same subtree.

The one case structure does not reach is an instance whose *emitter* dies, since the instance sits inside its target rather than inside the emitter. §9.4 states that default.

**The attach point itself may be a path, not only a bare holder.** `fra.institution_economy_nation` nests the instance inside that grouping rather than directly on `fra` — the same path addressing `target_value` already uses to reach `institution_economy_nation.tax` (below), applied to where the instance sits rather than what it composes onto. Both still resolve within the one actor holder underneath; a path never creates a holder of its own, it only says where inside an existing one the instance lives.

**`destroyed_when` is a deterministic expiration, evaluated the same phase as entity destruction (§10.6) — no AI call, no judgment.** A modifier that should simply be gone after five ticks declares it directly, against a value the instance tracks itself (its own age, say). A `hook` is for the opposite case: a condition where *whether* to remove it is a judgment call, so the AI gets asked rather than the engine deciding. The two are not alternatives to each other — a modifier can have both, one for a hard expiry and one for an earlier appeal.

`target_value` names the `value` instances compose onto — never a `formula` (§3). It must exist on whatever holder the instance is placed on, and the instance must pass that value's `modifiable_by`.

**`target_value` resolves by tag or by explicit path — never by a bare name searched for coincidentally.** A tag (§7.5) is for a concept meant to be found broadly, by anything that deliberately opts in, known types and future ones alike — `growth` registered as a tag, carried by a province's `growth` value, reachable by any modifier targeting that tag regardless of what declares it next. An explicit path (`institution_economy_nation.tax`) is for something already known and specific, anchored to an already-unique, registered name (a template in the `Institution` catalog), so it needs no tag ceremony to be safe. Neither is "the" answer; a modifier author picks whichever matches whether the target is meant to be extensible or precise.

A modifier itself stays single-target — it composes onto whichever holder it is instantiated on, nothing more. Reaching several holders at once (every province a nation owns, say) is not the modifier's job; it belongs to whatever creates the modifier in the first place. See §9.4.

A modifier instance declares a `contribution` — a value or formula, exactly like any other (§3) — which sums onto its `target_value`'s base every time that value is read effective (§4). It may declare other values besides `contribution` to support the calculation (an occupation penalty's own `resentment` figure, decaying independently), the same way any holder can. There is no condition field.

**A modifier instance addresses the holder it sits on as `target`.** A reserved name (§14). Instances have no `location` — that is an entity's field.

**An instance computes its own magnitude by reading its contributors.** Nothing pushes into it. This is what stops modifiers being binary: an occupation penalty holding a `resentment` figure that decays as authority is funded improves visibly rather than flipping.

**A driven modifier cannot be narrated away.** Its magnitude is recomputed from the state of the things driving it. The AI may destroy the emitting entities, contest them, or counter with modifiers of its own — and if the declaration's `revisable_by` is empty, it may not remove the instance either. Otherwise it may.

### 9.4 Emissions

Any holder may declare one or more emissions — not only entities. A contract, an institution, an actor, a province: anything wanting to affect something it cannot write to directly does it this way, because the consent rule (§1) already forbids writing across holders by any other means.

**Emissions are also the only placement mechanism.** There is no second form for attaching a modifier to a named path: a `applies_to` naming one holder is the same declaration as one naming ten, and a holder's stored instances (§9.3) are where placements land, never how they are declared.

An institution declaring an emission is the ordinary way internal pressure reaches the world — a faction whose loyalty falls below a threshold emitting a growth penalty onto every province its actor owns. `self` inside such an emission resolves to the **holder**, so `applies_to: "provinces as p where p.owner == self"` means what it looks like, while bare names resolve inside the institution's own values.

```json
ENGINE

{
  "when":        <expr>,
  "applies_to":  <set-expr>,
  "modifier_id": [ <entry>, ... ],
  "description": <string>
}
```

`when` gates whether the emission is currently active, evaluated against `self` — the holder declaring it — rather than scaling a magnitude the way a modifier's own contribution does. `applies_to` is a set expression, the same `where`/`as` syntax as everywhere else, naming every holder that gets its own instance.

**`modifier_id` is a list, because one emission may instantiate more than one modifier at once, and each needs its own answer to "what happens on repeat."** Each entry is either a reference to a reusable template, carrying its own `arg` and `on_match`, or a full inline declaration with no separate catalog entry at all — the same choice already available for a province's own `Modifier_id` list:

```json
ENGINE

{ "modifier_id": <name>, "arg": {...}, "on_match": "cancel" | "override" | "add" }
{ "target_value": <tag-or-path>, "values": {...}, "destroyed_when": <expr>, "on_match": "cancel" | "override" | "add" }
```

**A named entry may always carry `arg`.** A reusable template is only actually reusable if it can vary between call sites — `modifier_removed_cost` is used twice in one contract with opposite-signed `removed_cost` values; without `arg`, it would need a separately-named template per amount, which defeats naming it at all. An inline entry has no need for this — there is only ever the one call site, so a specific figure is simply written in place.

**`on_match` lives on each entry, not once for the whole emission**, because different modifiers instantiated by the same emission can want different repeat-handling — one might be a persistent condition, another an independently-stacking effect. It decides what happens when a given holder already has a matching instance of *that entry*:

- **`cancel`** (default) — leave it alone. For a persistent condition: a standing devastation effect several sources contribute toward, a reward that should just keep existing while its own `destroyed_when` counts down.
- **`override`** — replace it with a fresh one. For something meant to refresh on reapplication rather than sit on its original clock or accumulate a second copy.
- **`add`** — always create another, regardless of what already exists. For independent, additive sources: three aircraft bombing the same tile each get their own instance, and the ordinary "modifiers sum rather than overwrite" rule (§9.3) does the rest. Repeated application by the same source over several ticks also just produces several instances here — correctly, as long as each is given a `destroyed_when` matching how long one application's effect should actually linger.

**Matching, and what `on_match` decides, happens once per holder named by `applies_to`, per entry, independently.** A ten-province set can be in ten different states on the same tick — most already matched from a prior tick, one newly qualifying (a province just conquered, say) — and each is resolved on its own terms. This is what lets `applies_to` reach a newly-qualifying holder automatically: the check is never "has this emission done anything yet," only ever "does *this* holder already have a match for *this* entry."

**Find-or-create, generalized, is still what makes independent sources compose correctly rather than collide.** Artillery and aircraft emitting the same template at the same tile with `on_match: cancel` still land on one shared instance; adding a third source is a third emission, not a third feature.

If a resolved holder does not have whatever `target_value` names, the emission is logged and does nothing there. This is the most dangerous silent failure in the engine and cannot be caught at load, because targets resolve at runtime.

**An instance an emission creates is destroyed when the holder that declared the emission is destroyed, unless the entry says otherwise.** This is the default because the instance has no independent reason to exist — it was driven by something, and that something is now gone. The one place this default doesn't apply is an actor's own elimination (§12.7): elimination is a judgment call the AI answers, not a mechanical event, so cascading automatically there would decide the question before the AI is ever asked. Everywhere else — a contract dissolving, an entity's `destroyed_when` firing — destruction is mechanical, and cascading its emissions' instances is the safe default.

---

## 10. Entities

### 10.1 Type and instance

A **type** is a template. An **instance** is an id, a type, an owner, a location and current values.

Every value on an instance starts from its type, and an instance carries its declarations in full rather than referring back (§17). Two instances of one type therefore begin identical and may diverge — by a figure that moved, by a modifier composed on top, or by a revision that touched one and not the other (§12.5). Sameness is maintained by an empty `revisable_by` where it matters, not guaranteed by the format.

### 10.2 Owner and location

There is no `scope` and no `host`. An entity carries two independent refs, and that is the whole arrangement:

```
ENGINE

owner       ref(actor)      who holds it
location    ref(province)   where it is, or null for nothing on the map
```

**They are independent, and both matter.** An army in enemy territory is owned by the invader and located in the defender's province — which is not an edge case, it is how §10.5's capture works, since an entity standing on a province it does not own is exactly what writes that province's `owner`. An occupation authority is the same shape.

**A null `location` is permitted, not required.** Something owned by an actor and standing nowhere — a depopulated remnant, anything a scenario needs off the map without destroying it — simply has none. Every map mechanism already excludes it without a filter being written: §10.5's encounters fire on entities *sharing a tile* and null shares none, `p.entities` lists what is located in `p`, and §10.3 admits only entities declaring the relevant block.

**Both are values, because both change.** Position in the document is for what does not move. A unit defecting to another faction is an ownership change, and if position *were* ownership that would mean shifting a node between parents — an operation nothing else in the engine performs. Ownership changes for the same kinds of reason `location` does, so it gets the same treatment: a field, writable under whatever permission its type declares.

A document may still *file* entities under their owner for legibility. That grouping is a rendering of `owner`, not a second copy of it, and cannot drift from the field it is derived from.

**Entities do not contain entities.** With `host` gone there is no link from one entity to another, so `e.entities` is always empty. Divisions inside an army are not expressible, which is the one real cost of collapsing the three arrangements into one, and is consistent with §6's preference for coarse granularity.

### 10.3 Blocks

A type declares blocks. Each block admits the entity to one phase and is a set of expressions the entity evaluates about itself.

```
ENGINE

movement        the entity may change its own location
on_encounter    the entity reacts to sharing a tile
```

Emissions are not in this list — they are a general capability any holder may declare (§9.4), not an entity-specific block. Nor are the three transactions (§9.1) or `destroyed_when` (§10.6), which a type also declares and which are not phase admissions. The list above is complete: two blocks, and no others.

**There are no capabilities.** A type that declares a movement block moves; a type that does not, does not. Declaring capabilities alongside the blocks implementing them is the same fact twice, and the two drift the moment one is edited.

Each phase iterates only the entities holding the relevant block. **A block is not required to exist.** A type declaring none is a thing that sits there holding values and paying upkeep, which is exactly what a deposit or a fortification is.

### 10.4 Movement

Movement is not a bespoke engine mechanism — it is an ordinary `value`/`formula` construction, the same primitives every other self-referencing figure in this document already uses. What makes it feel different is only that its formulas are evaluated in phase 2, ahead of Encounters, rather than phase 4 with everything else (§5) — so an arrival is visible to the encounter that same tick, not the next one.

`destination` is a `value`: typed `ref`, `writable_by`-gated (an action, or a principal, per §3), checked against an adjacency `valid` at write time. `progress` and `location` are both `formula`s — self-referencing, using `prev.base`, exactly like `money` or `gdp`.

```json
ENGINE

"destination": { "kind": "value", "type": "ref(province)",
                 "writable_by": ["owner"],
                 "valid": "count( adjacent(self.location) as c where c.id == value ) > 0" },

"progress":    { "kind": "formula", "type": "float", "bounds": [0, 1],
                 "formula": "if( prev.base >= 1, prev.base - 1,
                                  prev.base + self.speed
                                  / (1 + destination.ruggedness * self.ruggedness_penalty) )" },

"location":    { "kind": "formula", "type": "ref(province)",
                 "formula": "if( progress.base >= 1, destination, prev.base )" }
```

**Arrival is a plain conditional read, not a phase-2 procedure.** `location`'s formula snaps to `destination` the instant `progress` crosses 1; nothing else has to notice or react. There is no separate landing step — reading `location` once `progress` has crossed 1 already gives the new answer, because that is what the formula says.

**Movement is simultaneous for the same reason every formula is.** §1's phase-freezing invariant already guarantees every entity's `progress` and `location` are computed from the same frozen state before any of them is read elsewhere — this is not bespoke to movement, it is the general rule, applied here rather than invented here.

**One tile per tick still holds, and it falls out of the formula rather than being enforced by a step.** `progress`'s own formula only ever subtracts 1 once per evaluation, and it is evaluated exactly once per tick — the same "advances once per phase" rule that governs every other self-referencing formula (§5).

**Carried progress is still a scenario knob**, expressed the ordinary way: `bounds: [0, 1]` on `progress` discards any excess above a full tile; a wider bound (say `[0, 2]`) lets a fast entity bank a fraction of the next leg instead of losing it.

**The one thing this construction doesn't do for free: `destination` isn't cleared on arrival.** A `formula` can't write anything — `location`'s formula can *read* `destination`, it can't reset it — so once an entity arrives, `progress` keeps accumulating toward the same, already-reached province until whatever governs `destination` issues a new order. Nothing breaks — `location` just correctly stays put, since re-arriving somewhere already occupied is a no-op — but it is a known rough edge, not a resolved one. A scenario wanting a clean "arrived, awaiting orders" state needs `destination` itself to declare some notion of expiring, which nothing here does automatically.

**Simultaneity still permits a swap.** Two entities exchanging tiles still pass without meeting, for the same reason as before — nothing reads `p.entities` mid-tick, only at the frozen boundary — and it is still a withdrawal under §10.5, not an exploit. A scenario wanting sticky fronts writes zone of control: a formula zeroing `progress` while hostile entities shared the location at last evaluation.

**Partial progress is still not partial presence.** An entity at `progress` 0.9 reads `location` as wherever it currently, fully is — there is no intermediate value for `location` to take, because the formula is binary: arrived, or not.

Everything else is unchanged: speed and terrain penalties are ordinary values, impassability is `progress`'s formula multiplying by `(destination.is_water == 0)`, a multi-province order is a `value` holding the remaining steps and a `formula` writing the next one, and **the engine never sees a path.** Retreat is an entity writing its own `destination`, which still costs a tick, because the write lands at the end of whichever phase issued it and is read at phase 2 of the next tick.

### 10.5 Encounters and ownership

**When two or more entities share a tile, the engine fires one encounter event for all of them at once.** That is the whole mechanism.

The simultaneous firing is what makes a battle a battle. Neither side finds the other by looking — an entity that moved this tick is not in that tile's roster from before movement, and the tile it came from is not where it now stands. The event hands each participant the others as `others`, excluding self.

**The engine has no concept of combat and no concept of sides.** No trigger field, no participant filter, no partitioning. Hostility is a condition inside the expression, and a peaceful meeting evaluates to zero.

Three things follow:

**An entity is only as vulnerable as it says it is.** A block declaring nothing is an immortal entity. A merchant convoy that takes no damage from armies simply does not mention them.

**Concealment has no mechanism.** It is a filter in the victim's own block: you take damage from what you can see. Detection, interdiction and surprise are one line each.

**Ownership is not an encounter concern.** A province's `owner` is a value with a permission set and a `valid` expression. An entity writes it; the province decides who may and under what conditions.

```json
ENGINE — the shape; the condition is scenario data

"owner": { "type": "ref(actor)",
           "writable_by": ["actor"],
           "valid": "..." }
```

**A province's `owner` must always carry both fields explicitly.** Permissions default to open (§3), so an `owner` declaring neither is not locked — it is writable by any principal, unconditionally, and offered to every actor as a visible option through §8's implicit action. The capture rule is then not permissive but absent: anyone takes any province from anywhere, with no army present.

A `valid` of the usual shape reads "write it only if you have force here and the current owner does not":

```
ENGINE

"valid": "count( self.Entity as e where e.owner == value
                   and e.type == \"entity_army\" ) > 0
          and count( self.Entity as e where e.owner == prev.base
                       and e.type == \"entity_army\" ) == 0"
```

Capture therefore happens in phase 1, as an ordinary transaction or action, which means **it lags one tick behind arrival**. This is the correct behaviour and resolves what was previously ambiguous: an entity must survive to the next tick's phase 1 to take a province, and a garrison destroyed this tick is gone before the claim is evaluated, so nothing ever tests against a defender that no longer exists.

Two claimants in one phase produce distinct ref writes, so §5 applies: no write lands, and the tile stays with its holder until one claimant remains.

Provinces have no blocks. They have values, permissions and `valid` expressions, which is enough.

### 10.6 Destruction

Every type declares `destroyed_when`, an expression removing the holder when it holds. Evaluated in phase 6, firing `on_destroy` transactions. Any holder may declare one — an entity, a modifier instance, an institution, a contract.

**This is the only way anything is destroyed.** There is no delete verb, because a verb that removed a node would be the one operation changing something its own declaration never permitted (§1). Existence ends on terms the thing itself stated, the same way every write passes a permission the target stated.

That covers deliberate removal too, without a second mechanism. A faction that may be dissolved declares

```
ENGINE

"destroyed_when": "loyalty <= 0 or purge_ordered == 1"
```

and an action writes `purge_ordered`, gated by that value's own `writable_by`. "This may be dissolved, but only through the purge action, and only once it is already weak" is then ordinary permissions plus one expression.

An entity reduced to zero has already computed its effects for this tick and they land in full, but it takes no further action and is gone before the next tick begins.

**Cascade is mostly not a rule.** A modifier instance lives inside the holder it is attached to (§9.3), so destroying that holder removes its instances as part of the same subtree — nothing to specify and nothing to forget. The one case structure does not reach is an instance whose *emitter* dies, which §9.4 covers by default. Everything else is `destroyed_when`, which can test whether something still exists through `has` and through §3's default-on-unresolved-id.

Destruction while an owner is eliminated still leaves those decisions to the AI (§12.7). **The engine cascades nothing it has not been told to.**

### 10.7 Entity or value

If it costs money and can be created or destroyed, it is an entity. If it is a property of something that already exists, it is a value.

A ministry is an entity — "no occupation authority exists, so capacity is zero" is correct semantics, where a scalar defaulting to some figure is a fiction, and an entity gets transactions and blocks for free. War weariness is a value; it is not a thing you build.

---

## 11. Agency

### 11.1 Actions

The vocabulary for a choice with real structure — a requirement, a cost, an effect that creates something or reaches toward another actor's consent. Not the only way a value changes: a field the owner is directly permitted to write (§8) needs none of this and shouldn't be wrapped in an action just to have one. A raw settable number is a UI over `writable_by`; an action is for everything a bare write can't express.

```json
ENGINE

{
  "action":     <name>,
  "requires":   <expr>,
  "available":  ["player", "ai"],
  "approval":   [ <actor-ref or expression resolving to actors> ],
  "parameters": { <name>: { "type": ..., "filter": <expr> } },
  "effect":     [ { "write": <path>, "id": ..., "template": ...,
                    "arg": { <local path>: { "value": <expr> } } } ]
}
```

**There is no cost field.** An action that costs something places a one-tick modifier carrying the `cost` tag, which is the mechanism §9.1 already describes, and gates affordability in `requires`. A separate declarative cost would be a fourth statement of the same fact, free to drift from the effect beside it. An action may carry a label for interface grouping, and a displayed price is a label.

**A parameter is an input, not a destination.** One parameter is routinely read several times — in `requires`, and by more than one effect — so it cannot carry a single target. It has a type, an optional `filter` narrowing what may be chosen, and nothing else.

**An effect's `write` establishes a root, and every `arg` key is a path local to it.**

```
ENGINE

{ "write": "self.Entity", "template": "entity_army", "id": "auto",
  "arg": { "location":          { "value": "location" },
           "Values.soldiers":   { "value": "soldiers" },
           "Values.cost.Value": { "value": "soldiers * 7" } } }
```

Local addressing is what lets an effect reach inside something that does not exist yet, since there is no id to name. It also states the root once: an absolute path in every `arg` would restate it and the two would drift on the first edit.

Reaching outside the root is not possible and does not need to be — touching a second place is a second effect entry.

**The depth of an `arg` key decides what its payload must be, and nothing declares it.** A path ending at a `calculated_value` takes a figure; at `Value`, a literal or expression; at a value name, a whole value body; at `.`, the root itself, a whole node. The document's shape already implies what belongs at each depth (§17), so the check is the engine reading its own skeleton. Authoring an entire institution and setting a number are the same operation at different depths.

**`approval` names actors whose consent is required before any effect lands.** All must approve; a refusal means nothing is written. Empty or absent is the common case. This is what lets a contract be created by an ordinary action while still being agreed by both parties, and it is the only thing in the vocabulary that asks more than one actor.

`ai` here means an actor AI playing a nation — never the director, which has no `self` and never invokes an action (§12.1). Every write passes the target value's `writable_by` and `valid`. Nothing is interpreted from prose.

**There is no domain field.** `requires` already names what it reads and is strictly more expressive than a category label. An action may carry a label for interface grouping, which means nothing mechanically.

**No action reaches into another actor** without that actor's declared permission. Declaring war writes your own relation. Invading moves your own armies and lets the target's own declarations decide what that costs. This is not a restriction that had to be enforced; it is what the consent rule already meant, seen from the action layer.

Recruiting an army is an action that creates an entity, so it needs no build-cost schema of its own.

### 11.2 Free, contested, blocked

Evaluating `requires` gives one of three results.

**It passes** and the action executes immediately, with no AI call. This is the common case and it must stay cheap.

**It fails** and the action goes to adjudication. A failed `requires` is not a refusal — it is the point at which somebody other than the actor gets a say.

**A standing rule forbids it**, and making it possible means changing that rule, which is itself an action.

### 11.3 Authority and adjudication

Actors carry authority values that actions test in `requires`. The naming is scenario convention and nothing in the engine enumerates them. Authority is an ordinary `value`, so it moves.

A contested action goes to one AI call. The model plays the actor's internal blocs — institutions on the actor, or entities it owns that stand nowhere on the map, selected **by type, not by label** — and returns approved, approved with amendment, or rejected, plus consequences. A scenario declaring no such thing has no internal politics.

A bloc is ordinarily an institution whose `writable_by` excludes `owner`: the nation reads its own factions and cannot edit them (§6). If a faction should also act on the world rather than only withhold consent, it declares an emission like any other holder (§9.4).

**Adjudication cost scales with instability, and nothing caps it.** A fragile republic contests most actions, so a player in one triggers a call nearly every tick. Every obvious mitigation — batching, a cheaper first pass, resolving some contests on a formula — changes the feel of playing a weak government, which is the thing the mechanic exists to convey. Left uncapped deliberately; measure it before mitigating it.

### 11.4 Contracts

```
ENGINE

parties        who signed
description    plain language: what was agreed and why
values         figures the contract computes, read by its own emissions
emissions      the modifiers it places, and where
hooks          conditions that wake the AI to revisit
destroyed_when when it ends without anyone deciding
```

A contract is a bundle of effects with shared lifetime and joint authorship. **Contract dies, its modifiers die with it** — §9.4's default, since instances its emissions were driving have no independent reason to exist. There is no clause primitive.

**A contract is created by an ordinary action**, like everything else. What distinguishes it is `approval` (§11.1): the action names the other parties, and none of it lands unless they agree. That is what makes a two-sided arrangement genuinely two-sided without contracts needing a creation path of their own.

`owner` on a contract resolves to **any party** (§3), which is how a bilateral agreement stays writable by both signatories without either being "the" owner.

**Signature can fail.** A term targeting a value whose permissions the contract does not satisfy cannot be declared. **The AI must be told which term failed and why** — the value, the permission that blocked it, and which party holds it. All public information, so this leaks nothing. Without it the AI renegotiates blind, produces a variant that fails identically, and loops.

**Nothing compels compliance** except consequences. The AI must reason about whether a partner will comply rather than treating signature as binding. A flow that cannot be afforded still executes and drives the payer negative, which is debt rather than non-compliance; refusing to pay at all is a revision, which is an act with a stated reason and a hook.

*Open:* nothing accumulates a compliance record, so reputation has no source. Under the consent rule it cannot be an engine feature — it has to be a value on the relation that the injured party's own logic updates.

---

## 12. The AI

### 12.1 Two roles, one model

**The director** manages the world. It plans, wakes actors, adjudicates contested actions, sets the quantities it owns, and narrates. There is one.

**The director never invokes an action and has no `self`.** `self` is only ever the actor a value or an action belongs to (§14), and the director isn't playing as any actor — everything it does (a direct write, placing a modifier on an explicit `target`) already names its target explicitly, the same way those channels work for anyone else.

**An actor AI** plays one nation from the same action vocabulary the player uses. One per actor the player is not.

```
ENGINE

Does:      set modifier magnitudes, negotiate and revise
           contracts, adjudicate, set the quantities it owns, act for every
           actor the player does not, narrate

Does not:  write a formula (formulas are never written, only evaluated);
           write any value whose permissions do not name it; revise a
           declaration it may not revise; alter the resolution of an
           encounter that has already resolved
```

The last one is the load-bearing one, and it needs stating precisely. The AI is always woken *after* encounters resolve — wakes are phase 8, encounters phase 3 — so it necessarily sees results before it acts. What it may not do is reach back into a resolved tick. Influencing the *next* battle through modifiers on strength, morale and supply is the intended channel, and locking the encounter rules is what lets both sides trust the resolution.

### 12.2 Access

**The AI never knows less than the player.** Everything the interface can show, the model can reach, by query rather than by being handed a snapshot of whatever someone thought was relevant. A model that must reason about a war it cannot inspect will invent the parts it cannot see.

All game state is public. **Director and actor reasoning are private**, and the director is the only thing that reads another actor's private text. Bluffing about capability is therefore impossible; bluffing about intent is not, and intent is the more interesting kind.

### 12.3 The plan

Free text, one per actor plus one global, with a size cap. Nothing in the rules reads it, so it needs no structure. **If a quantity in the AI's thinking must be read by a formula or hook, it is a declared value instead.**

At the end of the player's turn the director writes a through-line — prose, not a schedule. Then it sleeps and ticks run.

**The director executes one thing at a time.** When a planned moment arrives it wakes, checks the plan against what has actually happened, does one thing, and writes the next intention. The plan supplies coherence across a hundred ticks; one-at-a-time execution supplies the ability to change its mind. A plan written before an inflation crisis otherwise produces a stimulus during one.

A planned wake is not a scheduled wake. An actor woken on a timer is asked "what do you want to do" with nothing in front of it, and invents conflict to have something to say. A director returning to its own stated intention is answering a question it posed itself with reasons attached. **Only the director holds a plan.**

Actor text carries a tick stamp and is rewritten on waking.

### 12.4 Hooks

**Anything persistent declares the conditions under which the AI reconsiders it.** Modifiers, contracts, emissions, entities, institutions. An emission with no hook runs forever with no negotiated end; a punitive modifier with no hook is a permanent tax the player cannot appeal.

**A hook decides who is asked, and may also act.**

```
ENGINE

{
  "trigger": <becomes | crosses expression>,
  "respond": {
      "action": <name>,                  fire it, no AI call
      "arg":    { <local path>: { "value": <expr> } },
      "wake":   <principal>              or / and, wake an AI
  }
}
```

Both `respond` keys are optional and may appear together. Absent, the hook wakes the holder's own owner, which is what §12.6's forced-wake list already means.

**`wake` draws on §3's principals**, not a second enumeration: `director`, `owner`, `player`, or a named actor tag. `actor` is the one that does not transfer — in `writable_by` it is a *test* against whoever is asking, and with nobody asking the only reading left is "wake all of them," which is a fan-out to the entire world from one hook. A scenario wanting several actors names a tag; one that cannot predict which wakes `director` and lets it decide, which is the call §12.6 built for exactly that.

**A hook-fired action is an ordinary invocation.** It runs as the holder's owner, evaluates `requires`, and on failure adjudicates like any other action. `available` is not checked — a hook is not a principal making a choice, it is the scenario's own declaration acting on its own holder — and every write still passes the target's `writable_by` and `valid`. Latching (below) is what stops a fired action repeating every tick while its condition holds.

**`wake` is never budgeted.** `wake_budget` caps the director's discretionary judgment about who might be interested (§12.6); a hook is the scenario stating that something matters, and §12.6 lists hook firings among the forced wakes. Budgeting them would also contradict the rule below that the engine never silently drops one.

A hook condition is not an ordinary expression, because expressions read one frozen state and a hook fires on a change between ticks.

```
ENGINE

becomes <expr>          fires when the expression goes from 0 to nonzero
crosses <expr> [bands]  fires when the expression passes a listed boundary
```

**Comparison is phase 7 against phase 7 of the previous tick.** A value may move several times within a tick; this is the only comparison that latches predictably.

**Binary conditions fire on transition** and re-arm when the expression returns to 0.

**Banded conditions fire once per crossing.** Crossing from the start of the band list toward its end fires; crossing back does not, and re-arms. This is what "the worsening direction" means mechanically — the author states it by the order they write the bands, because the engine cannot know which way is worse for an arbitrary expression.

Without bands, the transition rule swallows anything that worsens without a boundary being crossed: a war whose conduct becomes atrocious was already a war.

**A latch re-arms only on re-entry.** If the AI declines to act, the hook does not re-fire until the expression returns to 0 (for `becomes`) or enters a different band (for `crosses`). Otherwise the model is asked the same question repeatedly and eventually renegotiates a working treaty into nothing.

**There is no hook budget.** Hooks are written by the scenario and fire deterministically; if a ruleset produces too many, that is a structure problem in the ruleset. The engine does not silently drop them, because a dropped hook is a consequence that quietly did not happen.

### 12.5 Revision

**The AI may reach into any modifier, contract, institution or entity at any time and revise it**, hook or no hook, because conditions go stale in ways nobody anticipated. One constraint: **a revision is a visible, narrated act with a stated reason.**

**Revision is not a separate mechanism.** §11.1's parameters target any depth, so rewriting a formula is a write to `value`, changing a cap is a write to `bounds`, and both pass `revisable_by` (§3) exactly as a figure passes `writable_by`. There is no `fixed` flag and no scenario-wide revision switch; a rule nobody may change declares `"revisable_by": []`, and one only the director may change declares `["director"]`.

**That lock cannot be picked**, because `revisable_by` governs itself (§3). An empty list cannot be revised into a non-empty one, which is what closes the hole a flag would otherwise leave: without it, every playthrough eventually becomes whatever the model found narratively convenient.

**A revision reaches only what it edits.** Every instance stores its own declaration in full (§1), so there is no propagation: revising one actor's institution leaves every other copy standing, and changing a rule everywhere means changing it everywhere. This is the price of instances being allowed to diverge at all, which is what storing full declarations buys.

A rule that must stay genuinely shared across instances declares `"revisable_by": []`, and then no copy of it is revised by anyone.

The registry (§7.2) shows the AI what it may not move, so it does not spend attempts on rules it cannot change.

**A closed rule still reads live values.** `"revisable_by": []` on an encounter block freezes what a battle *does*; it says nothing about the figures the block reads, which remain writable and modifiable under their own permissions. That separation is the point — §12.1's intended channel is pressure on strength, morale and supply, not rewriting the resolution.

### 12.6 Waking

An asleep actor is not frozen: its economy grows, upkeep is paid, contract flows happen, formulas update, hooks are evaluated. **Sleep means no AI reasoning, not suspended simulation.**

**Wakes are reactive only.** No scheduled or rotation wakes for actors.

**A wake is caused by a change in the shape of what an actor holds**, not by a number moving. A new event on a province it owns, a new modifier on one of its entities, a new declaration, a new contract, a relation that did not exist before. Its revenue falling because a trade partner's prices moved does not, however large the fall — numbers move every tick for everybody, and if numeric change woke actors the sleep mechanism would be decorative. Something that matters and is purely numeric gets a hook.

**Reads never wake anyone.** A missing-value read is logged and delivered on the next wake.

Forced wakes, deterministic and computed for free:

- A structural change to something it owns
- The `owner` of a province it neighbours changes, or its own does
- A contract it is party to is signed, strained, broken, or expires
- Another actor's entity enters a province it owns
- **War with it is declared, or ends**
- A hook fires on its own state

The first must be deterministic, or a player can act freely wherever nobody is watching.

*"It is at war" was previously listed and is a state, not a change. As written it force-woke both belligerents every tick for the duration of a war, exempt from the budget, which made the largest AI cost in the engine invisible. War-level figures that should provoke reconsideration get hooks on the relation.*

*Open:* sphere of interest is referenced here and nothing establishes it.

Everything else goes to one cheap director call returning a short list of actors and reasons. **The director wakes, never instructs** — *Argentine grain production has collapsed and you import from them*, not *you should intervene*. Supplying intent makes every actor one mind. **Wake reasons cite public facts only**, or private reasoning leaks and the information asymmetry the diplomatic layer rests on is gone.

```
ENGINE

wake_budget    maximum actors the director may wake per tick
liveliness     director-side narration of quiet actors; produces text, never actions
```

**`wake_budget` is the only cap in the engine**, because the director's calls are the one cost it controls. Over budget, keep the wakes nearest the player and drop the rest; dropped actors keep their inbox entries and react later. Forced wakes are exempt.

`liveliness` deliberately grants no agency. A rotation wake is exactly the empty prompt this section forbids. At zero, the world beyond the player is a spreadsheet that grows, which is correct for a tightly authored scenario.

**The inbox** is an engine-written log per actor receiving what happened to it while asleep. No tokens, empty on most ticks; thirty ticks of absence becomes a dozen lines on waking.

A woken actor's options are the actions marked `available: ai` that its authority permits, plus an explicit no-op. **A nation that protests, sends an envoy and sleeps again is the most common correct outcome.**

### 12.7 Elimination

**Elimination is a hook, and the AI decides what it means**: cessation, government in exile, rebel faction, absorption. An actor losing all its provinces is not automatically eliminated.

The engine cascades nothing. Contracts it signed, entities it owned abroad, relations pointing at it, and modifier instances its emissions were driving are all part of the AI's decision. If it destroys the actor it must destroy what pointed at it.

---

## 13. The span

```
ENGINE

1  The player acts          once, from the action vocabulary
2  The director plans       writes a through-line, then sleeps
3  The player commissions   N ticks
4  Ticks run                the player watches the map change
5  The player may halt      at any point, returning to 1
```

The player does not act every tick. A hook firing at tick 7 of 100 calls the AI; the player sees the call and what it did, and may halt. **Nothing halts automatically.**

This is what lets the tick be cheap. An economy compounding for a hundred months costs almost nothing; a hundred rounds of AI deliberation would cost everything. **The AI is called when something happens, not because time passed.**

### Victory

There is none. The engine declares no victory condition, no defeat condition and no place to put one — what winning means is whatever the player makes of it, and elimination (§12.7) is a separate mechanism answering a different question.

---

## 14. Reserved names

A declaration colliding with one is a load error, checked against every value the name could hold. The same validation blocks AI runtime declarations.

```
ENGINE

id              holder identity
type            which template a holder was built from
owner           which actor holds it
location        an entity's current province, or null
destination     an entity's next province
progress        movement toward destination
entities        qualified: the set of entities on a province
                unqualified: the root set of all entities
provinces       root set
actors          root set
contracts       root set
target          the holder a modifier instance is placed on
contribution    a modifier instance's own figure, summed onto its
                target_value's base
prev            prefix for a field's own prior figure — always prev.base
                or prev.effective (§4), never bare
base            a value's stored figure, ignoring active modifiers
effective       a value's stored figure composed with active modifiers
self            the holder the expression belongs to
value           what is being written, inside a valid check
key             a map entry's key, inside a pipeline binding one
others          the other participants, inside an encounter block
tags            the tags a value declaration carries
```

`value` is reserved only as a **bare** name inside a `valid` check. `<bound>.value` — a map entry's figure — is a qualified reference in a different syntactic position, and §2's requirement that every reference be qualified is precisely what keeps the two apart.

`scope` and `host` are no longer reserved. §10.2 collapsed three arrangements into one, and neither name has anything left to say.

Block names are reserved identically: `movement`, `emissions`, `on_encounter`, `on_create`, `each_tick`, `on_destroy`, `destroyed_when`.

`empty` is a reserved actor id, holding unowned territory. `world` is the reserved name of the singleton holder (§6) — not an actor — holding values scoped to no particular actor or province.

---

## 15. Constants and validation

```
ENGINE

DIV_EPSILON    denominator magnitude below which division saturates
MAX_VALUE      the saturating figure, and the ceiling on any composed value
WORLD_SEED     the seed every random() draw hashes against (§2)
wake_budget    maximum actors the director may wake per tick (§12.6)
liveliness     director-side narration of quiet actors (§12.6)
```

`DIV_EPSILON` and `MAX_VALUE` must be set relative to the scenario's scale, since the engine has no scale convention.

**All five live in the scenario document**, not in machine configuration: every one of them changes what the simulation does, and `WORLD_SEED` in particular must travel with a save or a replay is a different history.

**Load errors.** The scenario does not run.

- A formula referencing its own name other than via `prev.base` or `prev.effective`
- A transaction targeting a formula
- A reducer other than `count` over a set of holders
- A reducer other than `count` over a map, which cannot guess between keys and values
- A recursive function
- A declaration colliding with a reserved name
- A template naming a `holder` kind that does not exist
- A modifier template whose `target_value` is not a `value`
- A value carrying a tag whose declared type does not match the value's own type
- A type error: `list + scalar`, a numeric reducer over a non-numeric collection, or a value whose declared type cannot hold its own expression
- `bounds` on anything but `int` or `float`
- A permission entry that is not a known principal or action name — the vocabulary is closed, and a misspelling must not read as an unfamiliar actor tag
- A province listing itself in `neighbors`, which would put `p` inside `adjacent(p)`

A permission naming a principal that *cannot* resolve on that holder kind — `owner` on `World` — is **not** an error. It matches nobody, which is a thing an author may legitimately want, and is different from a misspelling.

**Write-time rejections.** The write does not happen; everything else continues.

- A write failing its `valid` expression
- A write by a principal not in `writable_by`, where one is declared
- A modifier placed by a principal not in `modifiable_by`, where one is declared
- A `destination` not adjacent to `location`
- A figure written to an `enum(<name>)` that is not one of its declared options
- A revision of a declaration whose `revisable_by` does not name the reviser
- A contract term that cannot pass the target's permissions — reported to the AI naming the value, the permission and the party
- Two or more distinct assignments to one non-numeric value in one phase — no write lands

**Runtime logs.** Nothing stops.

- A read of a value a holder does not have, returning the type default
- A transaction that could not be paid in full, which also fires a hook
- An emission whose `target_value` does not exist on the resolved target

The last is the most dangerous entry here. It is the case where a mechanic quietly does nothing for forty ticks, and it cannot be caught at load because the target resolves at runtime.

---

## 16. Build order

Each stage is playable, or at least inspectable, before the next begins.

**1 — Numbers.** Expressions, sets, functions, values, kinds, types, defaults, bounds, division, modulo, truncation, coercion, randomness, phase freezing. One province, one actor, an economy that compounds. No AI, no entities, no map. If the arithmetic is wrong here it is wrong everywhere.

**2 — Holders and declaration.** The seven kinds, templates, find-or-create, the registry, reserved names, runtime declaration. Declare by hand and confirm that a value declared on one actor exists nowhere else.

**3 — Change.** Transactions, two-sided flows, modifiers, instances, composition, permissions. A modifier placed by hand should visibly alter a `value`'s effective reading and vanish cleanly when removed. **Test the phase barrier here:** write a value from a transaction and confirm its `prev.base` sees the written figure at the next phase.

**4 — Entities and the map.** Types, blocks, movement, adjacency, encounters, emissions, destruction. Armies move and meet. First stage that looks like a game.

**5 — Actions and authority.** The vocabulary, `requires`, `approval`, implicit actions, the player's seat, ownership via `valid`. Playable single-player against a static world.

**6 — Hooks.** `becomes`, `crosses`, latching, `respond`, the unpayable-transaction hook. Nothing consumes them yet; log them and read the log, because a wrong firing discipline is invisible once the AI is attached and very hard to find later.

**7 — The AI.** Director, actor AIs, the plan, waking, structural change, the inbox, the budget.

**8 — Contracts and adjudication.** Depends on everything.

**9 — Spans.** Commissioning, watching, halting. Last: it is a loop around a working game and only makes sense once a tick is cheap.

Stage 6 before stage 7 is the load-bearing ordering decision. Emissions sit in stage 4 rather than 3, since they need holders to place instances on. Everything else can be reordered.

---

## 17. The document

The engine reads one document. Its skeleton is fixed and its contents are not, and the boundary between them is what makes everything above checkable.

### Fixed and open

```
ENGINE

FIXED    a keyword. Literal, verbatim, part of the engine. Nothing
         creates, renames or removes one.

OPEN     an authored name. Created, changed and removed at runtime by
         the director or by an action — there is no finer distinction.
```

"Director" means the AI director or the person writing the scenario; the engine does not tell them apart.

### Levels alternate

```
ENGINE

Actor  .  <actor_id>  .  Institution  .  <inst_id>  .  Values  .  <value_name>
FIXED       OPEN            FIXED         OPEN        FIXED       OPEN
```

Odd depths are keywords, even depths are names. `World` is the one exception: being a singleton it has no `<id>` level, so its keywords sit adjacent.

**This is not cosmetic.** Because the skeleton is fixed, any path implies the shape of the node that belongs at it — which is what lets §11.1 check an `arg` payload against its destination without anything declaring what it is.

### Roots

```
ENGINE

CATALOG    Tag    Enum    Function    Settings
           Institution    Entities    Modifiers    Actions

STATE      Actor    Provinces    World    Contract
```

Catalog roots declare templates and named things; state roots hold what exists. A holder body carries `Values`, and may carry `Institution`, `Entity`, `Modifier`, `Emissions`, `Hooks`, `Destroyed_when` and the reserved fields of §14.

### Instances carry their declarations in full

A value in state position repeats `Kind`, `Type`, `Value`, `Bounds`, permissions and description alongside its `calculated_value`, rather than referring to a catalog entry.

This is deliberate and it is not free. It costs the document size and repetition, and it is what buys two things: an instance may legitimately diverge from the template it started from, and the AI reads a declaration wherever it reads a figure instead of resolving a reference into a catalog elsewhere. §1 states the consequence — sameness across instances is a convention maintained by an empty `revisable_by`, not a structural guarantee.

### AI text is not in the document

An actor's plan (§12.3) and inbox (§12.6) persist alongside a save, never inside the world document. Nothing in the rules reads them, so they are not world state — and keeping them out makes §12.2's privacy boundary structural rather than something a renderer has to enforce every time.

---

## 18. What remains open

Three, and none of them block implementation.

**Adjudication volume is uncapped** (§11.3), and hooks can now reach it (§12.4). The AI cost the engine does not control. Deliberately unsolved: every mitigation §11.3 lists changes how the mechanic feels, so measure a real scenario before choosing one.

**Sphere of interest has no source** (§12.6). Forced wakes reference it and nothing establishes it.

**Contract compliance has no record** (§11.4). Reputation is meant to derive from it and nothing accumulates it.

Everything else previously listed as open is now decided: holder-valued expressions are unnecessary because ownership is a permitted write; capture and destruction no longer share a phase; division, modulo and truncation are defined; `avg` on the empty set returns 0 and is documented rather than flagged; movement remainder is a bounds decision; the emission `target_value` check stays a runtime log because it cannot be anything else.
