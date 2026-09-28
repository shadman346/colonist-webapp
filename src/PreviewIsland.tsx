type Terrain = "wood" | "wool" | "grain" | "brick" | "ore" | "desert";
type PortType = "generic" | Exclude<Terrain, "desert">;
type Tile = { q: number; r: number; terrain: Terrain; number: number | null };
type Port = {
  q: number;
  r: number;
  edge: number;
  type: PortType;
  u: number;
  v: number;
};
type Point = { x: number; y: number };

const ASSETS = "/assets/colonist/base";
const HEX_RADIUS = 60;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const ROW_STEP = 1.5 * HEX_RADIUS;
const ORIGIN = { x: 390, y: 345 };

// The order reproduces the official Base gameplay still used in the placement audit.
const TERRAINS: Terrain[] = [
  "ore", "grain", "wood",
  "desert", "grain", "ore", "wool",
  "brick", "wood", "brick", "wood", "brick",
  "wool", "ore", "wood", "wool",
  "wool", "grain", "grain",
];
const NUMBERS: (number | null)[] = [
  8, 3, 6,
  null, 4, 9, 2,
  10, 5, 11, 10, 5,
  9, 6, 3, 8,
  12, 11, 4,
];

const tiles: Tile[] = [];
let nextTile = 0;
for (let r = -2; r <= 2; r += 1) {
  const minQ = Math.max(-2, -r - 2);
  const maxQ = Math.min(2, -r + 2);
  for (let q = minQ; q <= maxQ; q += 1) {
    tiles.push({ q, r, terrain: TERRAINS[nextTile]!, number: NUMBERS[nextTile]! });
    nextTile += 1;
  }
}

// edge 0 NE, 1 E, 2 SE, 3 SW, 4 W, 5 NW.
// u/v are normalized ship centers measured from Colonist's 2025 Base screenshot.
const ports: Port[] = [
  { q: 0, r: -2, edge: 5, type: "wood", u: -1.53, v: -3.09 },
  { q: 1, r: -2, edge: 0, type: "generic", u: 0.47, v: -3.09 },
  { q: 2, r: -1, edge: 0, type: "wool", u: 1.95, v: -2.05 },
  { q: 2, r: 0, edge: 1, type: "ore", u: 2.94, v: -0.01 },
  { q: 1, r: 1, edge: 2, type: "generic", u: 1.95, v: 2.01 },
  { q: -1, r: 2, edge: 2, type: "generic", u: 0.47, v: 3.04 },
  { q: -2, r: 2, edge: 3, type: "grain", u: -1.53, v: 3.04 },
  { q: -2, r: 1, edge: 4, type: "brick", u: -2.57, v: 1 },
  { q: -1, r: -1, edge: 4, type: "generic", u: -2.57, v: -1.03 },
];

function center(q: number, r: number): Point {
  return { x: ORIGIN.x + HEX_WIDTH * (q + r / 2), y: ORIGIN.y + ROW_STEP * r };
}

function vertex(q: number, r: number, index: number): Point {
  const base = center(q, r);
  const angle = ((60 * index - 90) * Math.PI) / 180;
  return {
    x: base.x + HEX_RADIUS * Math.cos(angle),
    y: base.y + HEX_RADIUS * Math.sin(angle),
  };
}

