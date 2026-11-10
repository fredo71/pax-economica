// helpers for the page itself, shared by every module that touches index.html

// throws if index.html lacks the element, which is a mistake in the page itself
export function findElement(elementId: string): HTMLElement {
  const element: HTMLElement | null = document.getElementById(elementId);
  if (!element) throw new Error(`index.html has no element with id "${elementId}"`);
  return element;
}
