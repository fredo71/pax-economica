// the game as the page sees it: built once from the two files, then only read.
// readonly marks that intent for the compiler; nothing enforces it at runtime

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
  readonly neighbours: readonly string[];   // province ids; objects would point at each other in circles
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
  readonly neighbours: readonly string[];
}

export interface Value {
  readonly name: string;                         // "gdp"
  readonly figure: number | string | boolean;    // calculated_value
  readonly description: string;                  // "" if the document has none
}

export interface Institution {
  readonly name: string;
  readonly values: readonly Value[];
}

// builds the Game from the two raw files; throws one error listing every problem found.
// only what the page uses is checked: value types and references inside formulas are the C# engine's job
export function buildGame(shapesJson: unknown, gameDocumentJson: unknown): Game {
  const builder = new GameBuilder();
  return builder.build(shapesJson, gameDocumentJson);
}

// references become ids (owner: "fra"); the outline is left out, being hundreds of points
export function serializeProvince(province: Province): SerializedProvince {
  return {
    id: province.id,
    name: province.name,
    owner: province.owner.key,
    neighbours: province.neighbours,
  };
}

// the top-level sections of both files, confirmed to have the right structure
interface CheckedSources {
  readonly shapes: readonly unknown[];
  readonly actors: Record<string, unknown>;
  readonly provinceEntries: Record<string, unknown>;
}

// every check records a problem and carries on, so one run reports every mistake at once
class GameBuilder {
  private readonly problems: string[] = [];
  private readonly outlines = new Map<string, ShapeGeometry>();
  private readonly nations = new Map<string, Nation>();
  private readonly brokenNations = new Set<string>();   // keys of nations left out for their own problems
  private readonly provinces = new Map<string, Province>();

  // stops after the first two steps if anything is wrong: linking broken files only piles up follow-on errors
  build(shapesJson: unknown, gameDocumentJson: unknown): Game {
    const sources: CheckedSources = this.checkStructure(shapesJson, gameDocumentJson);
    this.indexOutlines(sources.shapes);
    this.throwIfProblems();

    this.buildNations(sources.actors);
    this.buildProvinces(sources.provinceEntries);
    this.checkShapesHaveEntries(sources.provinceEntries);
    this.checkNeighbours(sources.provinceEntries);
    this.throwIfProblems();

    return { provinces: this.provinces, nations: this.nations };
  }

  // a missing section is recorded and replaced by an empty one, so the next step can still run.
  // the has... conditions carry no type annotation: an annotated one would stop TypeScript narrowing through it
  private checkStructure(shapesJson: unknown, gameDocumentJson: unknown): CheckedSources {
    const shapes: unknown = isRecord(shapesJson) ? shapesJson.features : undefined;
    const actors: unknown = isRecord(gameDocumentJson) ? gameDocumentJson.Actor : undefined;
    const provinceEntries: unknown = isRecord(gameDocumentJson) ? gameDocumentJson.Provinces : undefined;

    const hasShapes = Array.isArray(shapes);
    const hasActors = isRecord(actors);
    const hasProvinceEntries = isRecord(provinceEntries);
    if (!hasShapes) this.problems.push("the shapes file has no features list");
    if (!hasActors) this.problems.push("the game document has no Actor section");
    if (!hasProvinceEntries) this.problems.push("the game document has no Provinces section");

    return {
      shapes: hasShapes ? shapes : [],
      actors: hasActors ? actors : {},
      provinceEntries: hasProvinceEntries ? provinceEntries : {},
    };
  }

  private indexOutlines(shapes: readonly unknown[]): void {
    shapes.forEach((shape, position) => {
      const properties: unknown = isRecord(shape) ? shape.properties : undefined;
      const id: unknown = isRecord(properties) ? properties.id : undefined;
      const outline: unknown = isRecord(shape) ? shape.geometry : undefined;

      if (!isText(id)) {
        this.problems.push(`shape number ${position + 1} has no id`);
        return;
      }
      if (!isOutline(outline)) {
        this.problems.push(`shape ${id} has no Polygon or MultiPolygon outline`);
        return;
      }
      if (this.outlines.has(id)) {
        this.problems.push(`shape ${id} appears more than once`);
        return;
      }
      this.outlines.set(id, outline);
    });
  }

  private buildNations(actors: Record<string, unknown>): void {
    for (const [key, actor] of Object.entries(actors)) {
      const name: unknown = isRecord(actor) ? actor.Name : undefined;
      const colour: unknown = isRecord(actor) ? actor.Colour : undefined;

      const hasName = isText(name);
      const hasColour = isColour(colour);
      if (!hasName) this.problems.push(`nation ${key} has no Name`);
      if (!hasColour) this.problems.push(`nation ${key} has no Colour the browser can draw`);
      if (!hasName || !hasColour) {
        this.brokenNations.add(key);
        continue;
      }
      this.nations.set(key, { key, name, colour });
    }
  }

  // a province with any problem is left out, and its problems are recorded
  private buildProvinces(provinceEntries: Record<string, unknown>): void {
    for (const [id, entry] of Object.entries(provinceEntries)) {
      if (!isRecord(entry)) {
        this.problems.push(`province ${id} is not an object`);
        continue;
      }
      const name: string | undefined = this.readName(id, entry);
      const outline: ShapeGeometry | undefined = this.findOutline(id);
      const owner: Nation | undefined = this.resolveOwner(id, entry);
      const neighbours: string[] | undefined = this.readNeighbours(id, entry);
      const institutions: Institution[] | undefined = this.readInstitutions(id, entry);

      if (!name || !outline || !owner || !neighbours || !institutions) continue;

      this.provinces.set(id, { id, name, owner, neighbours, outline , institutions });
    }
  }

