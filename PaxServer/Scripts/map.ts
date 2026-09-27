import { Game, Province, ShapeGeometry } from "./game.js";
import { findElement } from "./page.js";

type ProvinceClickListener = (province: Province) => void;

// each drawn shape carries its Province, so styling and clicks need no lookup
interface DrawnProperties {
  readonly province: Province;
}
type DrawnShape = GeoJSON.Feature<ShapeGeometry, DrawnProperties>;

const mapElementId = "map";                     // the <div> in index.html
const europeCentre: L.LatLngTuple = [50, 10];
const startingZoom = 4;

// no +/- buttons: the panel covers the top-left corner they sit in. the wheel, double-click and pinch still zoom
const mapOptions: L.MapOptions = { zoomControl: false };

// every province shares these; only fillColor changes per province
const baseProvinceStyle: L.PathOptions = { fillOpacity: 1, color: "#333", weight: 1 };

// the layer on screen, kept so the next drawGame can remove it before drawing again
let provinceLayer: L.GeoJSON | undefined;

// everyone told about a province click. the map never knows what they do with it
const clickListeners: ProvinceClickListener[] = [];

export function onProvinceClick(listener: ProvinceClickListener): void {
  clickListeners.push(listener);
}

export function createMap(): L.Map {
  const container: HTMLElement = findElement(mapElementId);
  const map: L.Map = L.map(container, mapOptions);
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
  drawnShape.on("click", () => announceClick(province));
}

function announceClick(province: Province): void {
  for (const listener of clickListeners) {
    listener(province);
  }
}
