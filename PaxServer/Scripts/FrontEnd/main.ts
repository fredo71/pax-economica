import * as debugPanel from "./debugPanel.js";
import { fetchGameState, runTick } from "./gameApi.js";
import { Game, buildGame } from "./game.js";
import { drawGame } from "./map.js";
import { findElement } from "./page.js";
import * as provincePanel from "./showProvince.js";

const mapFileUrl = "provinces.geojson";
const errorTextElementId = "error-text";   // the <pre> in index.html
const tickButtonElementId = "tick-button";   // the <button> in index.html

start();

// any failure, from a missing file to bad data, ends here: nothing is drawn and the page says why
async function start(): Promise<void> {
  try {
    findElement(tickButtonElementId).addEventListener("click", runTickAndRedraw);
    await loadAndDraw();
  } catch (error) {
    showError(error);
  }
}

async function runTickAndRedraw(): Promise<void> {
  try {
    await runTick();
    await loadAndDraw();
  } catch (error) {
    showError(error);
  }
}

async function loadAndDraw(): Promise<void> {
  // both files download at the same time
  const [mapFile, gameState] = await Promise.all([fetchJson(mapFileUrl), fetchGameState()]);
  const game: Game = buildGame({ mapFile, gameState });
  drawGame(game);
  provincePanel.showGame(game);
  debugPanel.showGame(game);
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
