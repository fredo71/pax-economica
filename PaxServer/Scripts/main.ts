import { isLocal, showDebugText } from "./debugPanel.js";
import { Game, buildGame } from "./game.js";
import { createMap, drawGame, ProvinceClickListener } from "./map.js";
import { findElement } from "./page.js";
import { FillSidePanel } from "./showProvince.js";
import { CheckedFiles, validateFiles } from "./validator.js";

const mapFileUrl = "provinces.geojson";
const gameStateUrl = "sampleGameState.json";   // stands in for the server until it can send the game state itself
const errorTextElementId = "error-text";   // the <pre> in index.html

start();

// any failure, from a missing file to bad data, ends here: nothing is drawn and the page says why
async function start(): Promise<void> {
  try {
    // both files download at the same time
    const [mapFileJson, gameStateJson] = await Promise.all([fetchJson(mapFileUrl), fetchJson(gameStateUrl)]);
    const files: CheckedFiles = validateFiles(mapFileJson, gameStateJson);
    const map: L.Map = createMap();
    const game: Game = buildGame(files);
    drawGame(map, game, provinceClickListeners());
  } catch (error) {
    showError(error);
  }
}

// the real panel always; the raw-text debug panel only on the developer's machine
function provinceClickListeners(): ProvinceClickListener[] {
  const listeners: ProvinceClickListener[] = [FillSidePanel];
  if (isLocal()) listeners.push(showDebugText);
  return listeners;
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
