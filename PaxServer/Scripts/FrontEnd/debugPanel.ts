// the raw data of a clicked province, printed as text: a tool for building the real panel, not something players see
import { Game, Province, SerializedProvince, serializeProvince } from "./game.js";
import { findElement } from "./page.js";

const debugTextElementId = "province-text";   // the <pre> in index.html
const jsonIndentSpaces = 2;
const localHostNames: readonly string[] = ["localhost", "127.0.0.1"];

let shownGame: Game | null = null;
// an id, not a Province: each turn brings a new game, and the id finds the selected province's new figures in it
let selectedProvinceId: string | null = null;

// does nothing away from the developer's machine
export function showGame(game: Game): void {
  const isSameGame = game === shownGame;
  if (!isLocal() || isSameGame) return;
  shownGame = game;
  drawDebugText();
}

// provinceId is null when the click landed on the sea, which empties the box.
// does nothing away from the developer's machine
export function selectProvince(provinceId: string | null): void {
  const isSameProvince = provinceId === selectedProvinceId;
  if (!isLocal() || isSameProvince) return;
  selectedProvinceId = provinceId;
  drawDebugText();
}

// true on the developer's own machine. the code still reaches production, only switched off:
// nothing it prints is secret, since the page already downloaded all of it
function isLocal(): boolean {
  const hostName: string = location.hostname;
  return localHostNames.includes(hostName);
}

// an empty box hides itself (.text-box:empty in page.css), so a sea click hides it too
function drawDebugText(): void {
  const textBox: HTMLElement = findElement(debugTextElementId);
  const province: Province | null = findSelectedProvince();
  if (province === null) {
    textBox.textContent = "";
    return;
  }
  const printable: SerializedProvince = serializeProvince(province);
  textBox.textContent = JSON.stringify(printable, null, jsonIndentSpaces);
}

function findSelectedProvince(): Province | null {
  if (selectedProvinceId === null) return null;
  return shownGame?.provinces.get(selectedProvinceId) ?? null;
}
