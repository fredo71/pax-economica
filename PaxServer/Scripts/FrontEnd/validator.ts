// checks the two files the page downloads: the map file (province outlines) and the game state (what the server sends:
// the game document itself, copied from GameState.cs, whose key names (Actor, Institution, calculated_value) it keeps)
import * as z from "zod";

const mapFileLabel = "map file";
const gameStateFileLabel = "game state";

// ---- schemas: the outline of each piece on its own ----

const nonEmptyText = z.string().min(1);

// asks the browser itself, so any colour it can draw is accepted ("#b426cf", "red") and typos are not
const drawableColour = z.string().refine(colour => CSS.supports("color", colour), "not a colour the browser can draw");

const valueSchema = z.object({
  displayName: nonEmptyText,                                // "GDP", what the player reads
  type: nonEmptyText,                                       // "float"
  formula: nonEmptyText,                                    // "prev.base + growth*prev.base"
  calculated_value: z.number(),
  unit: z.string(),                                         // " M$": put right after the figure, so it carries its own leading space if it wants one
  description: z.string(),
});

const institutionSchema = z.object({
  displayName: nonEmptyText,                                // "Economy", what the player reads
  values: z.record(z.string(), valueSchema),                // keyed by value name ("gdp")
});

const institutionsByName = z.record(z.string(), institutionSchema);

const actorSchema = z.object({
  name: nonEmptyText,
  colour: drawableColour,
  Institution: institutionsByName,
});

const provinceSchema = z.object({
  name: nonEmptyText,
  owner: nonEmptyText,                                      // a key into Actor
  Institution: institutionsByName,
});

const worldSchema = z.object({
  Institution: institutionsByName,
});

export const gameStateSchema = z.object({
  turn: z.number().int().nonnegative(),
  Actor: z.record(z.string(), actorSchema),                 // keyed by actor tag
  provinces: z.record(z.string(), provinceSchema),          // keyed by province id
  world: worldSchema,
});

export type GameState = z.infer<typeof gameStateSchema>;
export type Actor = z.infer<typeof actorSchema>;
export type Institution = z.infer<typeof institutionSchema>;
export type Value = z.infer<typeof valueSchema>;

// GeoJSON writes each point [longitude, latitude], optionally followed by an altitude
const position = z.array(z.number()).min(2);
const ring = z.array(position);

// points or lines would draw as nothing, so only areas are accepted
const polygonSchema = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring) });
const multiPolygonSchema = z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring)) });

const provinceOutlineSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({ id: nonEmptyText }),
  geometry: z.union([polygonSchema, multiPolygonSchema]),
});

const mapFileSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(provinceOutlineSchema),
});

export type ProvinceOutline = z.infer<typeof provinceOutlineSchema>;

// ---- entry point ----

export interface CheckedFiles {
  readonly outlines: readonly ProvinceOutline[];
  readonly gameState: GameState;
}

// throws one error listing every problem. stops after the schemas if either file is malformed,
// since the checks across pieces would only produce follow-on noise
export function validateFiles(mapFileJson: unknown, gameStateJson: unknown): CheckedFiles {
  const mapFileResult = mapFileSchema.safeParse(mapFileJson);
  const gameStateResult = gameStateSchema.safeParse(gameStateJson);
  if (!mapFileResult.success || !gameStateResult.success) {
    const schemaProblems: string[] = [
      ...describeSchemaIssues(mapFileLabel, mapFileResult),
      ...describeSchemaIssues(gameStateFileLabel, gameStateResult),
    ];
    throwProblems(schemaProblems);
  }

  const outlines: ProvinceOutline[] = mapFileResult.data.features;
  const gameState: GameState = gameStateResult.data;
  const referenceProblems: string[] = checkReferences(outlines, gameState);
  if (referenceProblems.length > 0) throwProblems(referenceProblems);

  return { outlines, gameState };
}

// ---- checks across pieces: each returns its own problems, empty when all is well ----

function checkReferences(outlines: readonly ProvinceOutline[], gameState: GameState): string[] {
  return [
    ...findDuplicateOutlineIds(outlines),
    ...findOutlinesWithoutProvince(outlines, gameState),
    ...findProvincesWithoutOutline(outlines, gameState),
    ...findUnknownProvinceOwners(gameState),
  ];
}

// the game state's provinces are object keys, which JSON cannot repeat, but the map's features are a list
function findDuplicateOutlineIds(outlines: readonly ProvinceOutline[]): string[] {
  const ids: string[] = outlines.map(outline => outline.properties.id);
  return repeatedNames(ids).map(id => `${mapFileLabel}: more than one outline has id ${id}`);
}

function findOutlinesWithoutProvince(outlines: readonly ProvinceOutline[], gameState: GameState): string[] {
  const problems: string[] = [];
  for (const outline of outlines) {
    const id: string = outline.properties.id;
    const hasProvince = Object.hasOwn(gameState.provinces, id);
    if (!hasProvince) problems.push(`outline ${id} has no province in the ${gameStateFileLabel}`);
  }
  return problems;
}

function findProvincesWithoutOutline(outlines: readonly ProvinceOutline[], gameState: GameState): string[] {
  const outlineIds: Set<string> = new Set(outlines.map(outline => outline.properties.id));
  const problems: string[] = [];
  for (const id of Object.keys(gameState.provinces)) {
    const hasOutline: boolean = outlineIds.has(id);
    if (!hasOutline) problems.push(`province ${id} has no outline in the ${mapFileLabel}`);
  }
  return problems;
}

function findUnknownProvinceOwners(gameState: GameState): string[] {
  const problems: string[] = [];
  for (const [id, province] of Object.entries(gameState.provinces)) {
    const ownerExists = Object.hasOwn(gameState.Actor, province.owner);
    if (!ownerExists) problems.push(`province ${id} is owned by ${province.owner}, which is not an actor`);
  }
  return problems;
}

// ---- helpers ----

// each name that appears more than once, listed once
function repeatedNames(names: readonly string[]): string[] {
  const seen: Set<string> = new Set();
  const repeated: Set<string> = new Set();
  for (const name of names) {
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated];
}

// one line per Zod issue, with the path to the faulty field
function describeSchemaIssues(fileLabel: string, result: z.ZodSafeParseResult<unknown>): string[] {
  if (result.success) return [];

  return result.error.issues.map(issue => {
    const path: string = [fileLabel, ...issue.path.map(String)].join(" › ");
    return `${path}: ${issue.message}`;
  });
}

function throwProblems(problems: readonly string[]): never {
  const lines: string = problems.map(problem => `- ${problem}`).join("\n");
  throw new Error(`The data has ${problems.length} problem(s):\n${lines}`);
}
