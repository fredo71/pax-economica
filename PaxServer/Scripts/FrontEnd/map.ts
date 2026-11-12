import * as debugPanel from "./debugPanel.js";
import { Game, Province, ShapeGeometry } from "./game.js";
import { findElement } from "./page.js";
import * as sidePanel from "./sidePanel.js";

// each drawn shape carries its Province, so styling and clicks need no lookup
interface DrawnProperties {
  readonly province: Province;
}
type DrawnShape = GeoJSON.Feature<ShapeGeometry, DrawnProperties>;

const mapElementId = "map";                     // the <div> in index.html
const europeCentre: L.LatLngTuple = [50, 10];
const startingZoom = 4;
const provinceClassName = "province";           // on every province's <path>, so a click can tell it hit one
const entityClassName = "entity";               // on every entity's dot, for the same reason

// no +/- buttons: the panel covers the top-left corner they sit in. the wheel, double-click and pinch still zoom
const mapOptions: L.MapOptions = { zoomControl: false };

// every province shares these; only fillColor changes per province
const baseProvinceStyle: L.PathOptions = { fillOpacity: 1, color: "#333", weight: 1, className: provinceClassName };

// in metres on the ground, so a dot grows and shrinks with the provinces as the map zooms
const entityDotRadiusInMetres = 10_000;

// every entity shares these; only fillColor changes, to its owner's colour. the dark border keeps a dot visible
// on its owner's own provinces, which share that colour
const baseEntityDotStyle: L.CircleMarkerOptions = { radius: entityDotRadiusInMetres, fillOpacity: 1, color: "#000", weight: 1, className: entityClassName };

// the map on screen, kept so the next drawGame can remove it: every draw starts from a fresh map
let shownMap: L.Map | undefined;

// replaces whatever was on screen with a new map showing every province of game.
// a redraw also resets the zoom and position, since the old map is thrown away with everything on it
export function drawGame(game: Game): void {
  shownMap?.remove();
  shownMap = createMap();
  drawProvinces(shownMap, game);
  drawEntities(shownMap, game);
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

// one dot per entity, at its province's centre. several entities in one province draw on top of each other
function drawEntities(map: L.Map, game: Game): void {
  for (const entity of game.entities.values()) {
    const centre: L.LatLng = findProvinceCentre(entity.location);
    const dotStyle: L.CircleMarkerOptions = { ...baseEntityDotStyle, fillColor: entity.owner.colour };
    const dot: L.Circle = L.circle(centre, dotStyle);
    dot.on("click", () => onEntityClick(entity.id));
    dot.addTo(map);
  }
}

// the middle of the province's bounding box, which can fall outside a crescent-shaped province or one with far islands
function findProvinceCentre(province: Province): L.LatLng {
  const outlineLayer: L.GeoJSON = L.geoJSON(province.outline);
  const bounds: L.LatLngBounds = outlineLayer.getBounds();
  return bounds.getCenter();
}

function listenForSeaClick(map: L.Map): void {
  map.on("click", (event: L.LeafletMouseEvent) => {
    // the map hears every click, province and entity clicks included; those have their own listeners
    const clickedElement = event.originalEvent.target as Element;
    const clickedProvince: boolean = clickedElement.classList.contains(provinceClassName);
    const clickedEntity: boolean = clickedElement.classList.contains(entityClassName);
    if (clickedProvince || clickedEntity) return;
    onSeaClick();
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
  drawnShape.on("click", () => onProvinceClick(province.id));
}

function onProvinceClick(provinceId: string): void {
  sidePanel.selectProvince(provinceId);
  debugPanel.selectProvince(provinceId);
}

function onEntityClick(entityId: string): void {
  sidePanel.selectEntity(entityId);
}

function onSeaClick(): void {
  sidePanel.hide();
  debugPanel.selectProvince(null);
}
