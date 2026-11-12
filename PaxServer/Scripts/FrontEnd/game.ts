// the game as the page sees it: the two validated files joined by province id, then only read.
// readonly marks that intent for the compiler; nothing enforces it at runtime
import { CheckedFiles, GameState, Institution, ProvinceOutline, validateFiles } from "./validator.js";
export type { Institution, Value } from "./validator.js";

export type ShapeGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface Actor {
  readonly tag: string;      // "fra", what province owners refer to
  readonly name: string;     // "France"
  readonly colour: string;   // "#b426cf"
}

export interface Province {
  readonly id: string;                      // "fr_18", the same id as in provinces.geojson
  readonly name: string;                    // "Cher"
  readonly owner: Actor;
  readonly outline: ShapeGeometry;
  readonly institutions: Readonly<Record<string, Institution>>;   // keyed by institution name
}

export interface Entity {
  readonly id: string;           // "bel.army_1": owner tag first, since the document's id is only unique within its actor
  readonly name: string;         // "Belgian Army"
  readonly type: string;         // "entity_army"
  readonly owner: Actor;
  readonly location: Province;
}

export interface Game {
  readonly provinces: ReadonlyMap<string, Province>;   // by id
  readonly actors: ReadonlyMap<string, Actor>;         // by tag
  readonly entities: ReadonlyMap<string, Entity>;      // by id ("bel.army_1")
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
  readonly gameState: unknown;   // what the server sends
}

// checks both files, then joins them by province id. throws, listing every problem, if they are bad.
// builds everything from scratch on every call: nothing is kept from a previous game
export function buildGame(files: GameFiles): Game {
  const checkedFiles: CheckedFiles = validateFiles(files.mapFile, files.gameState);
  const actors: ReadonlyMap<string, Actor> = buildActors(checkedFiles.gameState);
  const provinces: ReadonlyMap<string, Province> = buildProvinces(checkedFiles.outlines, checkedFiles.gameState, actors);
  const entities: ReadonlyMap<string, Entity> = buildEntities(checkedFiles.gameState, actors, provinces);
  return { provinces, actors, entities };
}

// references become ids (owner: "fra"); the outline is left out, being hundreds of points
export function serializeProvince(province: Province): SerializedProvince {
  return {
    id: province.id,
    name: province.name,
    owner: province.owner.tag,
  };
}

function buildActors(gameState: GameState): ReadonlyMap<string, Actor> {
  const actors = new Map<string, Actor>();
  for (const [tag, actor] of Object.entries(gameState.Actor)) {
    actors.set(tag, { tag, name: actor.name, colour: actor.colour });
  }
  return actors;
}

// validateFiles already confirmed every outline has a province, every province an outline,
// and every owner a real actor, so this join cannot fail
function buildProvinces(outlines: readonly ProvinceOutline[], gameState: GameState, actors: ReadonlyMap<string, Actor>): ReadonlyMap<string, Province> {
  const provinces = new Map<string, Province>();
  for (const outline of outlines) {
    const id: string = outline.properties.id;
    const source = gameState.provinces[id];
    const owner: Actor = actorOf(actors, source.owner);
    provinces.set(id, { id, name: source.name, owner, outline: outline.geometry, institutions: source.Institution });
  }
  return provinces;
}

// a miss here means validateFiles let an unknown owner through: a broken invariant, not bad input
function actorOf(actors: ReadonlyMap<string, Actor>, tag: string): Actor {
  const actor: Actor | undefined = actors.get(tag);
  if (!actor) throw new Error(`actor ${tag} not found even though validateFiles checked it exists`);
  return actor;
}

// validateFiles already confirmed every entity's location is a province, so this join cannot fail
function buildEntities(gameState: GameState, actors: ReadonlyMap<string, Actor>, provinces: ReadonlyMap<string, Province>): ReadonlyMap<string, Entity> {
  const entities = new Map<string, Entity>();
  for (const [tag, actorSource] of Object.entries(gameState.Actor)) {
    const owner: Actor = actorOf(actors, tag);
    for (const [idWithinOwner, entitySource] of Object.entries(actorSource.Entity)) {
      const id: string = `${tag}.${idWithinOwner}`;
      const location: Province = provinceOf(provinces, entitySource.location);
      entities.set(id, { id, name: entitySource.name, type: entitySource.type, owner, location });
    }
  }
  return entities;
}

// a miss here means validateFiles let an unknown location through: a broken invariant, not bad input
function provinceOf(provinces: ReadonlyMap<string, Province>, id: string): Province {
  const province: Province | undefined = provinces.get(id);
  if (!province) throw new Error(`province ${id} not found even though validateFiles checked it exists`);
  return province;
}
