import { Game, buildGame } from "./game.js";
import { createMap, drawGame } from "./map.js";
import { findElement } from "./page.js";

const shapesPath = "provinces.geojson";
const gameDocumentPath = "europe.json";
const errorTextElementId = "error-text";   // the <pre> in index.html

start();

// any failure, from a missing file to bad data, ends here: nothing is drawn and the page says why
async function start(): Promise<void> {
  try {
    // both files download at the same time
    const [shapesJson, gameDocumentJson] = await Promise.all([fetchJson(shapesPath), fetchJson(gameDocumentPath)]);
    const game: Game = buildGame(shapesJson, gameDocumentJson);
    const map: L.Map = createMap();
    drawGame(map, game);
  } catch (error) {
    showError(error);
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function showError(error: unknown): void {
  const message: string = error instanceof Error ? error.message : String(error);
  const errorBox: HTMLElement = findElement(errorTextElementId);
  errorBox.textContent = message;
  console.error(error);
}
