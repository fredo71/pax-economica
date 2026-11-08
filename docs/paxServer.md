# PaxServer

The web page for Pax Economica: a map that anyone with the link can open. This is where the project moves from documents to running code.

docs/architecture.md planned PaxServer as the engine's web host. It starts smaller, as just the map page, and grows into that role once the engine exists.

---

## Why This Exists

By 2026-09-23 the C# project had about 2,700 lines of docs and rules (CLAUDE.md plus docs/) and no code. The build order in docs/architecture.md has nine stages, and the AI (the part worth showing) only arrives at stage 7. Meanwhile the older Python engine (the `engine/` folder next to this repo, about 1,650 lines) actually ran.

So the approach changes:
- **Build something visible first, then grow it.**
- **Docs follow code.** Write down what exists and what was decided, not guesses about code nobody has written yet.
- **Small steps.** Run the page after each one.

### Which docs still apply

| Doc | Status |
|---|---|
| CLAUDE.md | applies: naming, comments and structure rules for all code, and how the page keeps its state |
| docs/engineSpec.md | applies: what the game means. Needed once the engine arrives |
| exemple/exemple.json | applies: the worked example document |
| docs/paxServer.md (this file) | the guide for PaxServer |
| docs/architecture.md, codeStructure.md, engineArchitecture.md, developmentProcess.md, testing.md | on hold. They describe an engine that isn't built yet. Don't extend them; revisit once engine code exists |

---

## Goal: Milestone 1

A web page anyone with the link can open, showing a map. Each province is an SVG shape, coloured by the nation that owns it in the game document `europe.json`. No engine, no AI.

**Done when:**
- the link opens on a phone and on someone else's laptop
- you can drag and zoom, and changing an owner in `europe.json` changes the province's colour

---

## How It Fits Together

C# runs on the server. JavaScript runs in the browser. Browsers only run JavaScript, and the map libraries are JavaScript, so the page is written in TypeScript (JavaScript with types) and compiled to JavaScript. Not Blazor.

```
browser                               server (PaxServer, C#)
───────                               ──────────────────────
opens the link  ───────────────────►  sends index.html
reads it, runs main.js  ───────────►  sends main.js and the modules it imports
                                      (Leaflet and Zod come from CDNs)
main.js asks for the map file  ────►  sends provinces.geojson
     and for the game state  ──────►  GET /api/game sends the game state
checks both, joins them by province id,
Leaflet draws each province as an SVG <path>, filled with its owner's colour
Next turn button  ─────────────────►  POST /api/game runs a tick
then downloads and draws everything again
```

The server loads `europe.json` at startup into its game state, keeps it in memory, and runs a tick on `POST /api/game`. `GET /api/game` sends that game state as it is.

**The split, decided:** the server knows only the game state, which includes each province's id. The page knows the game state *and* the outlines, and turns the two into what it draws. The server never shapes data for the page.

### Vocabulary

