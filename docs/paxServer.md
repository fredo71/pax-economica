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
reads it, asks for map.js  ────────►  sends map.js   (Leaflet comes from a CDN)
map.js asks for the shapes  ───────►  sends provinces.geojson
     and for the game document  ───►  sends europe.json
Leaflet draws each province as an SVG <path>,
filled with its owner's Colour
```

In milestone 1 the server only hands out files, and the page reads the whole game document.

**Three documents, eventually:**

| Document | Lives | Changes | Holds |
|---|---|---|---|
| map (`provinces.geojson`) | sent to the page once | never during a game | shapes and ids only |
| game document (`europe.json`) | server | every tick | the whole state, in exemple/exemple.json's format |
| view (not built yet) | built by the server from the game document | each time the engine stops | only what the page shows, already evaluated |

A province's shape and id are fixed. Everything else about it (owner, name, values) lives in the game document and can change.

**Later, the server decides:**
- the page sends an action as JSON, e.g. "eng takes fr_75"
- the server runs it through the engine, which accepts or rejects it
- the server sends the page a new view: facts, plus each nation's colour as data
- the page decides how facts look, and never keeps its own copy of the game state, because the document is the state (CLAUDE.md, Determinism and State)

Sending the whole game document is a first step only. It stops working once the document holds things a player shouldn't see (anything sent can be read with F12), or once the page would need to understand the engine's format. At that point the view replaces it.

---

## Files

| File | Job | State |
|---|---|---|
| `Program.cs` | the server: hands out everything in `wwwroot/`, and `/` gives `index.html`. Registers `.geojson`, which it would otherwise refuse with a 404 | done |
| `wwwroot/index.html` | the page: loads Leaflet, holds the map `<div>` | done |
| `Scripts/main.ts` | entry point: downloads both files, builds the game, draws it. Any failure shows as red text on the page and nothing is drawn | done |
| `Scripts/game.ts` | the game as the page sees it (`Game`, `Province`, `Nation`, all readonly: built once, then only read). `buildGame` checks both files and links them; any problem stops the page with one message listing them all. It checks only what the page uses: value types and formula references are the C# engine's job. `serializeProvince` turns references back into ids | done |
| `Scripts/map.ts` | draws every province coloured by its owner (wiping the previous drawing first); a click prints the province as raw text | done |
| `Scripts/page.ts` | helpers for `index.html` itself, shared by the other modules (`findElement`) | done |
| `wwwroot/*.js` | compiled from `Scripts/`, loaded by the browser as modules. Never edit by hand; not committed | generated |
| `wwwroot/provinces.geojson` | the province shapes, each with only an `id` (`fr_75`). For now: 385 European provinces merged from Natural Earth admin-1 regions, one province per line, sorted by id. Made by the scripts in `tools/map/`, which are local only (ignored by git) | test data |
| `wwwroot/europe.json` | the game document. For now only `Actor` (55 modern nations, each with a `Name` and a `Colour`) and `Provinces` (`Name`, `Neighbors`, `owner`). Generated once by `tools/map/makeScenario.js`, edited by hand from then on | test data |
| `tsconfig.json` | TypeScript settings, shared by the build and the editor | done |
| `package.json` | TypeScript and Leaflet's type definitions, from npm | done |
| `.vscode/tasks.json` (repo root) | compiles TypeScript on every save | done |

---

## Choices

| Choice | Picked | Why | Not picked |
|---|---|---|---|
| Map library | Leaflet | free, small, widely known. Draws shapes as SVG, with pan, zoom, click and touch built in. Works without a street map underneath, and supports made-up maps too (`CRS.Simple`) | MapLibre GL (labels need a font server), D3 (you build pan and zoom yourself), Phaser/PixiJS (no map features), Blazor map components (paid) |
| Page language | TypeScript | mistakes in the page code fail the build, instead of failing silently in the browser. Compiles to the JavaScript Leaflet expects; clean split from the C# | plain JavaScript (no checks), Blazor (the map would still need JavaScript, plus glue code between the two) |
| Map data | Natural Earth admin-1 regions (1:10m), Europe only, merged to about Poland's average province size (19,500 km²) | public domain. Modern regions stand in for provinces until period provinces are drawn by hand. Raw admin-1 is very uneven (Slovenia 193 regions, Germany 16), so a script merged each region under 65% of the target into a neighbour of the same country, same statistical region preferred. A province wrapped entirely by another of the same country joins it. Provinces already larger (Russian oblasts, Bavaria) stay as they are: splitting needs finer data. Outlines simplified with mapshaper to 0.4 MB, shared borders kept aligned. `id` is the ISO 3166-2 code of the largest merged region, lowercase with an underscore (`fr_75`), because a hyphen could read as minus inside a formula. Crimea is grouped with Ukraine, following its ISO code | NUTS 2 (sized by population not area, EU only, licence conditions); historical-basemaps (past borders, but GPL-3.0) |
| Shapes vs state | two files, joined by province `id` | shapes never change, are large, and the engine never reads them. Putting them in the game document would bloat every save, tick and AI call. A nation's shape is the provinces it owns, so borders move and new nations appear without touching a coordinate. The document will name its map file | shapes inside the game document (the AI would have to draw coordinates, and would do it badly); shapes hard-coded in the page |
| What the page receives | the whole game document, for now | simplest way to prove document → page → colours. The server only hands out the file | the view (comes later, see How It Fits Together); the server sending HTML panels (breaks "the page decides how things look") |
| Nation colours | a `Colour` on each nation, in the game document | a nation's colour is part of its identity, like in Paradox games, so it's data. Generated so bordering nations never look alike | colours picked by the page |
| Hosting (planned) | Azure App Service, free tier | built for .NET, no Docker needed | Render (sleeps when idle), GitHub Pages (no server) |

---

## Steps

1. **(done)** the server hands out `wwwroot/index.html`
2. **(done)** Leaflet map drawing the country shapes from `provinces.geojson`
3. **(done)** each province coloured by its owner, read from `europe.json`
4. online on Azure, and the link is shared

After milestone 1:

5. clicking a province shows a panel: sections of rows (label, value, hover hint, breakdown of where the value comes from), drawn by one generic renderer. First from a hand-written panel file, later from `GET /provinces/{id}/panel`
6. the server loads `europe.json` at startup, refuses to start if its province ids don't match the map, and serves the view instead of the raw document
7. clicks become actions (`POST /actions`), and the server decides
8. the engine goes behind the server (docs/engineSpec.md)
9. the server pushes the new view to every open page (SignalR) each time the engine stops

---

## Running It

First time only: run `npm install` in `PaxServer/`. It downloads TypeScript and Leaflet's type definitions.

From `PaxServer/`, run `dotnet watch`. It opens the page at `http://localhost:5056`.

TypeScript is compiled two ways, both reading the same `tsconfig.json`:
- **while editing:** VS Code starts the "TypeScript on save" task when the folder opens (allow automatic tasks the first time). Each save rewrites `wwwroot/map.js`, and `dotnet watch` refreshes the browser. `dotnet watch` alone never recompiles `.ts` files, which is why the task exists
- **on build and publish:** the `Microsoft.TypeScript.MSBuild` package compiles and type-checks. A type error fails the build, so broken TypeScript can't be deployed

Versions: the build package is 7.0.1 and npm's TypeScript is 7.0.2, because npm has no 7.0.1.

- the `dotnet new web` template doesn't create `wwwroot/`. It was made by hand
- `dotnet watch` doesn't pick up changes to the setup in `Program.cs`, and sometimes misses new files. **Ctrl+R** in its terminal restarts it
- if the page looks stale, **Ctrl+F5** in the browser

---

## Keeping This Current

When a step lands, update the Files and Steps tables. Write decisions down after they're made, not before.
