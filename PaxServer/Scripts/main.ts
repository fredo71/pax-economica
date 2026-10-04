import { Game, buildGame } from "./game.js";
import { drawGame } from "./map.js";
import { findElement } from "./page.js";

const mapFileUrl = "provinces.geojson";
const gameStateUrl = "sampleGameState.json";   // stands in for the server until it can send the game state itself
const errorTextElementId = "error-text";   // the <pre> in index.html

start();

// any failure, from a missing file to bad data, ends here: nothing is drawn and the page says why
async function start(): Promise<void> {
  try {
    // both files download at the same time
    const [mapFile, gameState] = await Promise.all([fetchJson(mapFileUrl), fetchJson(gameStateUrl)]);
    const game: Game = buildGame({ mapFile, gameState });
    drawGame(game);
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