| Word | Means | In code |
|---|---|---|
| **map file** | `provinces.geojson`: every province's outline. Fixed for a whole game | `mapFileUrl`, `mapFileJson` |
| **province outline** | one entry of the map file: an id and a polygon. Only the drawing uses it | `ProvinceOutline`, `outlines` |
| **game document** | `europe.json`: the starting state of a game, formulas included. Loaded once, at startup | `GameStateBuilder` |
| **game state** | the game document loaded into memory and ticked from there. The server sends it to the page as it is | `GameState` (C#); `GameState`, `gameStateSchema`, `gameStateUrl` (page) |
| **path** | where a value sits, as a formula writes it: `provinces.ad_06.institution_economy_province.gdp`, `world.technology.tech` | `Value.Path`, `GameState.FindValue` |
| **game** | the game state joined with the outlines: everything the page draws and clicks | `Game` |
| **province** | one province inside the game: outline plus state | `Province` |

Addresses end in `Url` (where to download), raw downloads end in `Json` (checked by nobody yet), and checked data has the plain name.

**The three files:**

| File | Lives | Changes | Holds |
|---|---|---|---|
| map file (`provinces.geojson`) | sent to the page once | never during a game | province outlines: ids and polygons only |
| game document (`europe.json`) | server, read once at startup | never: edited by hand between runs | the starting state (format below) |
| game state | server memory, sent by `GET /api/game` | every tick | the game document's shape, with each value's `calculated_value` brought up to date. The page joins it with the outlines by province id |

A province's outline and id are fixed. Everything else about it (owner, name, values) lives in the game state and can change.

### The game document's format

```
Turn                    0
Institution             the institution declarations (read by nothing yet)
Actor.<tag>             Name, Colour, Institution
Provinces.<id>          Name, Neighbors, owner (an actor tag), Modifier, Institution
World                   Institution
Institution.<name>      DisplayName, Values
Values.<name>           DisplayName, Type, Formula, calculated_value, Unit, Description, Modifiable_by / Writable_by
```

- **`Formula`** is evaluated every tick, plain numbers included (`"0.5"`). A write will replace this text, not `calculated_value` (see Choices).
- **`calculated_value`** is the figure the last tick produced.
- **`DisplayName`** and **`Unit`** are for the page (`"GDP"`, `" M$"`).
- **Read but dropped on load:** `Kind` (left over, no longer used), the top-level `Institution` block, `Neighbors`, `Modifier`, `Entity`, `Modifiable_by` and `Writable_by`. A loaded game state doesn't keep them, so they're gone after the first tick.

### Checking what arrives

Types disappear when TypeScript compiles, so nothing checks downloaded JSON unless the page does. `Scripts/FrontEnd/validator.ts` checks both downloads before anything is drawn, in two stages:

1. **Each piece on its own, with Zod schemas.** The map file must be a list of `Polygon` or `MultiPolygon` features, each with an id. The game state must be in the game document's shape (dictionaries keyed by id and name, `Actor`, `calculated_value`), with non-empty names and ids, colours the browser can draw, and a whole-number `turn`. If either file fails, checking stops here, since later checks would only add noise.
2. **References across pieces, one function each.** Every outline has a province and every province an outline; no outline id repeats; province owners are real actors. Names inside the game state can't repeat, since they are JSON keys.

Every problem is collected, then thrown once. The page shows them all in red and draws nothing.

Not checked on purpose: game logic (is this figure plausible, can this army be there). That is the engine's job, and a second copy in TypeScript would drift from it.

**Later, the server decides:**
- the page sends an action as JSON, e.g. "eng takes fr_75"
- the server runs it through the engine, which accepts or rejects it
- the server sends the page the new game state
- the page decides how facts look, and never changes the game state itself: it only shows the last one the server sent, because the server's document is the state

Sending the whole game state has a known cost: anything sent can be read with F12, formulas included. Once the game state holds something a player mustn't see, the server will have to leave it out.

---

## Files

| File | Job | State |
|---|---|---|
| `Program.cs` | the server: creates the one `GameManager` (loading the game at startup), hands out everything in `wwwroot/`, `/` gives `index.html`, and adds the API. Registers `.geojson`, which it would otherwise refuse with a 404 | done |
| `Scripts/BackEnd/api.cs` | `GET /api/game` sends the game state; `POST /api/game` runs one tick | done |
| `Scripts/BackEnd/GameManager.cs` | holds one game's state. `RunTick` takes a lock, so two ticks of the same game never run at once (one would be lost); other games and reads are never blocked | done |
| `Scripts/BackEnd/GameStateBuilder.cs` | reads `europe.json` at startup, and refuses to start if a province has no outline in the map file or an outline has no province. It only reads the outlines' ids | done |
| `Scripts/BackEnd/GameState.cs` | the game state: `GameState`, `Actor`, `Province`, `World`, `Institution`, `Value`, in the game document's shape. Each constructor checks its own fields. The game state gives every value its path (`AssignPaths`) and finds a value by path (`FindValue`: each class handles its own step and hands the rest down; `null` when a step is missing). `Copy()` is a full copy through JSON | done |
| `Scripts/BackEnd/GameStateChecks.cs` | the rules fields must obey (actor tags, colours, finite figures) and `Require`, which refuses a broken one | done |
| `Scripts/BackEnd/RunGame.cs` | `RunTick`: copies the state, recalculates every value from the *previous* state (so the order never matters), then advances the turn | done |
| `Scripts/BackEnd/FormulaReader.cs` | `Evaluate` reads a formula left to right and calculates as it goes (see Choices): numbers, `+ - * /`, brackets, unary minus, `prev.base`, sibling names and full paths. A problem is printed where it happens (path, formula, position, reason) and the value becomes 0. Division by zero and huge figures follow §2's saturation rule | done |
| `wwwroot/index.html` | the page skeleton: loads Leaflet and the stylesheets, holds the map, the Next turn button, the side panel (hidden until a province is selected) with its `<template>`s, and the text boxes. Its import map tells the browser where `"zod"` is | done |
| `wwwroot/styles/` | one stylesheet per feature: `page.css` (whole page, text boxes), `map.css` (map, outlines, and the container that keeps Leaflet's layers underneath), `panel.css` (the side panel) | done |
| `Scripts/FrontEnd/main.ts` | entry point: downloads the two files, builds the game from them (`buildGame`), draws the map (`drawGame`) and hands the game to both panels (`showGame`). The Next turn button runs a tick, then does all of that again. Any failure shows as red text on the page and nothing is drawn | done |
| `Scripts/FrontEnd/gameApi.ts` | the page's calls to the server: `fetchGameState` (`GET /api/game`) and `runTick` (`POST /api/game`). What comes back is checked by `validateFiles`, not here | done |
| `Scripts/FrontEnd/validator.ts` | the game state's and the map file's schemas, and `validateFiles`, which runs every check (see Checking what arrives) and returns `{ outlines, gameState }` | done |
| `Scripts/FrontEnd/showProvince.ts` | the side panel: province name, owner (name and colour swatch), then one collapsible block per institution with one row per value (name, figure, description if it has one). Hidden when nothing is selected (a sea click). Keeps its own state (the game, the selected province's id, and which institutions are open, by name) and changes it only through `showGame`, `selectProvince` and `setInstitutionOpen`, each redrawing the panel. So the selection and the open blocks survive a new turn, and a block stays open across provinces | done |
| `Scripts/FrontEnd/game.ts` | the game as the page sees it (`Game`, `Province`, `Nation`, all readonly: built once, then only read). `buildGame` takes the two downloaded files as one `GameFiles` object, checks them with `validateFiles`, then joins outlines and game state by province id; the check already confirmed every reference resolves, so the join itself cannot fail. It rebuilds everything on every call, keeping nothing from a previous game. `Institution` and `Value` are re-exported from `validator.ts`, where the game state schema defines them | done |
| `Scripts/FrontEnd/map.ts` | `drawGame(game)`, its only export, throws away any previous map and draws a new one with every province coloured by its owner (a redraw resets zoom and position). Both click handlers call `onSelect`, which passes the clicked province's id, or `null` for the sea, to `selectProvince` on both panels. The map keeps no selection itself, since it doesn't show one | done |
| `Scripts/FrontEnd/debugPanel.ts` | prints the selected province as raw text, and empties on a sea click. Keeps its own copy of the game and the selected id, through its own `showGame` and `selectProvince`. Only switched on when the page runs on localhost (both actions check it); the code still reaches production, switched off | done |
| `Scripts/FrontEnd/page.ts` | helpers for `index.html` itself, shared by the other modules (`findElement`) | done |
| `wwwroot/*.js` | compiled from `Scripts/FrontEnd/`, loaded by the browser as modules. Never edit by hand; not committed | generated |
| `wwwroot/provinces.geojson` | the map file: province outlines, each with only an `id` (`fr_75`). For now: 385 European provinces merged from Natural Earth admin-1 regions, one province per line, sorted by id. Made by the scripts in `tools/map/`, which are local only (ignored by git) | test data |
| `wwwroot/europe.json` | the game document (format above): 55 modern nations (`Actor`), 385 provinces each with the economy institution (`gdp`, `growth`), and `World` (`technology.tech`, which `gdp`'s formula reads). The institution and `World` were copied from exemple.json, but the format has since moved away from it: `Formula` instead of `Value`, `owner` as a plain tag, plus `Turn`, `DisplayName` and `Unit`. `gdp` is made up from each province's area. Generated once by `tools/map/makeScenario.js`, edited by hand from then on. Being in `wwwroot/`, it can also be downloaded as a raw file | test data |
| `tsconfig.json` | TypeScript settings, shared by the build and the editor | done |
| `package.json` | TypeScript, Leaflet's and GeoJSON's type definitions, and Zod, from npm | done |
| `.vscode/tasks.json` (repo root) | compiles TypeScript on every save | done |

---

## Choices

| Choice | Picked | Why | Not picked |
|---|---|---|---|
| Map library | Leaflet | free, small, widely known. Draws shapes as SVG, with pan, zoom, click and touch built in. Works without a street map underneath, and supports made-up maps too (`CRS.Simple`) | MapLibre GL (labels need a font server), D3 (you build pan and zoom yourself), Phaser/PixiJS (no map features), Blazor map components (paid) |
| Page language | TypeScript | mistakes in the page code fail the build, instead of failing silently in the browser. Compiles to the JavaScript Leaflet expects; clean split from the C# | plain JavaScript (no checks), Blazor (the map would still need JavaScript, plus glue code between the two) |
| Map data | Natural Earth admin-1 regions (1:10m), Europe only, merged to about Poland's average province size (19,500 km²) | public domain. Modern regions stand in for provinces until period provinces are drawn by hand. Raw admin-1 is very uneven (Slovenia 193 regions, Germany 16), so a script merged each region under 65% of the target into a neighbour of the same country, same statistical region preferred. A province wrapped entirely by another of the same country joins it. Provinces already larger (Russian oblasts, Bavaria) stay as they are: splitting needs finer data. Outlines simplified with mapshaper to 0.4 MB, shared borders kept aligned. `id` is the ISO 3166-2 code of the largest merged region, lowercase with an underscore (`fr_75`), because a hyphen could read as minus inside a formula. Crimea is grouped with Ukraine, following its ISO code | NUTS 2 (sized by population not area, EU only, licence conditions); historical-basemaps (past borders, but GPL-3.0) |
| Outlines vs state | two files, joined by province `id` | outlines never change, are large, and the engine never reads them. Putting them in the game document would bloat every save, tick and AI call. A nation's shape is the provinces it owns, so borders move and new nations appear without touching a coordinate. The document will name its map file | shapes inside the game document (the AI would have to draw coordinates, and would do it badly); shapes hard-coded in the page |
| What the page receives | the game state as the server holds it, in the game document's shape | the server knows only the game state and province ids; the page knows the outlines too, and does all shaping for display. One format, no conversion code on the server to keep in step with the page | a separate page-only shape built by the server (the earlier plan: hides formulas from F12, but every new field must be added in two formats); the server sending HTML panels (breaks "the page decides how things look") |
| Evaluating formulas | read left to right with one function per precedence level (sum, product, single piece), calculating as it goes. No syntax tree is stored | about 150 lines, precedence and brackets fall out of which function calls which. A tree pays off once formulas must be checked at load time (§3 wants a bad formula to be a load error) or inspected without running; the tree version has the same three functions, returning nodes instead of numbers | splitting the text on operators (precedence, left-to-right order, brackets and unary minus each need a special case); a tree now |
| What a formula reads | only the previous tick's state | order within a tick can't change the result (§1), so values are filled in any order | reading the state being written (the result would depend on the order) |
| A problem in a formula | printed where it happens, then the value becomes 0 | the failing step is the only one that knows why (unknown name, missing `)`, …). Stopping at the first problem reports it once | returning `null` and reporting at the end (the reason is lost); throwing (a bad formula is bad input, not an engine bug) |
| Where a write lands | it replaces the value's `Formula` text | every value is then just a formula evaluated each tick, with one rule for all. A written figure must be turned into text with `"R"` and InvariantCulture so it reads back exactly. Differs from docs/engineSpec.md line 350, where writes land in `calculated_value` and `Formula` keeps the original | the spec's version (needs a `value`/`formula` kind, and plain values must never be recalculated, or each write is undone the next tick) |
| Two ticks at once | a lock in each `GameManager` | the same game ticked twice at once would lose one tick. The lock lives on the manager, not the game state, because each tick replaces the state object. One lock per game, so other games and reads are never blocked. A second tick waits its turn | a "taken" flag (checking and taking would race, and a crash would leave it taken); locking the game state object (the second tick would lock the old state); refusing the second tick with a 409 (possible later with `Monitor.TryEnter`, if a button gets spammed) |
| Checking downloads | Zod schemas, then hand-written reference checks | one description gives both the check and the TypeScript type, and reports every problem with its path. A schema only sees one piece at a time, so references between pieces stay hand-written, one function each | hand-written checks for everything (one more `isRecord` level per nesting); trusting the data |
| Loading Zod | an import map in `index.html`, pointing at the CDN | no bundler needed, same as Leaflet. The version (4.6.5) must match `package.json` | a bundler such as Vite (worth it once a UI framework arrives) |
| Debug output | the raw-text box, switched on only on localhost | helps build the panel without showing players raw data | a `?debug` switch in the address; the server leaving it out in production (worth it once it shows anything secret) |
| What a click changes | one `onSelect` function in `map.ts`, calling the panels directly | the code reads as a tree from `main.ts` down, with nothing passed through. The cost: `map.ts` imports the panels, and every new click effect lands there | `main.ts` passing `onSelect`, or a list of listeners, into `drawGame` (keeps the map unaware of the panels, but the calls are hidden behind a parameter); a global `onProvinceClick(listener)` registration in `map.ts` |
| Where the selection lives | in each panel: `showProvince.ts` and `debugPanel.ts` each keep the game and the selected id, and `map.ts` passes clicks on | a file keeps the state its own view needs (CLAUDE.md, State in the page), and the map doesn't show the selection. An id, not a `Province`, because each turn brings a new game with new `Province` objects | `map.ts` keeping the selection and handing each panel the `Province` to show (the panels then can't redraw on their own, e.g. when a block is opened) |
| Telling a sea click from a province click | the map's click handler ignores clicks whose element has the `province` class | the map hears every click, province clicks included. The class check only reads the click, so neither handler depends on the other or on which runs first | `bubblingMouseEvents: false` or `stopPropagation` on the provinces (switches off Leaflet behaviour, invisible where the map handler is written); a flag set by the province handler and read by the map's (depends on order, and must be reset) |
| Nation colours | a `Colour` on each nation, in the game document | a nation's colour is part of its identity, like in Paradox games, so it's data. Generated so bordering nations never look alike | colours picked by the page |
| Hosting (planned) | Azure App Service, free tier | built for .NET, no Docker needed | Render (sleeps when idle), GitHub Pages (no server) |

---

## Planned: references in formulas

Decided, not built yet. Formulas are evaluated first with plain names and full paths; this comes after.

**The problem.** docs/engineSpec.md defines `self` three different ways: "the holder the expression belongs to" (§14), the actor or province carrying the institution (line 845), and "only ever the actor" (line 1148). Values can sit on any holder (actor, province, world, institution, entity, modifier, contract), so "what is `self`?" has no single answer.

**The decision.** A formula moves through the tree with named steps instead:

| written | means |
|---|---|
| `@Province` | go up to the nearest containing node of that kind. Works for any kind: `@Institution`, `@Actor`, `@Entity`… |
| `.name` | go down to the child with that name |
| bare `growth` | a sibling: same holder, same values |
| `world.…`, `provinces.…`, `actors.…` | start from the root |
| `prev.base` | this value's own last figure |

Steps chain, so a formula can go up, down, and up again: `@Province.institution_military.manpower`. If a step finds nothing, the result is null; the null carries through the formula and becomes the type's default (0) at the end, and is logged once so a typo does not silently read 0 forever.

**How it will be built.** Every node (game state, actor, province, world, institution, value) implements one interface: `Parent` (the node that contains it, null at the top), `Kind` (what `@` checks) and `FindChild(name)` (one step down). The walk lives in one place, using only those three. `Parent` is `[JsonIgnore]` (it would loop forever when serialised) and is wired by the game state after every load and `Copy()`, replacing `AssignPaths`; a value's path can then be computed from its parents instead of stored.

**Rejected.**
- `self`: undefined, as above.
- `../` (count levels up): reaches everything `@` does, but `../../x` means whatever happens to be two levels up today, and silently changes meaning when the tree changes shape.
- `/Province` as the symbol: `/` is already division.

**Still to do in the spec:** §2 ("every reference is `self.<field>` or a bound name"), §14's `self` entry, and lines 845 and 1148 must change to match.

---

## Steps

1. **(done)** the server hands out `wwwroot/index.html`
2. **(done)** Leaflet map drawing the country shapes from `provinces.geojson`
3. **(done)** each province coloured by its owner, read from `europe.json`
4. online on Azure, and the link is shared

After milestone 1:

5. **(done)** the page reads the game state instead of the game document: `sampleGameState.json`, the validator, and the join into `Game`. The page no longer reads `europe.json`
6. **(done)** clicking a province shows a side panel, and clicking the sea hides it (it starts hidden): its name, owner (with a colour swatch), and one collapsible block per institution with one row per value (name, figure, and description when it has one). Built by cloning `<template>`s; a generic renderer, so a new institution needs no page code
7. **(done)** the server loads `europe.json` at startup, refuses to start if its province ids don't match the map, serves the game state at `GET /api/game`, and runs a tick on `POST /api/game`: every value's formula is recalculated from the previous state, and the turn goes up by one
8. **(done)** the page reads `GET /api/game` instead of `sampleGameState.json`: its schema and join follow the game document's shape, and a Next turn button runs a tick and redraws, keeping the selected province and its open blocks
9. clicks become actions (`POST /actions`), and the server decides
10. the engine goes behind the server (docs/engineSpec.md)
11. the server pushes the new game state to every open page (SignalR) each time the engine stops

---

## Running It

First time only: run `npm install` in `PaxServer/`. It downloads TypeScript, the type definitions and Zod.

From `PaxServer/`, run `dotnet watch`. It opens the page at `http://localhost:5056`.

TypeScript is compiled two ways, both reading the same `tsconfig.json`:
- **while editing:** VS Code starts the "TypeScript on save" task when the folder opens (allow automatic tasks the first time). Each save rewrites the matching `.js` file in `wwwroot/`, and `dotnet watch` refreshes the browser. `dotnet watch` alone never recompiles `.ts` files, which is why the task exists
- **on build and publish:** the `Microsoft.TypeScript.MSBuild` package compiles and type-checks. A type error fails the build, so broken TypeScript can't be deployed

Versions: the build package is 7.0.1 and npm's TypeScript is 7.0.2, because npm has no 7.0.1.

- the `dotnet new web` template doesn't create `wwwroot/`. It was made by hand
- `dotnet watch` doesn't pick up changes to the setup in `Program.cs`, and sometimes misses new files. **Ctrl+R** in its terminal restarts it
- if the page looks stale, **Ctrl+F5** in the browser
- if a code change seems to do nothing, open the matching `.js` in `wwwroot/`: if your change isn't there, the "TypeScript on save" task isn't running (Terminal → Run Task…). The browser only ever runs the `.js`
- errors inside a click handler don't reach the red box; they only show in the browser console (F12)
- adding a library: `npm install` it for the compiler, and add it to the import map in `index.html` for the browser, with the same version
- trying the API without the page: `curl http://localhost:5056/api/game` shows the game state, `curl -X POST http://localhost:5056/api/game` runs a tick. A formula that can't be read is printed in the `dotnet watch` terminal
- restarting the server starts the game over from `europe.json`: nothing is saved yet

---

## Deploying

`.github/workflows/deploy.yml` builds the site on GitHub and sends it to Azure App Service.

- **every push and pull request:** `npm ci`, then `dotnet publish`. This compiles the TypeScript, so a type error turns the run red
- **push to `main` only:** the published folder is then deployed to Azure
- **why GitHub builds it:** `wwwroot/*.js` is in `.gitignore`, so the repo alone holds no JavaScript. A deploy that doesn't compile first serves a page without code
- **setup:** the app name is `AZURE_WEBAPP_NAME` in the workflow, and the secret `AZURE_WEBAPP_PUBLISH_PROFILE` (the App Service's downloaded publish profile) is in the repo's Actions secrets
- **one deployer only:** if Deployment Center in the Azure portal also deploys from the repo, disable it
- the App Service must run .NET 10

---

## Keeping This Current

When a step lands, update the Files and Steps tables. Write decisions down after they're made, not before.
