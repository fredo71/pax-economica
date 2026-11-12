import { Game } from "./game.js";
import { findElement } from "./page.js";
import * as entityPanel from "./showEntity.js";
import * as provincePanel from "./showProvince.js";

const provincePanelElementId = "province-panel";   // an <aside> in index.html
const entityPanelElementId = "entity-panel";       // an <aside> in index.html

type ShownContent = "province" | "entity" | null;
let shownContent: ShownContent = null;

export function showGame(game: Game): void {
  provincePanel.showGame(game);
  entityPanel.showGame(game);
}

export function selectProvince(provinceId: string): void {
  shownContent = "province";
  provincePanel.selectProvince(provinceId);
  drawPanelVisibility();
}

export function hide(): void {
  shownContent = null;
  drawPanelVisibility();
}

export function selectEntity(entityId: string): void {
  shownContent = "entity";
  entityPanel.selectEntity(entityId);
  drawPanelVisibility();
}

function drawPanelVisibility(): void {
  findElement(provincePanelElementId).hidden = shownContent !== "province";
  findElement(entityPanelElementId).hidden = shownContent !== "entity";
}
