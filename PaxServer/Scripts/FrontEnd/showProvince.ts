import { Actor, Entity, Game, Institution, Province, Value } from "./game.js";
import { findElement } from "./page.js";
import * as sidePanel from "./sidePanel.js";

const panelElementId = "province-panel";   // the <aside> in index.html
const entityListTitle = "Entities";

let shownGame: Game | null = null;
// an id, not a Province: each turn brings a new game, and the id finds the selected province's new figures in it
let selectedProvinceId: string | null = null;
// keyed by institution name, so a block stays open across turns and across provinces
const openInstitutions: Set<string> = new Set();
// one for every province, like the institution blocks: it stays open across turns and across provinces
let isEntityListOpen: boolean = false;

export function showGame(game: Game): void {
  const isSameGame = game === shownGame;
  if (isSameGame) return;
  shownGame = game;
  drawPanel();
}

export function selectProvince(provinceId: string): void {
  const isSameProvince = provinceId === selectedProvinceId;
  if (isSameProvince) return;
  selectedProvinceId = provinceId;
  drawPanel();
}

export function setInstitutionOpen(institutionName: string, isOpen: boolean): void {
  const wasOpen: boolean = openInstitutions.has(institutionName);
  if (wasOpen === isOpen) return;
  if (isOpen) openInstitutions.add(institutionName);
  else openInstitutions.delete(institutionName);
  drawPanel();
}

export function setEntityListOpen(isOpen: boolean): void {
  if (isOpen === isEntityListOpen) return;
  isEntityListOpen = isOpen;
  drawPanel();
}

function drawPanel(): void {
  const province: Province | null = findSelectedProvince();
  if (province === null) return;

  fillName(province.name);
  fillOwner(province.owner);
  fillEntities(province);
  fillInstitutions(province.institutions);
}

function findSelectedProvince(): Province | null {
  if (selectedProvinceId === null) return null;
  return shownGame?.provinces.get(selectedProvinceId) ?? null;
}

function fillName(provinceName: string): void {
  findElement("province-name").textContent = provinceName;
}

// the panel's top border is the strip that ties the window to the owner
function fillOwner(owner: Actor): void {
  findElement(panelElementId).style.borderTopColor = owner.colour;
  findElement("owner-swatch").style.backgroundColor = owner.colour;
  findElement("owner-name").textContent = owner.name;
}

// a province with no entities shows no list at all, not an empty one
function fillEntities(province: Province): void {
  const container: HTMLElement = findElement("province-entities");
  container.replaceChildren();
  const entitiesHere: Entity[] = findEntitiesIn(province);
  const hasEntities: boolean = entitiesHere.length > 0;
  if (!hasEntities) return;
  container.append(buildEntityList(entitiesHere));
}

function findEntitiesIn(province: Province): Entity[] {
  const entitiesHere: Entity[] = [];
  if (shownGame === null) return entitiesHere;
  for (const entity of shownGame.entities.values()) {
    const isHere = entity.location.id === province.id;
    if (isHere) entitiesHere.push(entity);
  }
  return entitiesHere;
}

function buildEntityList(entities: Entity[]): DocumentFragment {
  const block: DocumentFragment = cloneTemplate("dropdown-template");
  findIn(block, ".dropdown-title").textContent = entityListTitle;

  const details: HTMLElement = findIn(block, ".dropdown");
  if (!(details instanceof HTMLDetailsElement)) throw new Error("the dropdown template's .dropdown is not a <details>");
  details.open = isEntityListOpen;
  details.addEventListener("toggle", () => setEntityListOpen(details.open));

  const rowsContainer: HTMLElement = findIn(block, ".dropdown-content");
  for (const entity of entities) {
    rowsContainer.append(buildEntityRow(entity));
  }
  return block;
}

function buildEntityRow(entity: Entity): DocumentFragment {
  const row: DocumentFragment = cloneTemplate("entity-row-template");
  findIn(row, ".owner-swatch").style.backgroundColor = entity.owner.colour;
  findIn(row, ".entity-row-name").textContent = entity.name;
  findIn(row, ".entity-row").addEventListener("click", () => sidePanel.selectEntity(entity.id));
  return row;
}

function fillInstitutions(institutions: Readonly<Record<string, Institution>>): void {
  const panel: HTMLElement = findElement("institution-panel");
  panel.replaceChildren();
  for (const [institutionName, institution] of Object.entries(institutions)) {
    panel.append(buildInstitutionBlock(institutionName, institution));
  }
}

function buildInstitutionBlock(institutionName: string, institution: Institution): DocumentFragment {
  const block: DocumentFragment = cloneTemplate("dropdown-template");
  findIn(block, ".dropdown-title").textContent = institution.displayName;

  const details: HTMLElement = findIn(block, ".dropdown");
  if (!(details instanceof HTMLDetailsElement)) throw new Error("the dropdown template's .dropdown is not a <details>");
  details.open = openInstitutions.has(institutionName);
  details.addEventListener("toggle", () => setInstitutionOpen(institutionName, details.open));

  const valuesContainer: HTMLElement = findIn(block, ".dropdown-content");
  for (const value of Object.values(institution.values)) {
    valuesContainer.append(buildValueRow(value));
  }
  return block;
}

function buildValueRow(value: Value): DocumentFragment {
  const row: DocumentFragment = cloneTemplate("value-row-template");
  findIn(row, ".value-name").textContent = value.displayName;
  findIn(row, ".value-figure").textContent = `${value.calculated_value}${value.unit}`;

  // the browser's own tooltip on hover; an empty description shows none. phones have no hover, so they never see it
  findIn(row, ".value-row").title = value.description;
  return row;
}

function cloneTemplate(templateId: string): DocumentFragment {
  const template: HTMLElement = findElement(templateId);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`#${templateId} is not a <template>`);
  return template.content.cloneNode(true) as DocumentFragment;
}

// looks inside a fragment that isn't attached to the page yet, so findElement's getElementById can't reach it
function findIn(fragment: DocumentFragment, selector: string): HTMLElement {
  const element: Element | null = fragment.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`template is missing an element matching "${selector}"`);
  return element;
}
