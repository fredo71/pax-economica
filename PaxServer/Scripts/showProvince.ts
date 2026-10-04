// fills the side panel on a click: province name, owner, then one collapsible block per institution
import { Institution, Nation, Province, Value } from "./game.js";
import { findElement } from "./page.js";

const panelElementId = "province-panel";   // the <aside> in index.html

// shows province in the panel, or hides the panel entirely when nothing is selected
export function FillSidePanel(province: Province | null): void {
  const panel: HTMLElement = findElement(panelElementId);
  panel.hidden = province === null;
  if (province === null) return;

  findElement("province-name").textContent = province.name;
  fillOwner(province.owner);
  fillInstitutions(province.institutions);
}

function fillOwner(owner: Nation): void {
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

  // most values have none; an empty description row would show as a blank line
  const descriptionElement: HTMLElement = findIn(row, ".value-description");
  if (value.description) descriptionElement.textContent = value.description;
  else descriptionElement.remove();

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
