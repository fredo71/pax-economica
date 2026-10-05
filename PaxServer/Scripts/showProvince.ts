// fills the side panel on a click: province name, owner, then one collapsible block per institution
import { Institution, Nation, Province, Value } from "./game.js";
import { findElement } from "./page.js";

const panelElementId = "province-panel";   // the <aside> in index.html

// shows province in the panel, or hides the panel entirely when nothing is selected
export function FillSidePanel(province: Province | null): void {
  const isSelected = province !== null;
  showPanel(isSelected);
  if (!isSelected) return;

  fillName(province.name);
  fillOwner(province.owner);
  fillInstitutions(province.institutions);
}

function showPanel(isShown: boolean): void {
  findElement(panelElementId).hidden = !isShown;
}

function fillName(provinceName: string): void {
  findElement("province-name").textContent = provinceName;
}

// the panel's top border is the strip that ties the window to the owner
function fillOwner(owner: Nation): void {
  findElement(panelElementId).style.borderTopColor = owner.colour;
  findElement("owner-swatch").style.backgroundColor = owner.colour;
  findElement("owner-name").textContent = owner.name;
}

function fillInstitutions(institutions: readonly Institution[]): void {
  const panel: HTMLElement = findElement("institution-panel");
  panel.replaceChildren();
  for (const institution of institutions) {
    panel.append(buildInstitutionBlock(institution));
  }
}

function buildInstitutionBlock(institution: Institution): DocumentFragment {
  const block: DocumentFragment = cloneTemplate("institution-template");
  findIn(block, ".institution-name").textContent = institution.displayName;

  const valuesContainer: HTMLElement = findIn(block, ".institution-values");
  for (const value of institution.values) {
    valuesContainer.append(buildValueRow(value));
  }
  return block;
}

function buildValueRow(value: Value): DocumentFragment {
  const row: DocumentFragment = cloneTemplate("value-row-template");
  findIn(row, ".value-name").textContent = value.displayName;
  findIn(row, ".value-figure").textContent = String(value.figure);

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
