// checks the two files the page downloads: the map file (province outlines) and the game state (what the server sends:
// only display data, already evaluated). the game document's own format never reaches the page
import * as z from "zod";

const mapFileLabel = "map file";
const gameStateFileLabel = "game state";

// ---- schemas: the outline of each piece on its own ----

const nonEmptyText = z.string().min(1);

// asks the browser itself, so any colour it can draw is accepted ("#b426cf", "red") and typos are not
const drawableColour = z.string().refine(colour => CSS.supports("color", colour), "not a colour the browser can draw");

const valueSchema = z.object({
  name: nonEmptyText,                                       // "gdp"
  displayName: nonEmptyText,                                // "GDP", what the player reads
  figure: z.union([z.number(), z.string(), z.boolean()]),
  unit: z.string().default(""),                             // " M$": put right after the figure, so it carries its own leading space if it wants one
  description: z.string().default(""),                      // optional extra: missing becomes ""
});

const institutionSchema = z.object({
  name: nonEmptyText,                                       // "institution_economy_province"
  displayName: nonEmptyText,                                // "Economy", what the player reads
  values: z.array(valueSchema),
});

// a rule the engine applies (on encounter, destroyed when…), explained in words for the player
const ruleSchema = z.object({
  name: nonEmptyText,
  description: z.string(),
});

const nationSchema = z.object({
  name: nonEmptyText,
  colour: drawableColour,
  institutions: z.array(institutionSchema).default([]),
});

const provinceSchema = z.object({
  name: nonEmptyText,
  owner: nonEmptyText,                                      // a key into nations
  institutions: z.array(institutionSchema),
});

const entitySchema = z.object({
  type: nonEmptyText,                                       // "entity_army"
  owner: nonEmptyText,                                      // a key into nations
  location: nonEmptyText,                                   // a key into provinces: where the map draws it
  values: z.array(valueSchema),
  rules: z.array(ruleSchema).default([]),
});

export const gameStateSchema = z.object({
  turn: z.number().int().nonnegative(),
  nations: z.record(z.string(), nationSchema),              // keyed by nation key
  provinces: z.record(z.string(), provinceSchema),          // keyed by province id
  entities: z.record(z.string(), entitySchema).default({}), // keyed by entity id; top level so the map finds them by location
});

export type GameState = z.infer<typeof gameStateSchema>;
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
    ...findUnknownEntityOwners(gameState),
    ...findUnknownEntityLocations(gameState),
    ...findDuplicateInstitutions(gameState),
    ...findDuplicateValues(gameState),
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
    const ownerExists = Object.hasOwn(gameState.nations, province.owner);
    if (!ownerExists) problems.push(`province ${id} is owned by ${province.owner}, which is not a nation`);
  }
  return problems;
}

function findUnknownEntityOwners(gameState: GameState): string[] {
  const problems: string[] = [];
  for (const [id, entity] of Object.entries(gameState.entities)) {
    const ownerExists = Object.hasOwn(gameState.nations, entity.owner);
    if (!ownerExists) problems.push(`entity ${id} is owned by ${entity.owner}, which is not a nation`);
  }
  return problems;
}

function findUnknownEntityLocations(gameState: GameState): string[] {
  const problems: string[] = [];
  for (const [id, entity] of Object.entries(gameState.entities)) {
    const locationExists = Object.hasOwn(gameState.provinces, entity.location);
    if (!locationExists) problems.push(`entity ${id} is in ${entity.location}, which is not a province`);
  }
  return problems;
}

// institutions are lists, so a name can repeat; the panel would then show the same section twice
function findDuplicateInstitutions(gameState: GameState): string[] {
  const institutionLists: NamedList[] = [];
  for (const [id, province] of Object.entries(gameState.provinces)) institutionLists.push([`province ${id}`, province.institutions]);
  for (const [key, nation] of Object.entries(gameState.nations)) institutionLists.push([`nation ${key}`, nation.institutions]);
  return findRepeatedInLists(institutionLists, "institution");
}

// same reason as institutions: a repeated value name would show as two rows
function findDuplicateValues(gameState: GameState): string[] {
  const valueLists: NamedList[] = [];
  for (const [id, province] of Object.entries(gameState.provinces)) {
    for (const institution of province.institutions) valueLists.push([`province ${id}: ${institution.name}`, institution.values]);
  }
  for (const [key, nation] of Object.entries(gameState.nations)) {
    for (const institution of nation.institutions) valueLists.push([`nation ${key}: ${institution.name}`, institution.values]);
  }
  for (const [id, entity] of Object.entries(gameState.entities)) {
    valueLists.push([`entity ${id}`, entity.values]);
  }
  return findRepeatedInLists(valueLists, "value");
}

// ---- helpers ----

// a list of named items, with a label saying where it sits ("province de_by")
type NamedList = [label: string, items: readonly { name: string }[]];

function findRepeatedInLists(lists: readonly NamedList[], itemKind: string): string[] {
  const problems: string[] = [];
  for (const [label, items] of lists) {
    const names: string[] = items.map(item => item.name);
    for (const name of repeatedNames(names)) problems.push(`${label} has ${itemKind} ${name} more than once`);
  }
  return problems;
}

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
