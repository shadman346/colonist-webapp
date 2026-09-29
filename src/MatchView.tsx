import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Copy,
  Hourglass,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Shield,
  ShoppingBasket,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { COSTS, RESOURCES, type DevelopmentCard, type GameView, type Hex, type Resource, type ResourceCounts } from "../engine";
import { isLocalPreview, type LocalIdentity, type RoomView } from "./room/roomService";
import { createMatchClient, type MatchCommand } from "./match/matchService";
import { playTurnSound, setTurnSoundEnabled, turnSoundEnabled } from "./match/turnCue";
import "./matchStyles.css";

type Placement = "road" | "settlement" | "city" | null;
type Panel = "trade" | "development" | null;
type TradeTab = "bank" | "friend";
type SelectedVertex = { id: string; city: boolean } | null;

const palette: Record<string, string> = {
  coral: "#ea6e5d",
  sky: "#4b9cda",
  mint: "#56a875",
  violet: "#aa83cc",
  gold: "#bf8325",
  teal: "#168b86",
};
const resources: Record<Resource, { label: string; symbol: string; color: string }> = {
  wood: { label: "Wood", symbol: "♠", color: "#468a54" },
  brick: { label: "Brick", symbol: "▥", color: "#ba6650" },
  wool: { label: "Wool", symbol: "✿", color: "#9dbb67" },
  grain: { label: "Grain", symbol: "✦", color: "#deb653" },
  ore: { label: "Ore", symbol: "◆", color: "#758998" },
};
const terrainLabels: Record<Hex["terrain"], string> = {
  ...Object.fromEntries(RESOURCES.map((resource) => [resource, resources[resource].label])),
  desert: "Desert",
} as Record<Hex["terrain"], string>;
const phaseLabels: Record<GameView["phase"], string> = {
  "setup-settlement": "Place a settlement",
  "setup-road": "Place a road",
  "pre-roll": "Roll the dice",
  action: "Build, trade, or end your turn",
  discard: "Discard half your cards",
  "robber-move": "Move the robber",
  "robber-steal": "Choose a player",
  "road-building": "Place free roads",
  "special-build": "Special Build",
  completed: "Match complete",
};
const developmentLabels: Record<DevelopmentCard["type"], string> = {
  knight: "Knight",
  "road-building": "Road Building",
  "year-of-plenty": "Year of Plenty",
  monopoly: "Monopoly",
  "victory-point": "Victory Point",
};

function emptyCounts(): ResourceCounts {
  return { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

function sumCounts(counts: ResourceCounts): number {
  return RESOURCES.reduce((sum, resource) => sum + counts[resource], 0);
}

function canPay(hand: ResourceCounts, cost: ResourceCounts): boolean {
  return RESOURCES.every((resource) => hand[resource] >= cost[resource]);
}

const BOARD_ORIGIN = { x: 396, y: 372 };
const BOARD_HEX_SIZE = 56.6;

function atVertex(x: number, y: number, size: number) {
  return { x: BOARD_ORIGIN.x + (Math.sqrt(3) / 2) * size * x, y: BOARD_ORIGIN.y + (size / 2) * y };
}

function atHex(q: number, r: number, size: number) {
  return { x: BOARD_ORIGIN.x + Math.sqrt(3) * size * (q + r / 2), y: BOARD_ORIGIN.y + 1.5 * size * r };
}

function polygonPoints(x: number, y: number, size: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
  }).join(" ");
}

const baseAsset = (name: string) => `/assets/colonist/base/png/${name}@2x.png`;
const pieceColor = (color: string) => ({ coral: "red", sky: "blue", mint: "mint", violet: "violet", gold: "gold", teal: "teal", "#e45242": "red", "#3495d0": "blue", "#e9ab36": "gold", "#7b57bd": "violet", "#bf8325": "gold", "#168b86": "teal" })[color.toLowerCase()] ?? "blue";
const pieceAsset = (kind: "settlement" | "road", color: string) => `/assets/colonist/pieces/${kind}-${pieceColor(color)}.png`;

function terrainAsset(terrain: Hex["terrain"]): string {
  return baseAsset(`terrain-${terrain}`);
}

function resourceCardAsset(resource: Resource): string {
  return baseAsset(`card-${resource}`);
}

function numberTokenAsset(number: number): string {
  return baseAsset(`token-${number}`);
}

function portAsset(resource: Resource | null): string {
  return baseAsset(`port-${resource ?? "generic"}`);
}

function developmentCardAsset(type: DevelopmentCard["type"]): string {
  const names: Record<DevelopmentCard["type"], string> = {
    knight: "card-knight",
    "road-building": "card-roadbuilding",
    "year-of-plenty": "card-yearofplenty",
    monopoly: "card-monopoly",
    "victory-point": "card-vp",
  };
  return baseAsset(names[type]);
}

// The nine anchored ship centers follow the Base board reference, clockwise
// from the northwest shore. The board's terrain and port types still shuffle.
const PORT_SLOTS = [
  { hexId: "h:0,-2", edge: 5, u: -1.53, v: -3.09 },
  { hexId: "h:1,-2", edge: 0, u: 0.47, v: -3.09 },
  { hexId: "h:2,-1", edge: 0, u: 1.95, v: -2.05 },
  { hexId: "h:2,0", edge: 1, u: 2.94, v: -0.01 },
  { hexId: "h:1,1", edge: 2, u: 1.95, v: 2.01 },
  { hexId: "h:-1,2", edge: 2, u: 0.47, v: 3.04 },
  { hexId: "h:-2,2", edge: 3, u: -1.53, v: 3.04 },
  { hexId: "h:-2,1", edge: 4, u: -2.57, v: 1 },
  { hexId: "h:-1,-1", edge: 4, u: -2.57, v: -1.03 },
] as const;

function pierEnd(from: { x: number; y: number }, ship: { x: number; y: number }) {
  const dx = from.x - ship.x;
  const dy = from.y - ship.y;
  const distance = Math.hypot(dx, dy);
  return { x: ship.x + dx / distance * 27, y: ship.y + dy / distance * 27 };
}

function adjacentTiles(view: GameView, hexIds: string[]): string {
  return hexIds.map((id) => {
    const hex = view.board.hexes[id]!;
    return terrainLabels[hex.terrain] + (hex.number === null ? "" : " " + hex.number);
  }).join(", ");
}

function vertexLabel(view: GameView, vertexId: string, action: string): string {
  const vertex = view.board.vertices[vertexId]!;
  return action + " at corner " + vertex.x + ", " + vertex.y + " beside " + adjacentTiles(view, vertex.hexIds);
}

function edgeLabel(view: GameView, edgeId: string, action: string): string {
  const edge = view.board.edges[edgeId]!;
  const [a, b] = edge.vertexIds.map((id) => view.board.vertices[id]!);
  return action + " from corner " + a.x + ", " + a.y + " to " + b.x + ", " + b.y + " beside " + adjacentTiles(view, edge.hexIds);
}

function hexLabel(view: GameView, hexId: string): string {
  const hex = view.board.hexes[hexId]!;
  return "Move robber to " + terrainLabels[hex.terrain] + (hex.number === null ? "" : " " + hex.number) + " at hex " + hex.q + ", " + hex.r;
}

interface BoardTarget {
  id: string;
  label: string;
  command: MatchCommand;
}

function boardTargets(view: GameView, placement: Placement): BoardTarget[] {
  if (view.activePlayerId !== view.self.id) return [];
  if (view.phase === "robber-move") return view.legal.robberHexes.map((id) => ({ id, label: hexLabel(view, id), command: { type: "move-robber", hexId: id } }));
  const settlementIds = view.phase === "setup-settlement" ? view.legal.setupSettlementVertices : placement === "settlement" ? view.legal.settlementVertices : [];
  const roadIds = view.phase === "setup-road" ? view.legal.setupRoadEdges : view.phase === "road-building" || placement === "road" ? view.legal.roadEdges : [];
  const cityIds = placement === "city" ? view.legal.cityVertices : [];
  return [
    ...settlementIds.map((id) => ({ id, label: vertexLabel(view, id, "Place settlement"), command: { type: view.phase === "setup-settlement" ? "place-setup-settlement" as const : "build-settlement" as const, vertexId: id } })),
    ...roadIds.map((id) => ({ id, label: edgeLabel(view, id, "Place road"), command: { type: view.phase === "setup-road" ? "place-setup-road" as const : "build-road" as const, edgeId: id } })),
    ...cityIds.map((id) => ({ id, label: vertexLabel(view, id, "Build city"), command: { type: "build-city" as const, vertexId: id } })),
  ];
}