function hexPoints(q: number, r: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const point = vertex(q, r, index);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function shipCenter(port: Port): Point {
  return { x: ORIGIN.x + port.u * HEX_WIDTH, y: ORIGIN.y + port.v * ROW_STEP };
}

function pierEnd(from: Point, ship: Point): Point {
  const dx = from.x - ship.x;
  const dy = from.y - ship.y;
  const distance = Math.hypot(dx, dy);
  return { x: ship.x + (dx / distance) * 27, y: ship.y + (dy / distance) * 27 };
}

function PortPiers({ port }: { port: Port }) {
  const ship = shipCenter(port);
  return (
    <g className="preview-port-piers">
      {[port.edge, (port.edge + 1) % 6].map((corner) => {
        const from = vertex(port.q, port.r, corner);
        const to = pierEnd(from, ship);
        return (
          <g key={corner}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#80511c" strokeWidth="11" />
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#dca13a" strokeWidth="8" strokeDasharray="6 2" />
          </g>
        );
      })}
    </g>
  );
}

function NumberPlaque({ x, y, number }: { x: number; y: number; number: number }) {
  return (
    <image
      className="preview-number-plaque"
      href={`${ASSETS}/token-${number}.png`}
      x={x - 20}
      y={y + 8}
      width="40"
      height="40"
    />
  );
}

function TileArt({ tile }: { tile: Tile }) {
  const { x, y } = center(tile.q, tile.r);
  return (
    <g>
      <image
        href={`${ASSETS}/png/terrain-${tile.terrain}@2x.png`}
        x={x - HEX_WIDTH / 2}
        y={y - HEX_RADIUS}
        width={HEX_WIDTH}
        height={HEX_RADIUS * 2}
      />
      {tile.number === null ? (
        <image href={`${ASSETS}/png/icon-robber@2x.png`} x={x - 14} y={y - 1} width="28" height="43" />
      ) : (
        <NumberPlaque x={x} y={y} number={tile.number} />
      )}
      <title>{`${tile.terrain}${tile.number === null ? "" : ` · ${tile.number}`}`}</title>
    </g>
  );
}

const sampleRoads = [
  { q: 0, r: -2, edge: 1, color: "#c51825" },
  { q: -1, r: 0, edge: 3, color: "#2587dc" },
  { q: 2, r: 0, edge: 3, color: "#d9831c" },
  { q: -1, r: 1, edge: 2, color: "#c51825" },
  { q: 0, r: 1, edge: 2, color: "#55575d" },
];
const sampleBuildings = [
  { q: 0, r: -2, corner: 2, color: "#c51825" },
  { q: -1, r: 0, corner: 3, color: "#2587dc" },
  { q: 2, r: 0, corner: 4, color: "#d9831c" },
  { q: -1, r: 1, corner: 3, color: "#c51825" },
];

export default function PreviewIsland({ rolled }: { rolled: number | null }) {
  return (
    <div className="board-stage">
      <svg className="island-svg" viewBox="0 0 900 690" role="img" aria-label="Base game island with nineteen terrain hexes, number tokens, roads, settlements, and nine ports">
        <rect width="900" height="690" fill="#0869a8" />
        <g className="preview-coast" strokeLinejoin="round">
          {(["#0d78ad", "#78c7e2", "#f3f5d9", "#e2c27a"] as const).map((color, layer) => (
            <g key={color} fill="#dfbc70" stroke={color} strokeWidth={[48, 38, 29, 21][layer]}>
              {tiles.map((tile) => <polygon key={`${tile.q},${tile.r}`} points={hexPoints(tile.q, tile.r)} />)}
            </g>
          ))}
        </g>
        {ports.map((port, index) => <PortPiers key={index} port={port} />)}
        {tiles.map((tile) => <TileArt key={`${tile.q},${tile.r}`} tile={tile} />)}
        <g className="board-roads" strokeLinecap="round">
          {sampleRoads.map((road, index) => {
            const start = vertex(road.q, road.r, road.edge);
            const end = vertex(road.q, road.r, (road.edge + 1) % 6);
            return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={road.color} strokeWidth="10" />;
          })}
        </g>
        <g className="board-buildings">
          {sampleBuildings.map((building, index) => {
            const point = vertex(building.q, building.r, building.corner);
            return (
              <path
                key={index}
                transform={`translate(${point.x} ${point.y})`}
                d="M-17 0 L0 -15 L17 0 L14 19 H-14 Z M-5 19 V5 H5 V19"
                fill={building.color}
                stroke="#2b2a23"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
        <g className="ports">
          {ports.map((port, index) => {
            const { x, y } = shipCenter(port);
            return <image key={index} href={`${ASSETS}/png/port-${port.type}@2x.png`} x={x - 31} y={y - 31} width="62" height="62" />;
          })}
        </g>
        {rolled && (
          <g className="rolled-dice">
            <rect x="700" y="558" width="160" height="53" rx="12" fill="#fff8e7" stroke="#ba8d4e" strokeWidth="4" />
            <text x="780" y="592" textAnchor="middle" fontSize="20" fontWeight="800" fill="#1a4163">Roll {rolled}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
