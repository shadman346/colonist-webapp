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

function GameBoard({ view, placement, onCommand, busy }: {
  view: GameView;
  placement: Placement;
  onCommand: (command: MatchCommand) => void;
  busy: boolean;
}) {
  const size = BOARD_HEX_SIZE;
  const tileWidth = Math.sqrt(3) * size;
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
  const portPlacements = view.board.ports.map((port) => {
    const [a, b] = port.vertexIds.map((id) => atVertex(vertices[id]!.x, vertices[id]!.y, size));
    const slot = PORT_SLOTS.find((candidate) => view.board.hexes[candidate.hexId]?.edgeIds[candidate.edge] === port.edgeId);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = midpoint.x - BOARD_ORIGIN.x;
    const dy = midpoint.y - BOARD_ORIGIN.y;
    const length = Math.hypot(dx, dy) || 1;
    const ship = slot
      ? { x: BOARD_ORIGIN.x + slot.u * tileWidth, y: BOARD_ORIGIN.y + slot.v * size * 1.5 }
      : { x: midpoint.x + dx / length * 57, y: midpoint.y + dy / length * 57 };
    return { port, a, b, ship };
  });
  const hexAction = (id: string) => onCommand({ type: "move-robber", hexId: id });
  return (
    <svg className="match-board-svg" viewBox="0 0 900 690" role="group" aria-label="Playable Base island board">
      <defs>
        <filter id="match-shadow"><feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#064a6b" floodOpacity=".38" /></filter>
      </defs>
      <rect width="900" height="690" fill="#09639e" />
      <g className="match-coast" strokeLinejoin="round" filter="url(#match-shadow)">
        {(["#0d78ad", "#78c7e2", "#f3f5d9", "#e2c27a"] as const).map((color, layer) => (
          <g key={color} fill="#dfbc70" stroke={color} strokeWidth={[48, 38, 29, 21][layer]}>
            {hexes.map((hex) => {
              const point = atHex(hex.q, hex.r, size);
              return <polygon key={hex.id} points={polygonPoints(point.x, point.y, size)} />;
            })}
          </g>
        ))}
      </g>
      {portPlacements.map(({ port, a, b, ship }) => (
        <g key={`${port.edgeId}:piers`} className="match-port-piers">
          {[a, b].map((from, index) => {
            const to = pierEnd(from, ship);
            return <g key={index}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#80511c" strokeWidth="11" />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#dca13a" strokeWidth="8" strokeDasharray="6 2" />
            </g>;
          })}
        </g>
      ))}
      {hexes.map((hex) => {
        const point = atHex(hex.q, hex.r, size);
        const robber = view.robberHexId === hex.id;
        const legalRobber = robberIds.includes(hex.id);
        return (
          <g key={hex.id} className={`match-hex match-hex-${hex.terrain}`}>
            <image href={terrainAsset(hex.terrain)} x={point.x - tileWidth / 2} y={point.y - size} width={tileWidth} height={size * 2} />
            {hex.number !== null && <image href={numberTokenAsset(hex.number)} x={point.x - 22} y={point.y + 4} width="44" height="44" />}
            {robber && (
              <image href={baseAsset("icon-robber")} x={point.x + 18} y={point.y - 53} width="39" height="39" />
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
      {portPlacements.map(({ port, ship }) => <g key={port.edgeId} className="match-port">
        <image href={portAsset(port.resource)} x={ship.x - 31} y={ship.y - 31} width="62" height="62" />
        <title>{port.resource ? `${resources[port.resource].label} port` : "Any resource port"}</title>
      </g>)}
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
          <rect x="700" y="558" width="160" height="53" rx="12" fill="#fff4dc" stroke="#b3864b" strokeWidth="3" />
          <text x="780" y="592" textAnchor="middle" fontSize="20" fontWeight="800" fill="#274457">⚄ {view.lastRoll[0] + view.lastRoll[1]}</text>
        </g>
      )}
    </svg>
  );
}

function ResourceBadge({ resource, count, compact = false }: { resource: Resource; count: number; compact?: boolean }) {
  const info = resources[resource];
  return <span className={`match-resource-badge ${compact ? "compact" : ""}`}>
    <img src={resourceCardAsset(resource)} alt={`${info.label} resource card`} />
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
          <div className="match-sidebar-section match-bank"><h2>BANK & PORTS</h2><div>{RESOURCES.map((resource) => <span key={resource} title={resources[resource].label}><img src={resourceCardAsset(resource)} alt="" />{view.bank[resource]}</span>)}</div></div>
          <div className="match-chat"><h2><MessageCircle size={16} /> CHAT</h2><div className="match-chat-messages">{latestChat.length ? latestChat.map((line) => <p key={line.id}><strong>{line.name}:</strong> {line.text}</p>) : <p>Talk strategy with your friends.</p>}</div><form onSubmit={(event) => void sendMessage(event)}><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={240} aria-label="Game chat message" placeholder="Send a message" /><button type="submit" aria-label="Send message" disabled={!chatDraft.trim() || chatBusy}><Send size={17} /></button></form></div>
        </aside>
      </div>

      <div className="match-toolbar">
        <div className="match-hand"><span className="match-toolbar-label">YOUR HAND · {handSize} CARDS</span><div className="match-hand-cards">{handSize ? RESOURCES.filter((resource) => view.self.resources[resource] > 0).map((resource) => <ResourceBadge key={resource} resource={resource} count={view.self.resources[resource]} />) : <span className="match-empty-hand">Your first resources arrive after your second settlement.</span>}</div></div>
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