function keyboardClick(event: React.KeyboardEvent<SVGElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

type BoardPoint = { x: number; y: number };
type PortPlacement = { port: GameView["board"]["ports"][number]; a: BoardPoint; b: BoardPoint; ship: BoardPoint };
const boardImages = new Map<string, HTMLImageElement>();

function BoardCanvas({ view, size, ports }: { view: GameView; size: number; ports: PortPlacement[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const pending = new Set<HTMLImageElement>();
    let disposed = false;
    const image = (url: string, x: number, y: number, width: number, height: number) => {
      let asset = boardImages.get(url);
      if (!asset) {
        asset = new Image();
        asset.src = url;
        boardImages.set(url, asset);
      }
      if (asset.complete && asset.naturalWidth) context.drawImage(asset, x, y, width, height);
      else if (!asset.complete && !pending.has(asset)) {
        asset.addEventListener("load", draw, { once: true });
        pending.add(asset);
      }
    };
    const polygon = (x: number, y: number, radius: number) => {
      context.beginPath();
      for (let corner = 0; corner < 6; corner++) {
        const angle = (corner * 60 - 90) * Math.PI / 180;
        const px = x + radius * Math.cos(angle);
        const py = y + radius * Math.sin(angle);
        if (corner === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
    };
    function draw() {
      if (disposed || !canvas || !context) return;
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#09639e";
      context.fillRect(0, 0, bounds.width, bounds.height);
      const scale = Math.min(bounds.width / 900, bounds.height / 690);
      context.translate((bounds.width - 900 * scale) / 2, (bounds.height - 690 * scale) / 2);
      context.scale(scale, scale);

      const hexes = Object.values(view.board.hexes);
      context.save();
      context.shadowColor = "#064a6b99";
      context.shadowBlur = 13;
      context.shadowOffsetY = 9;
      for (const [color, strokeWidth] of [["#0d78ad", 48], ["#78c7e2", 38], ["#f3f5d9", 29], ["#e2c27a", 21]] as const) {
        context.fillStyle = "#dfbc70";
        context.strokeStyle = color;
        context.lineWidth = strokeWidth;
        context.lineJoin = "round";
        for (const hex of hexes) {
          const center = atHex(hex.q, hex.r, size);
          polygon(center.x, center.y, size);
          context.fill();
          context.stroke();
        }
        context.shadowColor = "transparent";
      }
      context.restore();

      for (const { a, b, ship } of ports) {
        for (const from of [a, b]) {
          const to = pierEnd(from, ship);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.lineWidth = 11;
          context.strokeStyle = "#80511c";
          context.stroke();
          context.setLineDash([6, 2]);
          context.lineWidth = 8;
          context.strokeStyle = "#dca13a";
          context.stroke();
          context.setLineDash([]);
        }
      }
      const tileWidth = Math.sqrt(3) * size;
      for (const hex of hexes) {
        const center = atHex(hex.q, hex.r, size);
        image(terrainAsset(hex.terrain), center.x - tileWidth / 2, center.y - size, tileWidth, size * 2);
        if (hex.number !== null) image(numberTokenAsset(hex.number), center.x - 22, center.y + 4, 44, 44);
        if (view.robberHexId === hex.id) image(baseAsset("icon-robber"), center.x + 18, center.y - 53, 39, 39);
      }
      for (const { port, ship } of ports) image(portAsset(port.resource), ship.x - 31, ship.y - 31, 62, 62);
    }
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    draw();
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      for (const asset of pending) asset.removeEventListener("load", draw);
    };
  }, [view.board, view.robberHexId, size, ports]);

  return <canvas ref={canvasRef} className="match-board-canvas" aria-hidden="true" />;
}

function GameBoard({ view, placement, selectedVertex, roadAnchor, onSelectVertex, onRoadAnchor, onCommand, busy }: {
  view: GameView;
  placement: Placement;
  selectedVertex: SelectedVertex;
  roadAnchor: string | null;
  onSelectVertex: (selected: SelectedVertex) => void;
  onRoadAnchor: (vertexId: string) => void;
  onCommand: (command: MatchCommand) => void;
  busy: boolean;
}) {
  const size = Object.keys(view.board.hexes).length > 19 ? 43 : BOARD_HEX_SIZE;
  const tileWidth = Math.sqrt(3) * size;
  const active = view.activePlayerId === view.self.id;
  const settlementIds = active
    ? view.phase === "setup-settlement"
      ? view.legal.setupSettlementVertices
      : placement === "settlement" ? view.legal.settlementVertices : []
    : [];
  const allRoadIds = active
    ? view.phase === "setup-road"
      ? view.legal.setupRoadEdges
      : view.phase === "road-building" || placement === "road"
        ? view.legal.roadEdges : []
    : [];
  const roadIds = roadAnchor
    ? allRoadIds.filter((edgeId) => view.board.edges[edgeId]?.vertexIds.includes(roadAnchor))
    : view.phase === "setup-road" ? [] : allRoadIds;
  const clickableHouses = active && (view.phase === "setup-road" || view.phase === "road-building" || placement === "road")
    ? Object.entries(view.buildings).filter(([vertexId, building]) => building.ownerId === view.self.id &&
      allRoadIds.some((edgeId) => view.board.edges[edgeId]?.vertexIds.includes(vertexId)))
    : [];
  const cityIds = active && placement === "city" ? view.legal.cityVertices : [];
  const robberIds = active ? view.legal.robberHexes : [];
  const playerColor = new Map(view.players.map((player) => [player.id, palette[player.color] ?? player.color]));
  const playerPiece = new Map(view.players.map((player) => [player.id, player.color]));
  const hexes = Object.values(view.board.hexes);
  const vertices = view.board.vertices;
  const edges = view.board.edges;
  const portPlacements = useMemo(() => view.board.ports.map((port) => {
    const [a, b] = port.vertexIds.map((id) => atVertex(vertices[id]!.x, vertices[id]!.y, size));
    const slot = PORT_SLOTS.find((candidate) => view.board.hexes[candidate.hexId]?.edgeIds[candidate.edge] === port.edgeId);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = midpoint.x - BOARD_ORIGIN.x;
    const dy = midpoint.y - BOARD_ORIGIN.y;
    const length = Math.hypot(dx, dy) || 1;
    const ship = slot
      ? { x: BOARD_ORIGIN.x + slot.u * tileWidth, y: BOARD_ORIGIN.y + slot.v * size * 1.5 }
      : { x: midpoint.x + dx / length * size, y: midpoint.y + dy / length * size };
    return { port, a, b, ship };
  }), [view.board, size, tileWidth]);
  const hexAction = (id: string) => onCommand({ type: "move-robber", hexId: id });
  return (
    <div className="match-board-layers" role="group" aria-label="Playable island board">
      <BoardCanvas view={view} size={size} ports={portPlacements} />
      <svg className="match-board-svg" viewBox="0 0 900 690" aria-label="Board placement controls">
      {hexes.filter((hex) => robberIds.includes(hex.id)).map((hex) => {
        const point = atHex(hex.q, hex.r, size);
        return <g key={hex.id} className="match-legal-hex" role="button" tabIndex={0} aria-label={hexLabel(view, hex.id)}
          onClick={() => !busy && hexAction(hex.id)}
          onKeyDown={(event) => keyboardClick(event, () => !busy && hexAction(hex.id))}>
          <polygon points={polygonPoints(point.x, point.y, size - 8)} fill="#ffe1a2" opacity=".18" stroke="#fff6da" strokeWidth="3" strokeDasharray="7 5" />
        </g>;
      })}
      {Object.entries(view.roads).map(([edgeId, ownerId]) => {
        const [aId, bId] = edges[edgeId]!.vertexIds;
        const a = atVertex(vertices[aId]!.x, vertices[aId]!.y, size);
        const b = atVertex(vertices[bId]!.x, vertices[bId]!.y, size);
        const length = Math.hypot(b.x - a.x, b.y - a.y) + 5;
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI - 90;
        return (
          <g key={edgeId}>
            <image href={pieceAsset("road", playerPiece.get(ownerId) ?? "sky")} x="-7" y={-length / 2} width="14" height={length} preserveAspectRatio="none" transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${angle})`} />
          </g>
        );
      })}
      {roadIds.map((edgeId) => {
        const [aId, bId] = edges[edgeId]!.vertexIds;
        const a = atVertex(vertices[aId]!.x, vertices[aId]!.y, size);
        const b = atVertex(vertices[bId]!.x, vertices[bId]!.y, size);
        const action = () => onCommand({ type: view.phase === "setup-road" ? "place-setup-road" : "build-road", edgeId });
        return (
          <g key={edgeId} className="match-legal-road" role="button" tabIndex={0} aria-label={edgeLabel(view, edgeId, "Place road")} onClick={() => !busy && action()} onKeyDown={(event) => keyboardClick(event, () => !busy && action())}>
            <line className="match-road-glow" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffd447" strokeWidth="13" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff6cb" strokeWidth="5" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="28" />
          </g>
        );
      })}
      {Object.entries(view.buildings).map(([vertexId, building]) => {
        const vertex = vertices[vertexId]!;
        const point = atVertex(vertex.x, vertex.y, size);
        const color = playerColor.get(building.ownerId) ?? "#fff";
        return (
          <g key={vertexId} transform={`translate(${point.x} ${point.y})`} className="match-building">
            {building.level === "city" ? (
              <>
                <path d="M-20 13V-4L-9-13L2-4V13ZM1 13V-13L11-21L21-13V13Z" fill={color} stroke="#fff1d2" strokeWidth="3" strokeLinejoin="round" />
                <rect x="8" y="-5" width="6" height="8" fill="#fff1d2" opacity=".8" />
              </>
            ) : (
              <image href={pieceAsset("settlement", playerPiece.get(building.ownerId) ?? "sky")} x="-17" y="-20" width="34" height="40" />
            )}
          </g>
        );
      })}
      {clickableHouses.map(([vertexId]) => {
        const vertex = vertices[vertexId]!;
        const point = atVertex(vertex.x, vertex.y, size);
        const chosen = roadAnchor === vertexId;
        return <g key={`${vertexId}:road-anchor`} className="match-road-anchor" role="button" tabIndex={0}
          aria-label={vertexLabel(view, vertexId, "Choose roads from your house")}
          onClick={() => !busy && onRoadAnchor(vertexId)}
          onKeyDown={(event) => keyboardClick(event, () => !busy && onRoadAnchor(vertexId))}>
          <circle cx={point.x} cy={point.y} r={chosen ? 25 : 20} fill="transparent" stroke={chosen ? "#fff4b5" : "#ffdf57"} strokeWidth={chosen ? 5 : 3} />
          <circle cx={point.x} cy={point.y} r="28" fill="transparent" />
          {chosen && <g transform={`translate(${point.x - 29} ${point.y - 103})`}>
            <rect width="62" height="67" rx="8" fill="#75d1e7" stroke="#fff9de" strokeWidth="3" />
            <image href={pieceAsset("road", playerPiece.get(view.self.id) ?? "sky")} x="24" y="10" width="13" height="45" />
            <text x="52" y="17" textAnchor="middle" fontSize="10" fontWeight="900" fill="#163e5d">{Math.max(0, 15 - Object.values(view.roads).filter((ownerId) => ownerId === view.self.id).length)}</text>
          </g>}
        </g>;
      })}
      {[...settlementIds, ...cityIds].map((vertexId) => {
        const vertex = vertices[vertexId]!;
        const point = atVertex(vertex.x, vertex.y, size);
        const city = cityIds.includes(vertexId);
        const action = () => onCommand(city
          ? { type: "build-city", vertexId }
          : { type: view.phase === "setup-settlement" ? "place-setup-settlement" : "build-settlement", vertexId });
        const selected = selectedVertex?.id === vertexId && selectedVertex.city === city;
        const popX = point.x > 700 ? point.x - 151 : point.x + 19;
        const popY = point.y > 570 ? point.y - 72 : point.y - 48;
        return (
          <g key={vertexId} className="match-legal-vertex">
            <g role="button" tabIndex={0} aria-label={vertexLabel(view, vertexId, city ? "Select city location" : "Select settlement location")} onClick={() => !busy && onSelectVertex({ id: vertexId, city })} onKeyDown={(event) => keyboardClick(event, () => !busy && onSelectVertex({ id: vertexId, city }))}>
              <circle cx={point.x} cy={point.y} r={selected ? 12 : 10} fill="#fff7da" stroke={selected ? "#f6a13c" : "#d48637"} strokeWidth="3" />
              <circle cx={point.x} cy={point.y} r="3" fill="#b66f26" />
              <circle cx={point.x} cy={point.y} r="19" fill="transparent" />
            </g>
            {selected && <g className="match-place-popup" transform={`translate(${popX} ${popY})`} role="button" tabIndex={0} aria-label={city ? "Confirm city placement" : "Confirm settlement placement"} onClick={() => !busy && action()} onKeyDown={(event) => keyboardClick(event, () => !busy && action())}>
              <rect width="132" height="57" rx="9" fill="#fff6df" stroke="#214864" strokeWidth="2" />
              {city ? <path d="M9 43V20L20 10L31 20V43ZM31 43V15L43 5L55 15V43Z" fill={palette[view.players.find((player) => player.id === view.self.id)?.color ?? "sky"]} stroke="#163d59" strokeWidth="2" /> : <image href={pieceAsset("settlement", view.players.find((player) => player.id === view.self.id)?.color ?? "sky")} x="9" y="6" width="43" height="45" />}
              <text x="57" y="23" fill="#20445f" fontSize="12" fontWeight="800">{city ? "Build city" : "Place house"}</text>
              <text x="57" y="41" fill="#577184" fontSize="10">Click to confirm</text>
            </g>}
          </g>
        );
      })}
      </svg>
    </div>
  );
}

function ResourceBadge({ resource, count, compact = false }: { resource: Resource; count: number; compact?: boolean }) {
  const info = resources[resource];
  return <span className={`match-resource-badge ${compact ? "compact" : ""}`}>
    <img src={resourceCardAsset(resource)} alt={`${info.label} resource card`} />
    <strong>{count}</strong>
  </span>;
}

function CostPreview({ cost }: { cost: ResourceCounts }) {
  return <span className="match-piece-cost">{RESOURCES.filter((resource) => cost[resource] > 0).map((resource) => <span key={resource}><img src={resourceCardAsset(resource)} alt={resources[resource].label} />{cost[resource] > 1 && <b>{cost[resource]}</b>}</span>)}</span>;
}

function CityIcon({ color }: { color: string }) {
  return <svg className="match-city-piece" viewBox="0 0 56 46" aria-hidden="true">
    <path d="M4 42V19L17 8L30 19V42Z" fill={color} stroke="#153d60" strokeWidth="3" strokeLinejoin="round" />
    <path d="M25 42V14L39 3L53 14V42Z" fill={color} stroke="#153d60" strokeWidth="3" strokeLinejoin="round" />
    <path d="M32 42V29H43V42" fill="#fff0a8" stroke="#153d60" strokeWidth="2" />
    <path d="M8 24L17 16L26 24M29 19L39 11L49 19" fill="none" stroke="#f5d18c" strokeWidth="2" />
  </svg>;
}

function DieFace({ value }: { value: number }) {
  const marks: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className="match-die-face" aria-label={`${value} on a die`}>{marks[value]?.map((position) => <i key={position} style={{ gridColumn: position % 3 + 1, gridRow: Math.floor(position / 3) + 1 }} />)}</span>;
}

function CountPicker({ title, counts, onChange, maxFor }: {
  title: string;
  counts: ResourceCounts;
  onChange: (resource: Resource, amount: number) => void;
  maxFor: (resource: Resource) => number;
}) {
  return (
    <div className="match-count-picker">
      <strong>{title}</strong>
      <div>
        {RESOURCES.map((resource) => (
          <label key={resource}>
            <img className="match-picker-card" src={resourceCardAsset(resource)} alt="" />
            <span>{resources[resource].label}</span>
            <button type="button" aria-label={`Remove ${resources[resource].label}`} disabled={counts[resource] === 0} onClick={() => onChange(resource, counts[resource] - 1)}><Minus size={13} /></button>
            <b>{counts[resource]}</b>
            <button type="button" aria-label={`Add ${resources[resource].label}`} disabled={counts[resource] >= maxFor(resource)} onClick={() => onChange(resource, counts[resource] + 1)}><Plus size={13} /></button>
          </label>
        ))}
      </div>
    </div>
  );
}

function bankRatio(view: GameView, give: Resource): number {
  let ratio = 4;
  for (const port of view.board.ports) {
    if (!port.vertexIds.some((vertexId) => view.buildings[vertexId]?.ownerId === view.self.id)) continue;
    if (port.resource === give) ratio = 2;
    else if (port.resource === null) ratio = Math.min(ratio, 3);
  }
  return ratio;
}

function TradeCardRow({ label, counts, maxFor, onChange }: { label: string; counts: ResourceCounts; maxFor: (resource: Resource) => number; onChange: (resource: Resource, value: number) => void }) {
  return <div className="match-trade-card-row"><div className="match-trade-row-caption"><span>{label === "YOU GIVE" ? "↓" : "↑"}</span><strong>{label}</strong></div><div className="match-trade-card-list">{RESOURCES.map((resource) => <div className={`match-trade-card ${counts[resource] ? "picked" : ""}`} key={resource}>
    <img src={resourceCardAsset(resource)} alt={`${resources[resource].label} card`} />
    <button type="button" className="match-trade-card-add" aria-label={`Add ${resources[resource].label} to ${label}`} disabled={counts[resource] >= maxFor(resource)} onClick={() => onChange(resource, counts[resource] + 1)}>+</button>
    {counts[resource] > 0 && <><b>{counts[resource]}</b><button type="button" className="match-trade-card-remove" aria-label={`Remove ${resources[resource].label} from ${label}`} onClick={() => onChange(resource, counts[resource] - 1)}>−</button></>}
  </div>)}</div></div>;
}

function TradePanel({ view, onCommand, onClose, busy, initialTab }: { view: GameView; onCommand: (command: MatchCommand) => void; onClose: () => void; busy: boolean; initialTab: TradeTab }) {
  const [tab, setTab] = useState<TradeTab>(initialTab);
  const [give, setGive] = useState<Resource>("wood");
  const [receive, setReceive] = useState<Resource>("brick");
  const [friendId, setFriendId] = useState(view.players.find((player) => player.id !== view.self.id)?.id ?? "");
  const [offerGive, setOfferGive] = useState<ResourceCounts>(emptyCounts);
  const [offerWant, setOfferWant] = useState<ResourceCounts>(emptyCounts);
  const availableGive = view.legal.bankTradeGive;
  const actualGive = availableGive.includes(give) ? give : availableGive[0];
  const receiveOptions = RESOURCES.filter((resource) => resource !== actualGive && view.bank[resource] > 0);
  const actualReceive = receiveOptions.includes(receive) ? receive : receiveOptions[0];
  const setCount = (which: "give" | "want", resource: Resource, value: number) => {
    const setter = which === "give" ? setOfferGive : setOfferWant;
    setter((current) => ({ ...current, [resource]: value }));
  };
  const stock = <div className="match-trade-stock" aria-label="Your resource cards">{RESOURCES.map((resource) => <div key={resource} className={view.self.resources[resource] ? "owned" : ""}><img src={resourceCardAsset(resource)} alt={resources[resource].label} /><b>{view.self.resources[resource]}</b></div>)}</div>;
  const canSend = view.legal.canOfferTrade && Boolean(friendId) && sumCounts(offerGive) > 0 && sumCounts(offerWant) > 0 && RESOURCES.every((resource) => offerGive[resource] <= view.self.resources[resource]) && !busy;
  return (
    <section className="match-trade-dock" role="dialog" aria-label="Trade resources">
      <header><strong>TRADE {tab === "friend" ? "WITH FRIENDS" : "WITH BANK & PORTS"}</strong><button type="button" aria-label="Close trade" onClick={onClose}><X size={17} /></button></header>
      <div className="match-trade-workspace"><div className="match-trade-main">{stock}
      {tab === "bank" ? (
        <><div className="match-trade-card-row"><div className="match-trade-row-caption"><span>↓</span><strong>GIVE {actualGive ? bankRatio(view, actualGive) : 4} MATCHING</strong></div><div className="match-trade-card-list">{RESOURCES.map((resource) => <button key={resource} type="button" className={`match-bank-pick ${actualGive === resource ? "selected" : ""} ${availableGive.includes(resource) ? "available" : ""}`} disabled={!availableGive.includes(resource)} onClick={() => setGive(resource)}><img src={resourceCardAsset(resource)} alt={resources[resource].label} /><span>{bankRatio(view, resource)}:1</span></button>)}</div></div>
          <div className="match-trade-card-row"><div className="match-trade-row-caption"><span>↑</span><strong>RECEIVE ONE</strong></div><div className="match-trade-card-list">{RESOURCES.map((resource) => <button key={resource} type="button" className={`match-bank-pick ${actualReceive === resource ? "selected" : ""}`} disabled={resource === actualGive || !view.bank[resource]} onClick={() => setReceive(resource)}><img src={resourceCardAsset(resource)} alt={resources[resource].label} /><span>{view.bank[resource]} left</span></button>)}</div></div></>
      ) : (
        <><div className="match-trade-players"><span>OFFER TO</span>{view.players.filter((player) => player.id !== view.self.id).map((player) => <button key={player.id} type="button" className={friendId === player.id ? "selected" : ""} onClick={() => setFriendId(player.id)}>{player.name}</button>)}</div>
          <TradeCardRow label="YOU GIVE" counts={offerGive} onChange={(resource, amount) => setCount("give", resource, amount)} maxFor={(resource) => view.self.resources[resource]} />
          <TradeCardRow label="YOU WANT" counts={offerWant} onChange={(resource, amount) => setCount("want", resource, amount)} maxFor={() => 19} />
        </>
      )}</div><div className="match-trade-rail">
        {tab === "friend" ? <button type="button" className="match-trade-rail-primary" disabled={!canSend} onClick={() => onCommand({ type: "offer-trade", toPlayerId: friendId, give: offerGive, want: offerWant })}><Check size={22} />SEND OFFER</button>
          : <button type="button" className="match-trade-rail-primary" disabled={!actualGive || !actualReceive || busy} onClick={() => onCommand({ type: "bank-trade", give: actualGive!, receive: actualReceive! })}><Check size={22} />TRADE BANK</button>}
        <button type="button" className={tab === "bank" ? "selected" : ""} onClick={() => setTab(tab === "bank" ? "friend" : "bank")}><ArrowLeftRight size={22} />{tab === "bank" ? "FRIENDS" : "BANK"}</button>
        <button type="button" onClick={onClose}><X size={24} />CLOSE</button>
      </div></div>
    </section>
  );
}

function DevelopmentPanel({ view, onCommand, busy }: { view: GameView; onCommand: (command: MatchCommand) => void; busy: boolean }) {
  const [selection, setSelection] = useState<{ cardId: string; type: "year-of-plenty" | "monopoly" } | null>(null);
  const [first, setFirst] = useState<Resource>("wood");
  const [second, setSecond] = useState<Resource>("brick");
  const [single, setSingle] = useState<Resource>("wood");
  const playable = new Set(view.legal.playableDevelopmentCardIds);
  function play(card: DevelopmentCard) {
    if (card.type === "knight") onCommand({ type: "play-knight", cardId: card.id });
    if (card.type === "road-building") onCommand({ type: "play-road-building", cardId: card.id });
    if (card.type === "year-of-plenty" || card.type === "monopoly") setSelection({ cardId: card.id, type: card.type });
  }
  const validPlenty = view.bank[first] > 0 && view.bank[second] > (first === second ? 1 : 0);
  return (
    <div className="match-panel-body">
      <p>Buy a card for 1 wool, 1 grain, and 1 ore. Action cards can be played on a later turn.</p>
      <button className="match-primary-action" type="button" disabled={!view.legal.canBuyDevelopment || busy} onClick={() => onCommand({ type: "buy-development" })}>Buy development card</button>
      <div className="match-dev-list">
        {view.self.developmentCards.length ? view.self.developmentCards.map((card) => (
          <div className="match-dev-card" key={card.id}>
            <img src={developmentCardAsset(card.type)} alt="" />
            <div><strong>{developmentLabels[card.type]}</strong><small>{card.type === "victory-point" ? "Hidden point" : playable.has(card.id) ? "Ready to play" : "Available next turn"}</small></div>
            {card.type !== "victory-point" && <button type="button" disabled={!playable.has(card.id) || busy} onClick={() => play(card)}>Play</button>}
          </div>
        )) : <p className="match-muted">No development cards in your hand.</p>}
      </div>
      {selection && (
        <div className="match-choice-box">
          <strong>{developmentLabels[selection.type]}</strong>
          {selection.type === "year-of-plenty" ? (
            <div className="match-select-row">
              <label>First card<select value={first} onChange={(event) => setFirst(event.target.value as Resource)}>{RESOURCES.map((resource) => <option key={resource} value={resource}>{resources[resource].label} · {view.bank[resource]} left</option>)}</select></label>
              <label>Second card<select value={second} onChange={(event) => setSecond(event.target.value as Resource)}>{RESOURCES.map((resource) => <option key={resource} value={resource}>{resources[resource].label} · {view.bank[resource]} left</option>)}</select></label>
            </div>
          ) : (
            <label className="match-friend-select">Collect from everyone<select value={single} onChange={(event) => setSingle(event.target.value as Resource)}>{RESOURCES.map((resource) => <option key={resource} value={resource}>{resources[resource].label}</option>)}</select></label>
          )}
          <div className="match-inline-actions">
            <button type="button" onClick={() => setSelection(null)}>Cancel</button>
            <button className="match-primary-action" type="button" disabled={busy || !playable.has(selection.cardId) || (selection.type === "year-of-plenty" && !validPlenty)} onClick={() => {
              onCommand(selection.type === "year-of-plenty"
                ? { type: "play-year-of-plenty", cardId: selection.cardId, resources: [first, second] }
                : { type: "play-monopoly", cardId: selection.cardId, resource: single });
              setSelection(null);
            }}>Play card</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscardPanel({ view, onCommand, busy }: { view: GameView; onCommand: (command: MatchCommand) => void; busy: boolean }) {
  const [counts, setCounts] = useState<ResourceCounts>(emptyCounts);
  const required = view.legal.discardCount;
  useEffect(() => setCounts(emptyCounts()), [required]);
  if (!required) return <div className="match-phase-card"><Shield size={24} /><span>Waiting for other players to discard their cards.</span></div>;
  return (
    <div className="match-phase-card match-discard-card">
      <strong>A 7 was rolled. Discard {required} cards.</strong>
      <span>Choose exactly {required} cards from your hand before the robber moves.</span>
      <CountPicker title={`Selected ${sumCounts(counts)} / ${required}`} counts={counts} onChange={(resource, amount) => setCounts((current) => ({ ...current, [resource]: amount }))} maxFor={(resource) => view.self.resources[resource]} />
      <button className="match-primary-action" type="button" disabled={sumCounts(counts) !== required || busy} onClick={() => onCommand({ type: "discard", resources: counts })}>Discard cards</button>
    </div>
  );
}

function PendingTrade({ view, onCommand, busy }: { view: GameView; onCommand: (command: MatchCommand) => void; busy: boolean }) {
  const trade = view.visibleTrade;
  if (!view.tradePending) return null;
  if (!trade) return <div className="match-trade-banner"><ShoppingBasket size={18} /> A friend is deciding on a trade offer.</div>;
  const from = view.players.find((player) => player.id === trade.fromPlayerId)?.name ?? "Friend";
  const to = view.players.find((player) => player.id === trade.toPlayerId)?.name ?? "Friend";
  const offered = RESOURCES.filter((resource) => trade.give[resource]).map((resource) => `${trade.give[resource]} ${resources[resource].label}`).join(", ");
  const wanted = RESOURCES.filter((resource) => trade.want[resource]).map((resource) => `${trade.want[resource]} ${resources[resource].label}`).join(", ");
  const recipient = view.self.id === trade.toPlayerId;
  const offeredCounts = recipient ? trade.give : trade.want;
  const payingCounts = recipient ? trade.want : trade.give;
  return (
    <div className="match-trade-banner match-trade-offer">
      <div className="match-trade-offer-heading"><ShoppingBasket size={20} /><strong>{recipient ? `${from} sent you an offer` : `Waiting for ${to}`}</strong></div>
      <p>{from} offers {offered} for {wanted}.</p>
      <div className="match-trade-offer-cards"><span>{recipient ? "YOU RECEIVE" : "YOU WANT"}</span>{RESOURCES.filter((resource) => offeredCounts[resource]).map((resource) => <ResourceBadge key={resource} resource={resource} count={offeredCounts[resource]} compact />)}</div>
      <div className="match-trade-offer-cards"><span>YOU GIVE</span>{RESOURCES.filter((resource) => payingCounts[resource]).map((resource) => <ResourceBadge key={resource} resource={resource} count={payingCounts[resource]} compact />)}</div>
      <div className="match-trade-offer-actions">
        {recipient ? (
          <>
            <button type="button" onClick={() => onCommand({ type: "reject-trade", tradeId: trade.id })} disabled={!view.legal.canRejectTrade || busy}>Decline</button>
            <button className="accept" type="button" onClick={() => onCommand({ type: "accept-trade", tradeId: trade.id })} disabled={!view.legal.canAcceptTrade || busy}>Accept</button>
          </>
        ) : (
          <button type="button" onClick={() => onCommand({ type: "cancel-trade", tradeId: trade.id })} disabled={!view.legal.canCancelTrade || busy}>Cancel offer</button>
        )}
      </div>
    </div>
  );
}

function phaseMessage(view: GameView, placement: Placement) {
  if (view.winnerId) return `${view.players.find((player) => player.id === view.winnerId)?.name ?? "A player"} won the match!`;
  if (view.tradePending) return "Resolve the pending trade before continuing.";
  if (view.legal.discardCount) return `Select ${view.legal.discardCount} cards to discard.`;
  if (view.phase === "discard") return "Waiting for friends to discard their cards.";
  const active = view.players.find((player) => player.id === view.activePlayerId)?.name ?? "A friend";
  if (view.legal.canRequestSpecialBuild) return view.legal.specialBuildRequested
    ? `Waiting for ${active}. Your Special Build is reserved for the end of this turn.`
    : `Waiting for ${active}. You can request a Special Build after this turn.`;
  if (view.activePlayerId !== view.self.id) return `Waiting for ${active} to ${phaseLabels[view.phase].toLowerCase()}.`;
  if (view.phase === "setup-road") return "Click the house you just placed, then choose a glowing road.";
  if (placement) return `Choose a highlighted ${placement === "road" ? "edge" : "corner"} on the island.`;
  if (view.phase === "robber-move") return "Choose a highlighted tile for the robber.";
  if (view.phase === "road-building") return "Place your free road on a highlighted edge.";
  if (view.phase === "setup-settlement") return "Choose a highlighted corner, then confirm your house.";
  if (view.phase === "robber-steal") return "Choose a friend to take one random resource from.";
  if (view.phase === "pre-roll") return "Roll the dice to start your turn.";
  if (view.phase === "special-build") return "Build with the cards you have, then pass. Trading and development card play are unavailable.";
  return "Make your move, then end your turn.";
}

function actionMessage(view: GameView, action: GameView["recentActions"][number]): string {
  const name = view.players.find((player) => player.id === action.actorId)?.name ?? "A player";
  const labels: Partial<Record<typeof action.type, string>> = {
    "place-setup-settlement": "placed a settlement",
    "place-setup-road": "placed a road",
    "discard": "discarded cards",
    "move-robber": "moved the robber",
    "choose-robber-victim": "stole a card",
    "build-road": "built a road",
    "build-settlement": "built a settlement",
    "build-city": "upgraded a house",
    "buy-development": "bought a development card",
    "play-knight": "played a Knight",
    "play-road-building": "played Road Building",
    "play-year-of-plenty": "played Year of Plenty",
    "play-monopoly": "played Monopoly",
    "bank-trade": "traded with the bank",
    "offer-trade": "offered a trade",
    "accept-trade": "accepted a trade",
    "reject-trade": "declined a trade",
    "cancel-trade": "canceled a trade",
    "end-turn": "ended the turn",
    "request-special-build": "changed a Special Build request",
    "pass-special-build": "finished a Special Build",
    "turn-expired": "ran out of time",
  };
  const label = action.type === "roll" && action.rollTotal
    ? `rolled ${action.rollTotal}`
    : labels[action.type] ?? action.type.replaceAll("-", " ");
  return `${name} ${label}.`;
}

function MatchHistory({ view }: { view: GameView }) {
  return <div className="match-history match-sidebar-section">
    <h2>MATCH HISTORY</h2>
    <div className="match-history-scroll">
      {[...view.recentActions].reverse().map((action) => {
        const player = view.players.find((candidate) => candidate.id === action.actorId);
        const name = player?.name ?? "A player";
        const sentence = actionMessage(view, action).slice(name.length).trim();
        return <div className="match-history-group" key={action.number}>
          <div className="match-history-entry"><span className="match-history-person">♙</span><div><strong>{name}</strong> {sentence}
            {action.type === "roll" && action.rollDice && <span className="match-history-dice"><DieFace value={action.rollDice[0]} /><DieFace value={action.rollDice[1]} /></span>}
            {action.bankTrade && <span className="match-history-exchange"><b>{action.bankTrade.ratio}×</b><img src={resourceCardAsset(action.bankTrade.give)} alt={resources[action.bankTrade.give].label} /><span>→</span><img src={resourceCardAsset(action.bankTrade.receive)} alt={resources[action.bankTrade.receive].label} /></span>}
            {(["build-road", "place-setup-road"].includes(action.type)) && <img className="match-history-piece road" src={pieceAsset("road", player?.color ?? "sky")} alt="road" />}
            {(["build-settlement", "place-setup-settlement"].includes(action.type)) && <img className="match-history-piece" src={pieceAsset("settlement", player?.color ?? "sky")} alt="house" />}
            {action.type === "build-city" && <span className="match-history-city"><CityIcon color={palette[player?.color ?? "sky"] ?? "#f5b62e"} /></span>}
          </div></div>
          {action.production && Object.entries(action.production).map(([playerId, counts]) => <div className="match-history-entry receipt" key={playerId}>
            <span className="match-history-person">♙</span><div><strong>{view.players.find((candidate) => candidate.id === playerId)?.name ?? "A player"}</strong> received
              <span className="match-history-cards">{RESOURCES.filter((resource) => counts[resource] > 0).map((resource) => <span key={resource}><img src={resourceCardAsset(resource)} alt={resources[resource].label} /><b>{counts[resource]}</b></span>)}</span>
            </div>
          </div>)}
        </div>;
      })}
    </div>
  </div>;
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="match-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="match-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X size={22} /></button></header>
        {children}
      </section>
    </div>
  );
}

export default function MatchView({ room, identity, onBack, onCopy, onChat }: {
  room: RoomView;
  identity: LocalIdentity;
  onBack: () => void;
  onCopy: () => void;
  onChat: (message: string) => Promise<boolean>;
}) {
  const client = useMemo(() => createMatchClient(room, identity.id), [room.code, room.gameId, identity.id]);
  const [view, setView] = useState<GameView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<Placement>(null);
  const [selectedVertex, setSelectedVertex] = useState<SelectedVertex>(null);
  const [roadAnchor, setRoadAnchor] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [tradeInitialTab, setTradeInitialTab] = useState<TradeTab>("friend");
  const [rolling, setRolling] = useState(false);
  const [flights, setFlights] = useState<Array<{ id: string; resource: Resource; count: number; x: number; y: number; dx: number; dy: number; delay: number }>>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [soundOn, setSoundOn] = useState(turnSoundEnabled);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiryInFlight = useRef(false);
  const lastExpiryAttempt = useRef(0);
  const seenActionNumber = useRef<number | null>(null);
  const announcedTurn = useRef<string | null>(null);
  const flightTimeout = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!view?.turnDeadlineAt || view.phase === "completed" || busy || expiryInFlight.current ||
      nowMs < Date.parse(view.turnDeadlineAt) || nowMs - lastExpiryAttempt.current < 2500) return;
    expiryInFlight.current = true;
    lastExpiryAttempt.current = nowMs;
    void client.command({ type: "expire-turn" })
      .then(setView)
      .catch(() => client.load().then(setView).catch(() => undefined))
      .finally(() => { expiryInFlight.current = false; });
  }, [client, view, nowMs, busy]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => void client.load().then((next) => {
      if (mounted) { setView(next); setLoadError(""); }
    }).catch((error: unknown) => {
      if (mounted) setLoadError(error instanceof Error ? error.message : "Could not load this match.");
    });
    refresh();
    const unsubscribe = client.subscribe(refresh, setConnectionStatus);
    return () => { mounted = false; unsubscribe(); };
  }, [client]);

  useEffect(() => {
    setPlacement(null);
    setSelectedVertex(null);
    setRoadAnchor(null);
    setPanel(null);
  }, [view?.phase, view?.activePlayerId]);

  useEffect(() => {
    if (!view || view.activePlayerId !== view.self.id || view.phase === "completed") return;
    const key = `${room.gameId ?? room.code}:${view.turn}:${view.activePlayerId}`;
    if (announcedTurn.current === key) return;
    announcedTurn.current = key;
    const storageKey = `colonist-turn-announced:${room.code}`;
    if (window.sessionStorage.getItem(storageKey) === key) return;
    window.sessionStorage.setItem(storageKey, key);
    if (soundOn) playTurnSound();
  }, [view?.activePlayerId, view?.turn, view?.phase, room.code, room.gameId, soundOn]);

  useEffect(() => {
    if (!view) return;
    const latest = view.recentActions.at(-1)?.number ?? 0;
    if (seenActionNumber.current === null) { seenActionNumber.current = latest; return; }
    const freshRolls = view.recentActions.filter((action) => action.number > seenActionNumber.current! && action.type === "roll");
    seenActionNumber.current = Math.max(seenActionNumber.current, latest);
    const cards = freshRolls.flatMap((action) => RESOURCES.filter((resource) => (action.production?.[view.self.id]?.[resource] ?? 0) > 0).map((resource, index) => ({ action, resource, index })));
    if (!cards.length) return;
    const hand = document.querySelector(".match-hand-cards")?.getBoundingClientRect();
    if (!hand) return;
    const next = cards.map(({ action, resource, index }, order) => {
      const bank = document.querySelector(`[data-bank-resource="${resource}"]`)?.getBoundingClientRect();
      const x = bank ? bank.left + bank.width / 2 - 18 : window.innerWidth - 310;
      const y = bank ? bank.top + bank.height / 2 - 25 : 230;
      return { id: `${action.number}-${resource}`, resource, count: action.production![view.self.id]![resource], x, y, dx: hand.left + Math.min(32 + order * 38, hand.width - 30) - x, dy: hand.top + 4 - y, delay: index * 90 + order * 110 };
    });
    setFlights(next);
    if (flightTimeout.current !== null) window.clearTimeout(flightTimeout.current);
    flightTimeout.current = window.setTimeout(() => setFlights([]), 1650);
  }, [view]);

  useEffect(() => () => { if (flightTimeout.current !== null) window.clearTimeout(flightTimeout.current); }, []);

  async function command(item: MatchCommand) {
    if (busy) return;
    setBusy(true);
    if (item.type === "roll") setRolling(true);
    setActionError("");
    try {
      const next = await client.command(item);
      setView(next);
      setPlacement(null);
      setSelectedVertex(null);
      setRoadAnchor(null);
      if (item.type !== "bank-trade" && item.type !== "buy-development") setPanel(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action could not be completed.");
      void client.load().then(setView).catch(() => undefined);
    } finally {
      setBusy(false);
      if (item.type === "roll") window.setTimeout(() => setRolling(false), 550);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    const sent = await onChat(text);
    if (sent) setChatDraft("");
    setChatBusy(false);
  }

  if (!view) return (
    <div className="match-screen match-loading">
      <header className="match-topbar"><button type="button" onClick={onBack}><ArrowLeft size={18} /> Rooms</button><strong>HARBOR TABLE</strong><span>Private match</span></header>
      <div className="match-loading-card"><span className="match-spinner" /><h1>{loadError ? "Match unavailable" : "Preparing your island"}</h1><p>{loadError || "Loading the board and your private hand…"}</p>{loadError && <button type="button" onClick={() => void client.load().then((next) => { setView(next); setLoadError(""); }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Still unavailable."))}>Try again</button>}</div>
    </div>
  );

  const active = view.players.find((player) => player.id === view.activePlayerId);
  const remainingSeconds = view.turnDeadlineAt
    ? Math.max(0, Math.ceil((Date.parse(view.turnDeadlineAt) - nowMs) / 1000)) : null;
  const timerText = remainingSeconds === null ? "" : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const myTurn = view.self.id === view.activePlayerId;
  const handSize = sumCounts(view.self.resources);
  const selfColor = view.players.find((player) => player.id === view.self.id)?.color ?? "sky";
  const roadReady = Boolean(view.legal.setupRoadEdges.length || view.legal.roadEdges.length);
  const houseReady = Boolean(view.legal.setupSettlementVertices.length || view.legal.settlementVertices.length);
  const cityReady = view.legal.cityVertices.length > 0;
  const knightCard = view.self.developmentCards.find((card) => card.type === "knight" && view.legal.playableDevelopmentCardIds.includes(card.id));
  const robberReady = view.phase === "robber-move" || Boolean(knightCard);
  const devReady = view.legal.canBuyDevelopment || view.legal.playableDevelopmentCardIds.length > 0;
  const roadCount = Object.values(view.roads).filter((ownerId) => ownerId === view.self.id).length;
  const houseCount = Object.values(view.buildings).filter((building) => building.ownerId === view.self.id && building.level === "settlement").length;
  const cityCount = Object.values(view.buildings).filter((building) => building.ownerId === view.self.id && building.level === "city").length;
  const targets = boardTargets(view, placement);
  const latestChat = room.chat.slice(-8);
  const dockPrompt = !myTurn ? `Waiting for ${active?.name ?? "a friend"}`
    : view.phase === "setup-settlement" ? "Place Settlement"
    : view.phase === "setup-road" || view.phase === "road-building" ? "Place Road"
    : view.phase === "pre-roll" ? "Roll Dice"
    : placement === "settlement" ? "Place Settlement"
    : placement === "road" ? "Place Road"
    : placement === "city" ? "Upgrade House"
    : view.phase === "action" ? "Build, Trade or End Turn"
    : phaseLabels[view.phase];
  return (
    <div className="match-screen">
      <header className="match-topbar">
        <button className="match-back" type="button" onClick={onBack}><ArrowLeft size={18} /> Rooms</button>
        <strong className="match-brand">HARBOR TABLE</strong>
        <span className="match-room-code">Room {room.code}</span>
        <span className="match-base">{view.players.length >= 5 ? "EXPANDED" : "BASE"} GAME · {view.victoryPointsToWin} POINTS</span>
        <button className="match-copy" type="button" title="Copy invite link" aria-label="Copy invite link" onClick={onCopy}><Copy size={17} /></button>
        <button className="match-sound-toggle" type="button" aria-label={soundOn ? "Mute turn sound" : "Enable turn sound"} title={soundOn ? "Turn sound on" : "Turn sound off"} onClick={() => { setTurnSoundEnabled(!soundOn); setSoundOn(!soundOn); }}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        <span className="match-turn-badge">TURN {view.turn || "SETUP"}</span>
        <span className={`match-connection ${connectionStatus}`}>{connectionStatus === "live" ? "Live" : connectionStatus === "reconnecting" ? "Reconnecting" : "Connecting"}</span>
      </header>

      <div className="match-main">
        <section className="match-board-area">
          <div className="match-phase-banner">
            <div><span className="match-phase-kicker">{isLocalPreview ? "LOCAL PREVIEW · " : ""}{view.phase === "completed" ? "GAME OVER" : myTurn ? "YOUR TURN" : `${active?.name.toUpperCase() ?? "FRIEND"}'S TURN`}</span><h1>{phaseLabels[view.phase]}</h1><p>{remainingSeconds === 0 ? "Time is up. Advancing the match…" : phaseMessage(view, placement)}</p></div>
          </div>
          {targets.length > 0 && <a className="match-skip-targets" href="#match-target-picker">Skip to legal positions</a>}
          <div className="match-board-wrap"><GameBoard view={view} placement={placement} selectedVertex={selectedVertex} roadAnchor={roadAnchor} onSelectVertex={setSelectedVertex} onRoadAnchor={setRoadAnchor} onCommand={(item) => void command(item)} busy={busy} /></div>
          {(view.legal.canRoll || rolling) && <button className={`match-sea-dice ${rolling ? "rolling" : "ready"}`} type="button" disabled={busy} aria-label="Roll two dice" onClick={() => void command({ type: "roll" })}><span className="match-sea-dice-faces"><DieFace value={3} /><DieFace value={5} /></span><strong>{rolling ? "Rolling…" : "Roll dice"}</strong></button>}
          {!view.legal.canRoll && !rolling && view.lastRoll && <div className="match-sea-dice result" aria-label={`Last roll ${view.lastRoll[0]} and ${view.lastRoll[1]}, total ${view.lastRoll[0] + view.lastRoll[1]}`}><span className="match-sea-dice-faces"><DieFace value={view.lastRoll[0]} /><DieFace value={view.lastRoll[1]} /></span><strong>Rolled {view.lastRoll[0] + view.lastRoll[1]}</strong></div>}
          {actionError && <div className="match-error" role="alert">{actionError}<button type="button" onClick={() => setActionError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          {busy && <div className="match-saving" role="status">Saving your move…</div>}
          <PendingTrade view={view} onCommand={(item) => void command(item)} busy={busy} />
          {panel === "trade" && <TradePanel view={view} initialTab={tradeInitialTab} onCommand={(item) => void command(item)} onClose={() => setPanel(null)} busy={busy} />}
          {view.phase === "discard" && <DiscardPanel view={view} onCommand={(item) => void command(item)} busy={busy} />}
          {view.phase === "robber-steal" && myTurn && <div className="match-phase-card"><strong>Take one random card from:</strong><div className="match-victim-list">{view.legal.robberVictimIds.map((id) => { const player = view.players.find((candidate) => candidate.id === id); return <button key={id} type="button" disabled={busy} onClick={() => void command({ type: "choose-robber-victim", victimId: id })}><span style={{ background: palette[player?.color ?? ""] ?? "#ddd" }}>{player?.name.charAt(0)}</span>{player?.name}</button>; })}</div></div>}
        </section>
        <aside className="match-sidebar">
          <div className="match-sidebar-section"><h2>TURN ORDER</h2><div className="match-player-list">
            {view.players.map((player) => <div className={`match-player ${player.id === view.activePlayerId ? "active" : ""}`} key={player.id}>
              <span className="match-avatar" style={{ background: palette[player.color] ?? player.color }}>{player.name.charAt(0).toUpperCase()}</span>
              <span className="match-player-info"><strong>{player.name}{player.id === view.self.id ? " · You" : ""}</strong><small>{player.resourceCount} resources · {player.developmentCardCount} dev cards</small></span>
              <strong className="match-score">{player.id === view.self.id ? view.self.totalPoints : player.publicPoints}<small>VP</small></strong>
            </div>)}
          </div></div>
          <MatchHistory view={view} />
          {(view.longestRoadHolderId || view.largestArmyHolderId) && <div className="match-awards">{view.longestRoadHolderId && <span>Longest Road · {view.players.find((player) => player.id === view.longestRoadHolderId)?.name}</span>}{view.largestArmyHolderId && <span>Largest Army · {view.players.find((player) => player.id === view.largestArmyHolderId)?.name}</span>}</div>}
          <div className="match-sidebar-section match-bank"><h2>BANK & PORTS</h2><div>{RESOURCES.map((resource) => <span key={resource} data-bank-resource={resource} title={resources[resource].label}><img src={resourceCardAsset(resource)} alt="" />{view.bank[resource]}</span>)}</div></div>
          <details className="match-chat" open><summary><MessageCircle size={16} /> CHAT</summary><div className="match-chat-body"><div className="match-chat-messages">{latestChat.length ? latestChat.map((line) => <p key={line.id}><strong>{line.name}:</strong> {line.text}</p>) : <p>Talk strategy with your friends.</p>}</div><form onSubmit={(event) => void sendMessage(event)}><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={240} aria-label="Game chat message" placeholder="Send a message" /><button type="submit" aria-label="Send message" disabled={!chatDraft.trim() || chatBusy}><Send size={17} /></button></form></div></details>
        </aside>
      </div>

      <div className="match-toolbar">
        <div className="match-dock-status" role="status">
          <span className="match-dock-action">{dockPrompt}</span>
          {remainingSeconds !== null && view.phase !== "completed" && <span className={`match-countdown ${remainingSeconds <= 15 ? "urgent" : ""}`} role="timer" aria-label={`${remainingSeconds} seconds remaining in this turn`}>{timerText}</span>}
          {view.legal.canRequestSpecialBuild && <button type="button" disabled={busy} onClick={() => void command({ type: "request-special-build", requested: !view.legal.specialBuildRequested })}>{view.legal.specialBuildRequested ? "Cancel special build" : "Request special build"}</button>}
          {view.legal.canPassSpecialBuild && <button type="button" disabled={busy} onClick={() => void command({ type: "pass-special-build" })}>Finish special build</button>}
        </div>
        <div className="match-hand"><span className="match-toolbar-label">YOUR HAND · {handSize} CARDS</span><div className="match-hand-cards">{handSize ? RESOURCES.filter((resource) => view.self.resources[resource] > 0).map((resource) => <ResourceBadge key={resource} resource={resource} count={view.self.resources[resource]} />) : <span className="match-empty-hand">Resources arrive after your second house.</span>}</div></div>
        <div className="match-dock-actions">
        <button className={`match-trade-shortcut ${view.legal.bankTradeGive.length ? "bank-ready" : ""}`} type="button" disabled={!(view.legal.canOfferTrade || view.legal.bankTradeGive.length) || busy} title={view.legal.bankTradeGive.length ? "Bank trade available" : "Trade with friends"} aria-label={view.legal.bankTradeGive.length ? "Trade with bank or friends; bank trade available" : "Trade with friends"} onClick={() => { setPlacement(null); setRoadAnchor(null); setTradeInitialTab(view.legal.bankTradeGive.length ? "bank" : "friend"); setPanel("trade"); }}><span className="match-trade-art"><img src={resourceCardAsset("ore")} alt="" /><ArrowLeftRight size={26} /></span><span className="match-toolbar-label">Trade</span></button>
        <div className="match-piece-row" role="group" aria-label="Build and card actions">
          <button className={`match-piece-button ${devReady ? "ready" : ""} ${canPay(view.self.resources, COSTS.development) ? "affordable" : ""}`} type="button" disabled={!(view.legal.canBuyDevelopment || view.self.developmentCards.length) || busy} title="Special development cards · 1 wool, 1 grain, 1 ore to buy" aria-label="Special development cards" onClick={() => { setPlacement(null); setRoadAnchor(null); setPanel("development"); }}><CostPreview cost={COSTS.development} /><img className="match-special-piece" src={baseAsset("card-knight")} alt="" /><span className="match-toolbar-label">Special card</span></button>
          <button className={`match-piece-button ${roadReady ? "ready" : ""} ${canPay(view.self.resources, COSTS.road) ? "affordable" : ""} ${placement === "road" || view.phase === "setup-road" ? "selected" : ""}`} type="button" disabled={!roadReady || busy} title="Road · 1 wood and 1 brick" aria-label="Build road" onClick={() => { setPanel(null); setRoadAnchor(null); setPlacement(placement === "road" ? null : "road"); }}><CostPreview cost={COSTS.road} /><img className="match-road-piece" src={pieceAsset("road", selfColor)} alt="" /><b>{Math.max(0, 15 - roadCount)}</b><span className="match-toolbar-label">Road</span></button>
          <button className={`match-piece-button ${houseReady ? "ready" : ""} ${canPay(view.self.resources, COSTS.settlement) ? "affordable" : ""} ${placement === "settlement" || view.phase === "setup-settlement" ? "selected" : ""}`} type="button" disabled={!houseReady || busy} title="House · 1 wood, 1 brick, 1 wool, 1 grain" aria-label="Build house" onClick={() => { setPanel(null); setRoadAnchor(null); setSelectedVertex(null); setPlacement(placement === "settlement" ? null : "settlement"); }}><CostPreview cost={COSTS.settlement} /><img src={pieceAsset("settlement", selfColor)} alt="" /><b>{Math.max(0, 5 - houseCount)}</b><span className="match-toolbar-label">House</span></button>
          <button className={`match-piece-button ${cityReady ? "ready" : ""} ${canPay(view.self.resources, COSTS.city) ? "affordable" : ""} ${placement === "city" ? "selected" : ""}`} type="button" disabled={!cityReady || busy} title="House upgrade · 2 grain and 3 ore" aria-label="Upgrade house to city" onClick={() => { setPanel(null); setRoadAnchor(null); setSelectedVertex(null); setPlacement(placement === "city" ? null : "city"); }}><CostPreview cost={COSTS.city} /><CityIcon color={palette[selfColor] ?? selfColor} /><b>{Math.max(0, 4 - cityCount)}</b><span className="match-toolbar-label">Upgrade house</span></button>
          {robberReady && <button className="match-piece-button ready" type="button" disabled={busy} title={knightCard ? "Play Knight and move robber" : "Move robber on the island"} aria-label={knightCard ? "Play Knight" : "Move robber"} onClick={() => { setPanel(null); setPlacement(null); if (knightCard && view.phase !== "robber-move") void command({ type: "play-knight", cardId: knightCard.id }); }}><img src={baseAsset("icon-robber")} alt="" /><span className="match-toolbar-label">Robber</span></button>}
        </div>
        <button className={`match-turn-tile ${view.legal.canEndTurn ? "ready" : ""}`} type="button" disabled={!view.legal.canEndTurn || busy} title="End turn" aria-label="End turn" onClick={() => void command({ type: "end-turn" })}><Hourglass size={38} strokeWidth={1.8} /><span className="match-toolbar-label">End turn</span></button>
        </div>
        {targets.length > 0 && <details className="match-target-list">
          <summary id="match-target-picker">Choose from {targets.length} legal {targets.length === 1 ? "position" : "positions"}</summary>
          <div>{targets.map((target) => <button key={target.id} type="button" disabled={busy} onClick={() => { if ("vertexId" in target.command) setSelectedVertex({ id: target.command.vertexId, city: target.command.type === "build-city" }); else void command(target.command); }}>{target.label}</button>)}</div>
        </details>}
      </div>
      {flights.map((flight) => <div className="match-resource-flight" key={flight.id} style={{ left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px`, animationDelay: `${flight.delay}ms` } as CSSProperties}><img src={resourceCardAsset(flight.resource)} alt="" /><strong>+{flight.count}</strong></div>)}
      {panel === "development" && <PanelShell title="Development cards" onClose={() => setPanel(null)}><DevelopmentPanel view={view} onCommand={(item) => void command(item)} busy={busy} /></PanelShell>}
      {view.phase === "completed" && <div className="match-complete"><div><Sparkles size={38} /><h2>{view.winnerId === view.self.id ? "You won!" : `${view.players.find((player) => player.id === view.winnerId)?.name ?? "A friend"} won!`}</h2><p>Final score: {view.self.totalPoints} of {view.victoryPointsToWin} points</p><button type="button" onClick={onBack}>Back to room</button></div></div>}
    </div>
  );
}
