import { Actor, Game, Institution, Province, Value } from "./game.js";
import { findElement } from "./page.js";

const panelElementId = "province-panel";   // the <aside> in index.html

let shownGame: Game | null = null;
// an id, not a Province: each turn brings a new game, and the id finds the selected province's new figures in it
let selectedProvinceId: string | null = null;
// keyed by institution name, so a block stays open across turns and across provinces
const openInstitutions: Set<string> = new Set();

export function showGame(game: Game): void {
  const isSameGame = game === shownGame;
  if (isSameGame) return;
  shownGame = game;
  drawPanel();
}

// provinceId is null when the click landed on the sea, which hides the panel
export function selectProvince(provinceId: string | null): void {
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

function drawPanel(): void {
  const province: Province | null = findSelectedProvince();
  const isSelected = province !== null;
  showPanel(isSelected);
  if (!isSelected) return;

  fillName(province.name);
  fillOwner(province.owner);
  fillInstitutions(province.institutions);
}

function findSelectedProvince(): Province | null {
  if (selectedProvinceId === null) return null;
  return shownGame?.provinces.get(selectedProvinceId) ?? null;
}

function showPanel(isShown: boolean): void {
  findElement(panelElementId).hidden = !isShown;
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

function fillInstitutions(institutions: Readonly<Record<string, Institution>>): void {
  const panel: HTMLElement = findElement("institution-panel");
  panel.replaceChildren();
  for (const [institutionName, institution] of Object.entries(institutions)) {
    panel.append(buildInstitutionBlock(institutionName, institution));
  }
}

function buildInstitutionBlock(institutionName: string, institution: Institution): DocumentFragment {
  const block: DocumentFragment = cloneTemplate("institution-template");
  findIn(block, ".institution-name").textContent = institution.displayName;

  const details: HTMLElement = findIn(block, ".institution");
  if (!(details instanceof HTMLDetailsElement)) throw new Error("the institution template's .institution is not a <details>");
  details.open = openInstitutions.has(institutionName);
  details.addEventListener("toggle", () => setInstitutionOpen(institutionName, details.open));

  const valuesContainer: HTMLElement = findIn(block, ".institution-values");
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
