import { Game, Province, SerializedProvince, ShapeGeometry, serializeProvince } from "./game.js";
import { findElement } from "./page.js";

// each drawn shape carries its Province, so styling and clicks need no lookup
interface DrawnProperties {
  readonly province: Province;
}
type DrawnShape = GeoJSON.Feature<ShapeGeometry, DrawnProperties>;

const mapElementId = "map";                     // the <div> in index.html
const provinceTextElementId = "province-text";  // the <pre> in index.html
const europeCentre: L.LatLngTuple = [50, 10];
const startingZoom = 4;
const jsonIndentSpaces = 2;

// every province shares these; only fillColor changes per province
const baseProvinceStyle: L.PathOptions = { fillOpacity: 1, color: "#333", weight: 1 };

// the layer on screen, kept so the next drawGame can remove it before drawing again
let provinceLayer: L.GeoJSON | undefined;

export function createMap(): L.Map {
  const container: HTMLElement = findElement(mapElementId);
  const map: L.Map = L.map(container);
  map.setView(europeCentre, startingZoom);
  return map;
}

// removes everything drawn before, then draws every province of game again
export function drawGame(map: L.Map, game: Game): void {
  provinceLayer?.remove();

  const shapes: DrawnShape[] = shapesOf(game);
  provinceLayer = L.geoJSON<DrawnProperties>(shapes, {
    style: provinceStyle,
    onEachFeature: listenForClick,
  });
  provinceLayer.addTo(map);
}

function shapesOf(game: Game): DrawnShape[] {
  const shapes: DrawnShape[] = [];
  for (const province of game.provinces.values()) {
    shapes.push({ type: "Feature", properties: { province }, geometry: province.outline });
  }
  return shapes;
}

// Leaflet types the shape as possibly missing; it never is for layers built from a list of shapes
function provinceStyle(shape: GeoJSON.Feature<GeoJSON.Geometry, DrawnProperties> | undefined): L.PathOptions {
  if (!shape) return baseProvinceStyle;

  const ownerColour: string = shape.properties.province.owner.colour;
  return { ...baseProvinceStyle, fillColor: ownerColour };
}

function listenForClick(shape: GeoJSON.Feature<GeoJSON.Geometry, DrawnProperties>, drawnShape: L.Layer): void {
  const province: Province = shape.properties.province;
  drawnShape.on("click", () => showProvinceText(province));
}

// raw text for now, to check the click reaches the right data
function showProvinceText(province: Province): void {
  const textBox: HTMLElement = findElement(provinceTextElementId);
  const printable: SerializedProvince = serializeProvince(province);
  textBox.textContent = JSON.stringify(printable, null, jsonIndentSpaces);
}
