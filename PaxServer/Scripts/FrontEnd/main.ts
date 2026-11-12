import * as debugPanel from "./debugPanel.js";
import { createGame, fetchGameState, runTick } from "./gameApi.js";
import { Game, buildGame } from "./game.js";
import { drawGame } from "./map.js";
import { findElement } from "./page.js";
import * as sidePanel from "./sidePanel.js";

const mapFileUrl = "provinces.geojson";
const errorTextElementId = "error-text";   // the <pre> in index.html
const tickButtonElementId = "tick-button";   // the <button> in index.html
const tokenStorageKey = "gameToken";   // sessionStorage: one per tab, kept through a refresh

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
    const token: string | null = sessionStorage.getItem(tokenStorageKey);
    if (token === null) throw new Error("there is no game to run a turn on: reload the page");
    const tickRan: boolean = await runTick(token);
    if (!tickRan) throw new Error("this game has expired: reload the page to start a new one");
    await loadAndDraw();
  } catch (error) {
    showError(error);
  }
}

async function loadAndDraw(): Promise<void> {
  // both files download at the same time
  const [mapFile, gameState] = await Promise.all([fetchJson(mapFileUrl), fetchCurrentGameState()]);
  const game: Game = buildGame({ mapFile, gameState });
  drawGame(game);
  sidePanel.showGame(game);
  debugPanel.showGame(game);
}

// the tab's game, or a new one when the tab has none yet or its game has expired
async function fetchCurrentGameState(): Promise<unknown> {
  const storedToken: string | null = sessionStorage.getItem(tokenStorageKey);
  if (storedToken !== null) {
    const gameState: unknown = await fetchGameState(storedToken);
    const gameHasExpired = gameState === null;
    if (!gameHasExpired) return gameState;
  }
  const newToken: string = await createGame();
  sessionStorage.setItem(tokenStorageKey, newToken);
  return fetchGameState(newToken);
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
