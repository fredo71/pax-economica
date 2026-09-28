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
| CLAUDE.md | applies: naming, comments and structure rules for all code |
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
     and for the game state  ──────►  sends sampleGameState.json (later: built from the engine)
checks both, joins them by province id,
Leaflet draws each province as an SVG <path>, filled with its owner's colour
```

For now the server only hands out files. The page downloads and checks the game state, joins it to the outlines by province id, and draws from that — it no longer reads the game document at all.

### Vocabulary

| Word | Means | In code |
|---|---|---|
| **map file** | `provinces.geojson`: every province's outline. Fixed for a whole game | `mapFileUrl`, `mapFileJson` |
| **province outline** | one entry of the map file: an id and a polygon. Only the drawing uses it | `ProvinceOutline`, `outlines` |
| **game document** | `europe.json`: the engine's whole state, formulas and rules included, in exemple/exemple.json's format. Only C# should read it | `gameDocumentUrl` (on its way out of the page) |
| **game state** | what the server sends the page: only what the player sees, already evaluated. Turn, nations, provinces' owners and institutions, entities | `GameState`, `gameStateSchema`, `gameStateUrl` |
| **game** | the game state joined with the outlines: everything the page draws and clicks | `Game` (the new one arrives with the join) |
| **province** | one province inside the game: outline plus state | `Province` |

Addresses end in `Url` (where to download), raw downloads end in `Json` (checked by nobody yet), and checked data has the plain name.

**The three files:**

| File | Lives | Changes | Holds |
|---|---|---|---|
| map file (`provinces.geojson`) | sent to the page once | never during a game | province outlines: ids and polygons only |
| game document (`europe.json`) | server | every tick | the whole state, in exemple/exemple.json's format |
| game state (`sampleGameState.json` for now) | built by the server from the game document | each time the engine stops | only what the player sees, already evaluated. The page joins it with the outlines by province id |

A province's outline and id are fixed. Everything else about it (owner, name, values) lives in the game document and can change.

### Checking what arrives

Types disappear when TypeScript compiles, so nothing checks downloaded JSON unless the page does. `Scripts/validator.ts` checks both downloads before anything is drawn, in two stages:

1. **Each piece on its own, with Zod schemas.** The map file must be a list of `Polygon` or `MultiPolygon` features, each with an id. The game state must have the right fields, non-empty names and ids, colours the browser can draw, and a whole-number `turn`. If either file fails, checking stops here, since later checks would only add noise.
2. **References across pieces, one function each.** Every outline has a province and every province an outline; no outline id repeats; province and entity owners are real nations; entity locations are real provinces; no institution or value name repeats in one list.

Every problem is collected, then thrown once. The page shows them all in red and draws nothing.

Not checked on purpose: game logic (is this figure plausible, can this army be there). That is the engine's job, and a second copy in TypeScript would drift from it.

**Later, the server decides:**
- the page sends an action as JSON, e.g. "eng takes fr_75"
- the server runs it through the engine, which accepts or rejects it
- the server sends the page a new game state: facts, plus each nation's colour as data
- the page decides how facts look, and never keeps its own copy of the game state, because the document is the state (CLAUDE.md, Determinism and State)

Sending the whole game document is a first step only. It stops working once the document holds things a player shouldn't see (anything sent can be read with F12), or once the page would need to understand the engine's format. At that point the game state replaces it.

---

## Files

| File | Job | State |
|---|---|---|
| `Program.cs` | the server: hands out everything in `wwwroot/`, and `/` gives `index.html`. Registers `.geojson`, which it would otherwise refuse with a 404 | done |
| `wwwroot/index.html` | the page skeleton: loads Leaflet and the stylesheets, holds the map, the side panel with its `<template>`s, and the text boxes. Its import map tells the browser where `"zod"` is | done |
| `wwwroot/styles/` | one stylesheet per feature: `page.css` (whole page, text boxes), `map.css` (map, outlines, and the container that keeps Leaflet's layers underneath), `panel.css` (the side panel) | done |
| `Scripts/main.ts` | entry point: downloads the files, checks them with `validateFiles`, builds the game, and draws it with the list of click listeners (the side panel always, the raw-text debug panel on localhost). Any failure shows as red text on the page and nothing is drawn | done |
| `Scripts/validator.ts` | the game state's and the map file's schemas, and `validateFiles`, which runs every check (see Checking what arrives) and returns `{ outlines, gameState }` | done |
| `Scripts/showProvince.ts` | fills the side panel on a click: province name, owner (name and colour swatch), then one collapsible block per institution with one row per value (name, figure, description if it has one) | done |
| `Scripts/game.ts` | the game as the page sees it (`Game`, `Province`, `Nation`, all readonly: built once, then only read). `buildGame` joins the validated outlines and game state by province id; `validateFiles` already confirmed every reference resolves, so the join itself cannot fail. `Institution` and `Value` are re-exported from `validator.ts`, where the game state schema defines them | done |
| `Scripts/map.ts` | draws every province coloured by its owner (wiping the previous drawing first); `drawGame` takes the list of click listeners to announce a click to, without the map knowing what they do | done |
| `Scripts/debugPanel.ts` | prints the clicked province as raw text. Only switched on when the page runs on localhost; the code still reaches production, switched off | done |
| `Scripts/page.ts` | helpers for `index.html` itself, shared by the other modules (`findElement`) | done |
| `wwwroot/*.js` | compiled from `Scripts/`, loaded by the browser as modules. Never edit by hand; not committed | generated |
| `wwwroot/provinces.geojson` | the map file: province outlines, each with only an `id` (`fr_75`). For now: 385 European provinces merged from Natural Earth admin-1 regions, one province per line, sorted by id. Made by the scripts in `tools/map/`, which are local only (ignored by git) | test data |
| `wwwroot/europe.json` | the game document: `Institution` (the economy declaration), `Actor` (55 modern nations, each with a `Name` and a `Colour`), `Provinces` (`Name`, `Neighbors`, `owner`, and the economy institution with `gdp` and `growth`) and `World` (`technology.tech`, which `gdp`'s formula reads). The institution and `World` are copied from exemple.json; `gdp` is made up from each province's area. Generated once by `tools/map/makeScenario.js`, edited by hand from then on. The page no longer reads it (see Steps); still here until step 7 gives it a server-side reader | test data, unused |
| `wwwroot/sampleGameState.json` | a hand-editable stand-in for what the server will send: 55 nations with name and colour, 385 provinces with name, owner and institutions. Generated once from `europe.json`; the server replaces it at step 7 | test data |
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
| What the page receives | the game state, not the game document | reading the game document would make the page a second loader of the engine's format, drifting from the C# one. The game state is shaped for the page and changes only when the UI needs something new. (The page read `europe.json` directly at first, to see colours quickly) | the whole game document (anything sent is readable with F12, and the page would need to understand formulas); the server sending HTML panels (breaks "the page decides how things look") |
| Checking downloads | Zod schemas, then hand-written reference checks | one description gives both the check and the TypeScript type, and reports every problem with its path. A schema only sees one piece at a time, so references between pieces stay hand-written, one function each | hand-written checks for everything (one more `isRecord` level per nesting); trusting the data |
| Loading Zod | an import map in `index.html`, pointing at the CDN | no bundler needed, same as Leaflet. The version (4.6.5) must match `package.json` | a bundler such as Vite (worth it once a UI framework arrives) |
| Debug output | the raw-text box, switched on only on localhost | helps build the panel without showing players raw data | a `?debug` switch in the address; the server leaving it out in production (worth it once it shows anything secret) |
| Wiring click listeners | `main.ts` builds the list and hands it to `drawGame` | `createMap` runs once but `drawGame` reruns on every redraw, so the list has to be available each time regardless of where it lives | a global `onProvinceClick(listener)` registration in `map.ts` (module state standing in for a value that was only ever set once; made a call order in `main.ts` look load-bearing when it wasn't) |
| Nation colours | a `Colour` on each nation, in the game document | a nation's colour is part of its identity, like in Paradox games, so it's data. Generated so bordering nations never look alike | colours picked by the page |
| Hosting (planned) | Azure App Service, free tier | built for .NET, no Docker needed | Render (sleeps when idle), GitHub Pages (no server) |

---

## Steps

1. **(done)** the server hands out `wwwroot/index.html`
2. **(done)** Leaflet map drawing the country shapes from `provinces.geojson`
3. **(done)** each province coloured by its owner, read from `europe.json`
4. online on Azure, and the link is shared

After milestone 1:

5. **(done)** the page reads the game state instead of the game document: `sampleGameState.json`, the validator, and the join into `Game`. The page no longer reads `europe.json`
6. **(done)** clicking a province shows a side panel: its name, owner (with a colour swatch), and one collapsible block per institution with one row per value (name, figure, and description when it has one). Built by cloning `<template>`s; a generic renderer, so a new institution needs no page code
7. the server loads `europe.json` at startup, refuses to start if its province ids don't match the map, and serves the game state at `GET /state` instead of the sample file
8. clicks become actions (`POST /actions`), and the server decides
9. the engine goes behind the server (docs/engineSpec.md)
10. the server pushes the new game state to every open page (SignalR) each time the engine stops

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

---

## Keeping This Current

When a step lands, update the Files and Steps tables. Write decisions down after they're made, not before.
