import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Dice5,
  Hammer,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Shield,
  ShoppingBasket,
  Sparkles,
  X,
} from "lucide-react";
import { RESOURCES, type DevelopmentCard, type GameView, type Hex, type Resource, type ResourceCounts } from "../engine";
import { isLocalPreview, type LocalIdentity, type RoomView } from "./room/roomService";
import { createMatchClient, type MatchCommand } from "./match/matchService";
import "./matchStyles.css";

type Placement = "road" | "settlement" | "city" | null;
type Panel = "trade" | "development" | null;
type TradeTab = "bank" | "friend";

const palette: Record<string, string> = {
  coral: "#ea6e5d",
  sky: "#4b9cda",
  mint: "#56a875",
  violet: "#aa83cc",
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

function atVertex(x: number, y: number, size: number) {
  return { x: 450 + (Math.sqrt(3) / 2) * size * x, y: 345 + (size / 2) * y };
}

function atHex(q: number, r: number, size: number) {
  return { x: 450 + Math.sqrt(3) * size * (q + r / 2), y: 345 + 1.5 * size * r };
}

function polygonPoints(x: number, y: number, size: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
  }).join(" ");
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

function TerrainMark({ terrain, x, y }: { terrain: Hex["terrain"]; x: number; y: number }) {
  if (terrain === "wood") return (
    <g transform={`translate(${x} ${y - 19})`} strokeLinejoin="round">
      <path d="M-22 18l13-30 8 16 8-29 18 43Z" fill="#2a5c3e" stroke="#194c38" strokeWidth="3" />
      <path d="M-9 18v9M8 18v9" stroke="#674b2b" strokeWidth="6" />
      <path d="M-11 -1l4-8M4 2l6-10" stroke="#92bd73" strokeWidth="3" opacity=".7" />
    </g>
  );
  if (terrain === "wool") return (
    <g transform={`translate(${x} ${y - 19})`}>
      <ellipse cy="9" rx="25" ry="15" fill="#f0efd7" stroke="#98ae7f" strokeWidth="3" />
      <circle cx="-14" cy="2" r="11" fill="#f7f5e3" />
      <circle cx="1" cy="-2" r="13" fill="#f7f5e3" />
      <circle cx="14" cy="5" r="11" fill="#f7f5e3" />
      <circle cx="20" cy="10" r="3" fill="#5b6148" />
      <path d="M-11 21v8M8 21v8" stroke="#625d46" strokeWidth="4" />
    </g>
  );
  if (terrain === "grain") return (
    <g transform={`translate(${x} ${y - 20})`} stroke="#8c6c26" strokeWidth="2.7" fill="none" strokeLinecap="round">
      <path d="M0 29v-48M-12 26v-37M13 27v-39M0-12l-7-6M0-5l8-7M0 2l-8-8M0 10l7-8M-12-3l-7-6M-12 5l6-7M13-4l6-6M13 4l-7-6" />
      <path d="M-4-15l4-8 4 8M-16-7l4-8 4 8M9-8l4-8 4 8" fill="#f0d978" />
    </g>
  );
  if (terrain === "brick") return (
    <g transform={`translate(${x} ${y - 16})`} stroke="#894935" strokeWidth="2" fill="#d89568">
      <rect x="-26" y="-15" width="24" height="11" rx="1" />
      <rect x="0" y="-15" width="25" height="11" rx="1" />
      <rect x="-20" y="-2" width="25" height="11" rx="1" />
      <rect x="7" y="-2" width="25" height="11" rx="1" />
      <rect x="-26" y="11" width="24" height="11" rx="1" />
      <rect x="0" y="11" width="25" height="11" rx="1" />
    </g>
  );
  if (terrain === "ore") return (
    <g transform={`translate(${x} ${y - 17})`} strokeLinejoin="round">
      <path d="M-30 26l15-41 11 20 11-30 25 51Z" fill="#6e8190" stroke="#4d6270" strokeWidth="3" />
      <path d="M-15-15L-6 1-3 4l10-29L17-5 9-9Z" fill="#dbe1d9" />
      <path d="M-30 26l15-41L-6 1-17 17Z" fill="#9facaa" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y - 15})`}>
      <path d="M-30 20Q-8 1 9 16T31 13M-24 30Q0 12 25 27" fill="none" stroke="#e9d49c" strokeWidth="8" />
      <path d="M10 8v-26M10-9l10-6M10-2L0-9" stroke="#9c7950" strokeWidth="3" fill="none" />
    </g>
  );
}

function GameBoard({ view, placement, onCommand, busy }: {
  view: GameView;
  placement: Placement;
  onCommand: (command: MatchCommand) => void;
  busy: boolean;
}) {
  const size = 69;
  const active = view.activePlayerId === view.self.id;
  const settlementIds = active
    ? view.phase === "setup-settlement"
      ? view.legal.setupSettlementVertices
      : placement === "settlement" ? view.legal.settlementVertices : []
    : [];
  const roadIds = active
    ? view.phase === "setup-road"
      ? view.legal.setupRoadEdges
      : view.phase === "road-building" || placement === "road"
        ? view.legal.roadEdges : []
    : [];
  const cityIds = active && placement === "city" ? view.legal.cityVertices : [];
  const robberIds = active ? view.legal.robberHexes : [];
  const playerColor = new Map(view.players.map((player) => [player.id, palette[player.color] ?? player.color]));
  const hexes = Object.values(view.board.hexes);
  const vertices = view.board.vertices;
  const edges = view.board.edges;
  const hexAction = (id: string) => onCommand({ type: "move-robber", hexId: id });
  return (
    <svg className="match-board-svg" viewBox="0 0 900 690" role="group" aria-label="Playable Base island board">
      <defs>
        <linearGradient id="match-sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35a1d0" />
          <stop offset=".53" stopColor="#177db9" />
          <stop offset="1" stopColor="#0b598f" />
        </linearGradient>
        <radialGradient id="match-wood"><stop stopColor="#75a653" /><stop offset="1" stopColor="#2f6847" /></radialGradient>
        <radialGradient id="match-wool"><stop stopColor="#d4db83" /><stop offset="1" stopColor="#8baf5c" /></radialGradient>
        <radialGradient id="match-grain"><stop stopColor="#f7e18b" /><stop offset="1" stopColor="#d3a94f" /></radialGradient>
        <radialGradient id="match-brick"><stop stopColor="#e4a66f" /><stop offset="1" stopColor="#b9684d" /></radialGradient>
        <radialGradient id="match-ore"><stop stopColor="#b5c2c4" /><stop offset="1" stopColor="#738897" /></radialGradient>
        <radialGradient id="match-desert"><stop stopColor="#f2dfad" /><stop offset="1" stopColor="#d9ba7b" /></radialGradient>
        <pattern id="match-waves" width="62" height="28" patternUnits="userSpaceOnUse">
          <path d="M0 15Q15 6 31 15T62 15" stroke="#c4eff0" opacity=".17" strokeWidth="2" fill="none" />
        </pattern>
        <pattern id="match-speckle" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="1.4" fill="#fff7db" opacity=".44" />
          <circle cx="14" cy="12" r="1" fill="#704e24" opacity=".29" />
        </pattern>
        <filter id="match-shadow"><feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#064a6b" floodOpacity=".38" /></filter>
      </defs>
      <rect width="900" height="690" fill="url(#match-sea)" />
      <rect width="900" height="690" fill="url(#match-waves)" />
      <path d="M307 55Q450 6 590 60L686 136Q785 236 783 353Q791 477 679 557L583 625Q453 676 308 627L215 558Q101 472 112 344Q99 224 210 134Z" fill="#bdd9cf" stroke="#80c4d4" strokeWidth="11" filter="url(#match-shadow)" />
      <path d="M310 66Q450 16 585 71L676 145Q774 243 772 350Q779 472 672 546L577 613Q453 662 315 616L224 548Q111 462 124 341Q110 234 220 144Z" fill="#e2ca92" stroke="#f7e9bd" strokeWidth="9" />
      {hexes.map((hex) => {
        const point = atHex(hex.q, hex.r, size);
        const robber = view.robberHexId === hex.id;
        const legalRobber = robberIds.includes(hex.id);
        return (
          <g key={hex.id} className={`match-hex match-hex-${hex.terrain}`}>
            <polygon points={polygonPoints(point.x, point.y, size - 1)} fill="#94692f" stroke="#7c5729" strokeWidth="3" />
            <polygon points={polygonPoints(point.x, point.y, size - 7)} fill={`url(#match-${hex.terrain})`} stroke="#efce88" strokeWidth="3" />
            <polygon points={polygonPoints(point.x, point.y, size - 9)} fill="url(#match-speckle)" opacity=".55" />
            <TerrainMark terrain={hex.terrain} x={point.x} y={point.y} />
            {hex.number !== null && (
              <g>
                <circle cx={point.x} cy={point.y + 24} r="20" fill="#fff6df" stroke="#ae8149" strokeWidth="3" />
                <text x={point.x} y={point.y + 32} textAnchor="middle" fontSize="24" fontWeight="900" fill={hex.number === 6 || hex.number === 8 ? "#b23d32" : "#253e50"}>{hex.number}</text>
              </g>
            )}
            {robber && (
              <g transform={`translate(${point.x + 37} ${point.y - 32})`}>
                <circle r="15" fill="#253f50" stroke="#fff2d6" strokeWidth="3" />
                <path d="M-7 5q7-10 14 0M0-8v6" fill="none" stroke="#fff2d6" strokeWidth="3" strokeLinecap="round" />
              </g>
            )}
            <title>{terrainLabels[hex.terrain]}{hex.number ? ` · ${hex.number}` : ""}{robber ? " · Robber" : ""}</title>
            {legalRobber && (
              <g
                className="match-legal-hex"
                role="button"
                tabIndex={0}
                aria-label={hexLabel(view, hex.id)}
                onClick={() => !busy && hexAction(hex.id)}
                onKeyDown={(event) => keyboardClick(event, () => !busy && hexAction(hex.id))}
              >
                <polygon points={polygonPoints(point.x, point.y, size - 8)} fill="#ffe1a2" opacity=".18" stroke="#fff6da" strokeWidth="3" strokeDasharray="7 5" />
              </g>
            )}
          </g>
        );
      })}
      {view.board.ports.map((port) => {
        const [a, b] = port.vertexIds.map((id) => atVertex(vertices[id]!.x, vertices[id]!.y, size));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const radial = Math.hypot(mx - 450, my - 345);
        const x = mx + ((mx - 450) / radial) * 31;
        const y = my + ((my - 345) / radial) * 31;
        return (
          <g key={port.edgeId} className="match-port">
            <path d={`M${mx} ${my}L${x} ${y}`} stroke="#f8e3b8" strokeWidth="3" />
            <circle cx={x} cy={y} r="20" />
            <text x={x} y={y + 5} textAnchor="middle">{port.ratio}:1</text>
            <title>{port.resource ? `${resources[port.resource].label} port` : "Any resource port"}</title>
          </g>
        );
      })}
      {Object.entries(view.roads).map(([edgeId, ownerId]) => {
        const [aId, bId] = edges[edgeId]!.vertexIds;
        const a = atVertex(vertices[aId]!.x, vertices[aId]!.y, size);
        const b = atVertex(vertices[bId]!.x, vertices[bId]!.y, size);
        return (
          <g key={edgeId}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#704e32" strokeWidth="15" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={playerColor.get(ownerId) ?? "#fff"} strokeWidth="10" strokeLinecap="round" />
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
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff6db" strokeWidth="11" strokeLinecap="round" strokeDasharray="7 6" />
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
              <path d="M-15 14V-4L0-17L15-4V14Z" fill={color} stroke="#fff1d2" strokeWidth="3" strokeLinejoin="round" />
            )}
          </g>
        );
      })}
      {[...settlementIds, ...cityIds].map((vertexId) => {
        const vertex = vertices[vertexId]!;
        const point = atVertex(vertex.x, vertex.y, size);
        const city = cityIds.includes(vertexId);
        const action = () => onCommand(city
          ? { type: "build-city", vertexId }
          : { type: view.phase === "setup-settlement" ? "place-setup-settlement" : "build-settlement", vertexId });
        return (
          <g key={vertexId} className="match-legal-vertex" role="button" tabIndex={0} aria-label={vertexLabel(view, vertexId, city ? "Build city" : "Place settlement")} onClick={() => !busy && action()} onKeyDown={(event) => keyboardClick(event, () => !busy && action())}>
            <circle cx={point.x} cy={point.y} r="16" fill="#fff7da" stroke="#d48637" strokeWidth="4" />
            <path d={`M${point.x - 6} ${point.y}h12M${point.x} ${point.y - 6}v12`} stroke="#b66f26" strokeWidth="3" strokeLinecap="round" />
            <circle cx={point.x} cy={point.y} r="24" fill="transparent" />
          </g>
        );
      })}
      {view.lastRoll && (
        <g className="match-roll-token">
          <rect x="401" y="622" width="98" height="43" rx="13" fill="#fff4dc" stroke="#b3864b" strokeWidth="3" />
          <text x="450" y="649" textAnchor="middle" fontSize="18" fontWeight="800" fill="#274457">⚄ {view.lastRoll[0] + view.lastRoll[1]}</text>
        </g>
      )}
    </svg>
  );
}

