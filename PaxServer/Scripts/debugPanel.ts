// the raw data of a clicked province, printed as text: a tool for building the real panel, not something players see
import { Province, SerializedProvince, serializeProvince } from "./game.js";
import { findElement } from "./page.js";

const debugTextElementId = "province-text";   // the <pre> in index.html
const jsonIndentSpaces = 2;
const localHostNames: readonly string[] = ["localhost", "127.0.0.1"];

// true on the developer's own machine. the code still reaches production, only switched off:
// nothing it prints is secret, since the page already downloaded all of it
export function isLocal(): boolean {
  const hostName: string = location.hostname;
  return localHostNames.includes(hostName);
}

// an empty box hides itself (.text-box:empty in page.css), so a sea click hides it too
export function showDebugText(province: Province | null): void {
  const textBox: HTMLElement = findElement(debugTextElementId);
  if (province === null) {
    textBox.textContent = "";
    return;
  }
  const printable: SerializedProvince = serializeProvince(province);
  textBox.textContent = JSON.stringify(printable, null, jsonIndentSpaces);
}
