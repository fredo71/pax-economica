import { isLocal, showDebugText } from "./debugPanel.js";
import { Game, Province, ShapeGeometry } from "./game.js";
import { findElement } from "./page.js";
import { FillSidePanel } from "./showProvince.js";

// each drawn shape carries its Province, so styling and clicks need no lookup
interface DrawnProperties {
  readonly province: Province;
}
type DrawnShape = GeoJSON.Feature<ShapeGeometry, DrawnProperties>;

const mapElementId = "map";                     // the <div> in index.html
const europeCentre: L.LatLngTuple = [50, 10];
const startingZoom = 4;
const provinceClassName = "province";           // on every province's <path>, so a click can tell it hit one

// no +/- buttons: the panel covers the top-left corner they sit in. the wheel, double-click and pinch still zoom
const mapOptions: L.MapOptions = { zoomControl: false };

// every province shares these; only fillColor changes per province
const baseProvinceStyle: L.PathOptions = { fillOpacity: 1, color: "#333", weight: 1, className: provinceClassName };

// the map on screen, kept so the next drawGame can remove it: every draw starts from a fresh map
let shownMap: L.Map | undefined;

// replaces whatever was on screen with a new map showing every province of game.
// a redraw also resets the zoom and position, since the old map is thrown away with everything on it
export function drawGame(game: Game): void {
  shownMap?.remove();
  shownMap = createMap();
  drawProvinces(shownMap, game);
  listenForSeaClick(shownMap);
}

function createMap(): L.Map {
  const container: HTMLElement = findElement(mapElementId);
  const map: L.Map = L.map(container, mapOptions);
  map.setView(europeCentre, startingZoom);
  return map;
}

function drawProvinces(map: L.Map, game: Game): void {
  const shapes: DrawnShape[] = shapesOf(game);
  const provinceLayer: L.GeoJSON = L.geoJSON<DrawnProperties>(shapes, {
    style: provinceStyle,
    onEachFeature: (shape, drawnShape) => listenForClick(shape, drawnShape),
  });
  provinceLayer.addTo(map);
}

// a click on the sea calls onSelect with null
function listenForSeaClick(map: L.Map): void {
  map.on("click", (event: L.LeafletMouseEvent) => {
    // the map hears every click, province clicks included; those are listenForClick's job
    const clickedElement = event.originalEvent.target as Element;
    const clickedProvince: boolean = clickedElement.classList.contains(provinceClassName);
    if (clickedProvince) return;
    onSelect(null);
  });
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
  drawnShape.on("click", () => onSelect(province));
}

// everything a click changes. province is null when the click landed on the sea.
// the real panel always; the raw-text debug panel only on the developer's machine
function onSelect(province: Province | null): void {
  FillSidePanel(province);
  if (isLocal()) showDebugText(province);
}