  private readName(provinceId: string, entry: Record<string, unknown>): string | undefined {
    const name: unknown = entry.Name;
    if (isText(name)) return name;

    this.problems.push(`province ${provinceId} has no Name`);
    return undefined;
  }

  private findOutline(provinceId: string): ShapeGeometry | undefined {
    const outline: ShapeGeometry | undefined = this.outlines.get(provinceId);
    if (outline) return outline;

    this.problems.push(`province ${provinceId} is in the game document but has no shape`);
    return undefined;
  }

  // the only code that knows how the engine stores an owner: { ..., calculated_value: "fra" }
  private resolveOwner(provinceId: string, entry: Record<string, unknown>): Nation | undefined {
    const owner: unknown = entry.owner;
    const ownerKey: unknown = isRecord(owner) ? owner.calculated_value : undefined;
    if (!isText(ownerKey)) {
      this.problems.push(`province ${provinceId} has no owner`);
      return undefined;
    }

    const nation: Nation | undefined = this.nations.get(ownerKey);
    if (nation) return nation;

    const alreadyReported = this.brokenNations.has(ownerKey);
    if (alreadyReported) return undefined;

    this.problems.push(`province ${provinceId} is owned by ${ownerKey}, which is not a nation`);
    return undefined;
  }

  private readNeighbours(provinceId: string, entry: Record<string, unknown>): string[] | undefined {
    const neighbours: unknown = entry.Neighbors;
    if (isTextList(neighbours)) return neighbours;

    this.problems.push(`province ${provinceId} has no Neighbors list of province ids`);
    return undefined;
  }

// a province without an Institution section simply has none; that is not a problem
private readInstitutions(provinceId: string, entry: Record<string, unknown>): Institution[] | undefined {
  const section: unknown = entry.Institution;                       // level 1: known key
  if (section === undefined) return [];
  if (!isRecord(section)) {
    this.problems.push(`province ${provinceId} has an Institution entry that is not an object`);
    return undefined;
  }

  const institutions: Institution[] = [];
  for (const [institutionName, institution] of Object.entries(section)) {   // level 2: unknown keys
    const values: Value[] | undefined = this.readValues(provinceId, institutionName, institution);
    if (values) institutions.push({ name: institutionName, values });
  }
  return institutions;
}

  private readValues(provinceId: string, institutionName: string, institution: unknown): Value[] | undefined {
    const valuesSection: unknown = isRecord(institution) ? institution.Values : undefined;   // level 3
    if (!isRecord(valuesSection)) {
      this.problems.push(`province ${provinceId}: ${institutionName} has no Values`);
      return undefined;
    }

    const values: Value[] = [];
    for (const [valueName, value] of Object.entries(valuesSection)) {
      const parsedValue = this.readValue(provinceId, institutionName, valueName, value);
      if (parsedValue) values.push(parsedValue);
    }
    return values;
  }

  // one entry of a Values section, as the engine stores it: { calculated_value, Description }
  private readValue(provinceId: string, institutionName: string, valueName: string, value: unknown): Value | undefined {
    if (!isRecord(value)) {
      this.problems.push(`province ${provinceId}: ${institutionName}.${valueName} is not an object`);
      return undefined;
    }

    const figure: unknown = value.calculated_value;
    if (!isFigure(figure)) {
      this.problems.push(`province ${provinceId}: ${institutionName}.${valueName} has no calculated_value`);
      return undefined;
    }

    const description: unknown = value.Description;
    return { name: valueName, figure, description: isText(description) ? description : "" };
  }


  private checkShapesHaveEntries(provinceEntries: Record<string, unknown>): void {
    for (const id of this.outlines.keys()) {
      const hasEntry = Object.hasOwn(provinceEntries, id);
      if (!hasEntry) this.problems.push(`shape ${id} has no province in the game document`);
    }
  }

  // checked against the document rather than the built provinces, so a neighbour
  // left out for its own problem is not reported a second time here
  private checkNeighbours(provinceEntries: Record<string, unknown>): void {
    for (const province of this.provinces.values()) {
      for (const neighbourId of province.neighbours) {
        const neighbourExists = Object.hasOwn(provinceEntries, neighbourId);
        if (!neighbourExists) this.problems.push(`province ${province.id} lists neighbour ${neighbourId}, which is not a province`);
      }
    }
  }

  private throwIfProblems(): void {
    if (this.problems.length === 0) return;

    const list: string = this.problems.map(problem => `- ${problem}`).join("\n");
    throw new Error(`The game data has ${this.problems.length} problem(s):\n${list}`);
  }
}

// a JSON object, as opposed to a list, text, number or null
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

function isFigure(value: unknown): value is number | string | boolean {
  return typeof value === "number" || typeof value === "string" || typeof value === "boolean";
}

// asks the browser itself, so any colour it can draw is accepted ("#b426cf", "red", "rgb(...)") and typos are not
function isColour(value: unknown): value is string {
  return isText(value) && CSS.supports("color", value);
}

// the coordinates themselves are trusted: the map tool that wrote them already repaired them
function isOutline(value: unknown): value is ShapeGeometry {
  if (!isRecord(value)) return false;

  const isPolygonType = value.type === "Polygon" || value.type === "MultiPolygon";
  return isPolygonType && Array.isArray(value.coordinates);
}
