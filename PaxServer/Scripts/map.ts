type ShapeGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
interface ShapeProperties {
  id: string;
}
type ProvinceShape = GeoJSON.Feature<ShapeGeometry, ShapeProperties>;

// only the parts of the game document the page reads; the file follows exemple/exemple.json's format
interface GameDocument {
  Actor: Record<string, Nation>;
  Provinces: Record<string, ProvinceEntry>;
}

interface Nation {
  Name: string;
  Colour: string;
}

interface ProvinceEntry {
  Name: string;
  owner: { calculated_value: string };
}

const shapesPath = "provinces.geojson";
const gameDocumentPath = "europe.json";
const mapElementId = "map";   // the <div> in index.html
const europeCentre: L.LatLngTuple = [50, 10];
const startingZoom = 4;
const unownedColour = "#c8c8c8";

// every province shares these; only fillColor changes per province
const baseProvinceStyle: L.PathOptions = { fillOpacity: 1, color: "#333", weight: 1 };

const map = L.map(mapElementId).setView(europeCentre, startingZoom);
showProvinces();

async function showProvinces(): Promise<void> {
  // both files download at the same time
  const [shapes, gameDocument] = await Promise.all([loadShapes(), loadGameDocument()]);
  reportMismatches(shapes, gameDocument);

  const provinceLayer = L.geoJSON<ShapeProperties>(shapes, {
    style: shape => provinceStyle(shape, gameDocument),
  });
  provinceLayer.addTo(map);
}

// throws if the file is missing or has no province list, so the error shows in the F12 console
async function loadShapes(): Promise<ProvinceShape[]> {
  const collection: any = await fetchJson(shapesPath);
  const hasFeatureList = Array.isArray(collection.features);
  if (!hasFeatureList) throw new Error(`${shapesPath} has no features list`);
  return collection.features;
}

// throws if the file is missing or lacks the Actor or Provinces section
async function loadGameDocument(): Promise<GameDocument> {
  const gameDocument: any = await fetchJson(gameDocumentPath);
  const hasSections = Boolean(gameDocument.Actor) && Boolean(gameDocument.Provinces);
  if (!hasSections) throw new Error(`${gameDocumentPath} needs an Actor and a Provinces section`);
  return gameDocument;
}

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

// warns in the F12 console and carries on: a province without an entry, or with an unknown owner, is drawn grey
function reportMismatches(shapes: ProvinceShape[], gameDocument: GameDocument): void {
  const shapeIds: Set<string> = new Set(shapes.map(shape => shape.properties.id));
  reportShapesWithoutEntry(shapeIds, gameDocument);
  reportEntriesWithoutShape(shapeIds, gameDocument);
  reportUnknownOwners(gameDocument);
}

function reportShapesWithoutEntry(shapeIds: Set<string>, gameDocument: GameDocument): void {
  for (const provinceId of shapeIds) {
    const hasEntry = Object.hasOwn(gameDocument.Provinces, provinceId);
    if (!hasEntry) console.warn(`province ${provinceId} has a shape but no entry in ${gameDocumentPath}`);
  }
}

function reportEntriesWithoutShape(shapeIds: Set<string>, gameDocument: GameDocument): void {
  for (const provinceId of Object.keys(gameDocument.Provinces)) {
    const hasShape = shapeIds.has(provinceId);
    if (!hasShape) console.warn(`province ${provinceId} is in ${gameDocumentPath} but has no shape`);
  }
}

function reportUnknownOwners(gameDocument: GameDocument): void {
  for (const [provinceId, province] of Object.entries(gameDocument.Provinces)) {
    const ownerKey: string = ownerOf(province);
    const ownerExists = Object.hasOwn(gameDocument.Actor, ownerKey);
    if (!ownerExists) console.warn(`province ${provinceId} is owned by unknown nation ${ownerKey}`);
  }
}

// Leaflet types the shape as any geometry, and as possibly missing; neither happens for layers built from a list of shapes
function provinceStyle(shape: GeoJSON.Feature<GeoJSON.Geometry, ShapeProperties> | undefined, gameDocument: GameDocument): L.PathOptions {
  if (!shape) return { ...baseProvinceStyle, fillColor: unownedColour };

  const provinceId: string = shape.properties.id;
  const fillColour: string = ownerColour(provinceId, gameDocument);
  return { ...baseProvinceStyle, fillColor: fillColour };
}

function ownerColour(provinceId: string, gameDocument: GameDocument): string {
  const province: ProvinceEntry | undefined = gameDocument.Provinces[provinceId];
  if (!province) return unownedColour;

  const ownerKey: string = ownerOf(province);
  const owner: Nation | undefined = gameDocument.Actor[ownerKey];
  if (!owner) return unownedColour;

  return owner.Colour;
}

// the only code that knows how the engine stores an owner; the one place to change when the view replaces the raw document
function ownerOf(province: ProvinceEntry): string {
  return province.owner.calculated_value;
}
