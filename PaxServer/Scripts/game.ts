// the game as the page sees it: the two validated files joined by province id, then only read.
// readonly marks that intent for the compiler; nothing enforces it at runtime
import { CheckedFiles, GameState, Institution, ProvinceOutline, validateFiles } from "./validator.js";
export type { Institution, Value } from "./validator.js";

export type ShapeGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface Nation {
  readonly key: string;      // "fra", what province owners refer to
  readonly name: string;     // "France"
  readonly colour: string;   // "#b426cf"
}

export interface Province {
  readonly id: string;                      // "fr_18", the same id as in provinces.geojson
  readonly name: string;                    // "Cher"
  readonly owner: Nation;
  readonly outline: ShapeGeometry;
  readonly institutions: readonly Institution[];
}

export interface Game {
  readonly provinces: ReadonlyMap<string, Province>;   // by id
  readonly nations: ReadonlyMap<string, Nation>;       // by key
}

// a province as plain data, the way it would be written to a file or sent over the network
export interface SerializedProvince {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
}

// the two files as downloaded, not yet checked
export interface GameFiles {
  readonly mapFile: unknown;     // provinces.geojson
  readonly gameState: unknown;   // sampleGameState.json, until the server sends it
}

// checks both files, then joins them by province id. throws, listing every problem, if they are bad.
// builds everything from scratch on every call: nothing is kept from a previous game
export function buildGame(files: GameFiles): Game {
  const checkedFiles: CheckedFiles = validateFiles(files.mapFile, files.gameState);
  const nations: ReadonlyMap<string, Nation> = buildNations(checkedFiles.gameState);
  const provinces: ReadonlyMap<string, Province> = buildProvinces(checkedFiles.outlines, checkedFiles.gameState, nations);
  return { provinces, nations };
}

// references become ids (owner: "fra"); the outline is left out, being hundreds of points
export function serializeProvince(province: Province): SerializedProvince {
  return {
    id: province.id,
    name: province.name,
    owner: province.owner.key,
  };
}

function buildNations(gameState: GameState): ReadonlyMap<string, Nation> {
  const nations = new Map<string, Nation>();
  for (const [key, nation] of Object.entries(gameState.nations)) {
    nations.set(key, { key, name: nation.name, colour: nation.colour });
  }
  return nations;
}

// validateFiles already confirmed every outline has a province, every province an outline,
// and every owner a real nation, so this join cannot fail
function buildProvinces(outlines: readonly ProvinceOutline[], gameState: GameState, nations: ReadonlyMap<string, Nation>): ReadonlyMap<string, Province> {
  const provinces = new Map<string, Province>();
  for (const outline of outlines) {
    const id: string = outline.properties.id;
    const source = gameState.provinces[id];
    const owner: Nation = nationOf(nations, source.owner);
    provinces.set(id, { id, name: source.name, owner, outline: outline.geometry, institutions: source.institutions });
  }
  return provinces;
}

// a miss here means validateFiles let an unknown owner through: a broken invariant, not bad input
function nationOf(nations: ReadonlyMap<string, Nation>, key: string): Nation {
  const nation: Nation | undefined = nations.get(key);
  if (!nation) throw new Error(`nation ${key} not found even though validateFiles checked it exists`);
  return nation;
}