function ResourceBadge({ resource, count, compact = false }: { resource: Resource; count: number; compact?: boolean }) {
  const info = resources[resource];
  return <span className={`match-resource-badge ${compact ? "compact" : ""}`} style={{ "--resource-color": info.color } as React.CSSProperties}>
    <span className="match-resource-symbol">{info.symbol}</span>
    <span className="match-resource-name">{info.label}</span>
    <strong>{count}</strong>
  </span>;
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
            <span style={{ color: resources[resource].color }}>{resources[resource].symbol}</span>
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

function TradePanel({ view, onCommand, busy }: { view: GameView; onCommand: (command: MatchCommand) => void; busy: boolean }) {
  const [tab, setTab] = useState<TradeTab>("bank");
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
  return (
    <div className="match-panel-body">
      <div className="match-tab-row">
        <button className={tab === "bank" ? "selected" : ""} onClick={() => setTab("bank")} type="button">Bank & ports</button>
        <button className={tab === "friend" ? "selected" : ""} onClick={() => setTab("friend")} type="button">Friends</button>
      </div>
      {tab === "bank" ? (
        <>
          <p>Exchange matching resources at 4:1, or use a port you own.</p>
          <div className="match-select-row">
            <label>Give
              <select value={actualGive ?? ""} disabled={!actualGive} onChange={(event) => setGive(event.target.value as Resource)}>
                {availableGive.map((resource) => <option key={resource} value={resource}>{resources[resource].label} ({bankRatio(view, resource)} cards)</option>)}
              </select>
            </label>
            <span>→</span>
            <label>Receive
              <select value={actualReceive ?? ""} disabled={!actualReceive} onChange={(event) => setReceive(event.target.value as Resource)}>
                {receiveOptions.map((resource) => <option key={resource} value={resource}>{resources[resource].label}</option>)}
              </select>
            </label>
          </div>
          <button className="match-primary-action" type="button" disabled={!actualGive || !actualReceive || busy} onClick={() => onCommand({ type: "bank-trade", give: actualGive!, receive: actualReceive! })}>Trade with bank</button>
          {!availableGive.length && <p className="match-muted">You need enough matching cards for a bank trade.</p>}
        </>
      ) : (
        <>
          <p>Offer cards to one friend. Their hand stays private until they accept.</p>
          <label className="match-friend-select">Offer to
            <select value={friendId} onChange={(event) => setFriendId(event.target.value)}>
              {view.players.filter((player) => player.id !== view.self.id).map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
            </select>
          </label>
          <CountPicker title="You give" counts={offerGive} onChange={(resource, amount) => setCount("give", resource, amount)} maxFor={(resource) => view.self.resources[resource]} />
          <CountPicker title="You want" counts={offerWant} onChange={(resource, amount) => setCount("want", resource, amount)} maxFor={() => 19} />
          <button className="match-primary-action" type="button" disabled={!view.legal.canOfferTrade || !friendId || !sumCounts(offerGive) || !sumCounts(offerWant) || !RESOURCES.every((resource) => offerGive[resource] <= view.self.resources[resource]) || busy} onClick={() => onCommand({ type: "offer-trade", toPlayerId: friendId, give: offerGive, want: offerWant })}>Send offer</button>
        </>
      )}
    </div>
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
            <Sparkles size={20} />
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
  return (
    <div className="match-trade-banner match-trade-offer">
      <div><ShoppingBasket size={20} /><strong>{from} offers {offered} to {to} for {wanted}</strong></div>
      <div>
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
  if (view.activePlayerId !== view.self.id) return `Waiting for ${active} to ${phaseLabels[view.phase].toLowerCase()}.`;
  if (placement) return `Choose a highlighted ${placement === "road" ? "edge" : "corner"} on the island.`;
  if (view.phase === "robber-move") return "Choose a highlighted tile for the robber.";
  if (view.phase === "road-building") return "Place your free road on a highlighted edge.";
  if (view.phase === "setup-settlement" || view.phase === "setup-road") return "Choose one of the highlighted spots on the island.";
  if (view.phase === "robber-steal") return "Choose a friend to take one random resource from.";
  if (view.phase === "pre-roll") return "Roll the dice to start your turn.";
  return "Make your move, then end your turn.";
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
  const [panel, setPanel] = useState<Panel>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let mounted = true;
    const refresh = () => void client.load().then((next) => {
      if (mounted) { setView(next); setLoadError(""); }
    }).catch((error: unknown) => {
      if (mounted) setLoadError(error instanceof Error ? error.message : "Could not load this match.");
    });
    refresh();
    const unsubscribe = client.subscribe(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [client]);

  useEffect(() => {
    setPlacement(null);
    setPanel(null);
  }, [view?.phase, view?.activePlayerId]);

  async function command(item: MatchCommand) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const next = await client.command(item);
      setView(next);
      setPlacement(null);
      if (item.type === "roll") {
        const value = next.lastRoll ? next.lastRoll[0] + next.lastRoll[1] : null;
        if (value) setEvents((current) => [`Rolled ${value}.`, ...current].slice(0, 8));
      } else {
        const label = item.type.replaceAll("-", " ");
        setEvents((current) => [`${label.charAt(0).toUpperCase() + label.slice(1)}.`, ...current].slice(0, 8));
      }
      if (item.type !== "bank-trade" && item.type !== "buy-development") setPanel(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action could not be completed.");
      void client.load().then(setView).catch(() => undefined);
    } finally {
      setBusy(false);
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
  const myTurn = view.self.id === view.activePlayerId;
  const handSize = sumCounts(view.self.resources);
  const canBuild = Boolean(view.legal.roadEdges.length || view.legal.settlementVertices.length || view.legal.cityVertices.length);
  const targets = boardTargets(view, placement);
  const latestChat = room.chat.slice(-8);
  return (
    <div className="match-screen">
      <header className="match-topbar">
        <button className="match-back" type="button" onClick={onBack}><ArrowLeft size={18} /> Rooms</button>
        <strong className="match-brand">HARBOR TABLE</strong>
        <span className="match-room-code">Room {room.code}</span>
        <span className="match-base">BASE GAME · {view.victoryPointsToWin} POINTS</span>
        <button className="match-copy" type="button" title="Copy invite link" aria-label="Copy invite link" onClick={onCopy}><Copy size={17} /></button>
        <span className="match-turn-badge">TURN {view.turn || "SETUP"}</span>
      </header>

      <div className="match-main">
        <section className="match-board-area">
          <div className="match-phase-banner">
            <div><span className="match-phase-kicker">{isLocalPreview ? "LOCAL PREVIEW · " : ""}{view.phase === "completed" ? "GAME OVER" : myTurn ? "YOUR TURN" : `${active?.name.toUpperCase() ?? "FRIEND"}'S TURN`}</span><h1>{phaseLabels[view.phase]}</h1><p>{phaseMessage(view, placement)}</p></div>
            {view.lastRoll && <span className="match-dice-result"><Dice5 size={24} /> {view.lastRoll[0]} + {view.lastRoll[1]} = {view.lastRoll[0] + view.lastRoll[1]}</span>}
          </div>
          {targets.length > 0 && <a className="match-skip-targets" href="#match-target-picker">Skip to legal positions</a>}
          <div className="match-board-wrap"><GameBoard view={view} placement={placement} onCommand={(item) => void command(item)} busy={busy} /></div>
          {actionError && <div className="match-error" role="alert">{actionError}<button type="button" onClick={() => setActionError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          <PendingTrade view={view} onCommand={(item) => void command(item)} busy={busy} />
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
          <div className="match-sidebar-section match-activity"><h2>ACTIVITY</h2>{events.length ? events.map((event, index) => <p key={`${index}:${event}`}>{event}</p>) : <p>Game started. Build your first settlements and roads.</p>}{view.longestRoadHolderId && <p>Longest Road: {view.players.find((player) => player.id === view.longestRoadHolderId)?.name}</p>}{view.largestArmyHolderId && <p>Largest Army: {view.players.find((player) => player.id === view.largestArmyHolderId)?.name}</p>}</div>
          <div className="match-sidebar-section match-bank"><h2>BANK & PORTS</h2><div>{RESOURCES.map((resource) => <span key={resource} title={resources[resource].label} style={{ color: resources[resource].color }}>{resources[resource].symbol} {view.bank[resource]}</span>)}</div></div>
          <div className="match-chat"><h2><MessageCircle size={16} /> CHAT</h2><div className="match-chat-messages">{latestChat.length ? latestChat.map((line) => <p key={line.id}><strong>{line.name}:</strong> {line.text}</p>) : <p>Talk strategy with your friends.</p>}</div><form onSubmit={(event) => void sendMessage(event)}><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={240} aria-label="Game chat message" placeholder="Send a message" /><button type="submit" aria-label="Send message" disabled={!chatDraft.trim() || chatBusy}><Send size={17} /></button></form></div>
        </aside>
      </div>

      <div className="match-toolbar">
        <div className="match-hand"><span className="match-toolbar-label">YOUR HAND · {handSize} CARDS</span><div className="match-hand-cards">{RESOURCES.map((resource) => <ResourceBadge key={resource} resource={resource} count={view.self.resources[resource]} />)}</div></div>
        <div className="match-actions"><span className="match-toolbar-label">ACTIONS</span><div className="match-action-row">
          <button className="match-action-button roll" type="button" disabled={!view.legal.canRoll || busy} onClick={() => void command({ type: "roll" })}><Dice5 size={19} /> Roll dice</button>
          <button className="match-action-button trade" type="button" disabled={!(view.legal.canOfferTrade || view.legal.bankTradeGive.length) || busy} onClick={() => { setPlacement(null); setPanel("trade"); }}><ShoppingBasket size={19} /> Trade</button>
          <button className={`match-action-button build ${placement ? "selected" : ""}`} type="button" disabled={!canBuild || busy} onClick={() => { setPanel(null); setPlacement(placement ? null : view.legal.roadEdges.length ? "road" : view.legal.settlementVertices.length ? "settlement" : "city"); }}><Hammer size={19} /> Build</button>
          <button className="match-action-button dev" type="button" disabled={!(view.legal.canBuyDevelopment || view.self.developmentCards.length) || busy} onClick={() => { setPlacement(null); setPanel("development"); }}><Sparkles size={18} /> Dev cards</button>
          <button className="match-action-button end" type="button" disabled={!view.legal.canEndTurn || busy} onClick={() => void command({ type: "end-turn" })}><Check size={18} /> End turn</button>
        </div>
        {placement && <div className="match-build-picks">
          {view.legal.roadEdges.length > 0 && <button type="button" className={placement === "road" ? "selected" : ""} onClick={() => setPlacement("road")}>Road · 1 wood, 1 brick</button>}
          {view.legal.settlementVertices.length > 0 && <button type="button" className={placement === "settlement" ? "selected" : ""} onClick={() => setPlacement("settlement")}>Settlement · wood, brick, wool, grain</button>}
          {view.legal.cityVertices.length > 0 && <button type="button" className={placement === "city" ? "selected" : ""} onClick={() => setPlacement("city")}>City · 2 grain, 3 ore</button>}
        </div>}
        {targets.length > 0 && <details className="match-target-list">
          <summary id="match-target-picker">Choose from {targets.length} legal {targets.length === 1 ? "position" : "positions"}</summary>
          <div>{targets.map((target) => <button key={target.id} type="button" disabled={busy} onClick={() => void command(target.command)}>{target.label}</button>)}</div>
        </details>}
        </div>
      </div>
      {panel && <PanelShell title={panel === "trade" ? "Trade" : "Development cards"} onClose={() => setPanel(null)}>{panel === "trade" ? <TradePanel view={view} onCommand={(item) => void command(item)} busy={busy} /> : <DevelopmentPanel view={view} onCommand={(item) => void command(item)} busy={busy} />}</PanelShell>}
      {view.phase === "completed" && <div className="match-complete"><div><Sparkles size={38} /><h2>{view.winnerId === view.self.id ? "You won!" : `${view.players.find((player) => player.id === view.winnerId)?.name ?? "A friend"} won!`}</h2><p>Final score: {view.self.totalPoints} of {view.victoryPointsToWin} points</p><button type="button" onClick={onBack}>Back to room</button></div></div>}
    </div>
  );
}
