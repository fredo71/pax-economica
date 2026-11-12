import { Actor, Entity, Game, Province } from "./game.js";
import { findElement } from "./page.js";
import * as sidePanel from "./sidePanel.js";

const panelElementId = "entity-panel";   // the <aside> in index.html

let shownGame: Game | null = null;
// an id, not an Entity: each turn brings a new game, and the id finds the selected entity's new figures in it
let selectedEntityId: string | null = null;

export function showGame(game: Game): void {
  const isSameGame = game === shownGame;
  if (isSameGame) return;
  shownGame = game;
  drawPanel();
}

export function selectEntity(entityId: string): void {
  const isSameEntity = entityId === selectedEntityId;
  if (isSameEntity) return;
  selectedEntityId = entityId;
  drawPanel();
}

function drawPanel(): void {
  const entity: Entity | null = findSelectedEntity();
  if (entity === null) return;

  fillName(entity.name);
  fillOwner(entity.owner);
  fillLocation(entity.location);
}

function findSelectedEntity(): Entity | null {
  if (selectedEntityId === null) return null;
  return shownGame?.entities.get(selectedEntityId) ?? null;
}

function fillName(entityName: string): void {
  findElement("entity-name").textContent = entityName;
}

// the panel's top border is the strip that ties the window to the owner, as on the province panel
function fillOwner(owner: Actor): void {
  findElement(panelElementId).style.borderTopColor = owner.colour;
  findElement("entity-owner-swatch").style.backgroundColor = owner.colour;
  findElement("entity-owner-name").textContent = owner.name;
}

function fillLocation(location: Province): void {
  const locationLink: HTMLElement = findElement("entity-location");
  locationLink.textContent = location.name;
  // onclick, not addEventListener: this button is never rebuilt, so each redraw would stack one more listener
  locationLink.onclick = () => sidePanel.selectProvince(location.id);
}
