import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Dice5,
  Hammer,
  MessageCircle,
  RotateCcw,
  Send,
  ShoppingBasket,
  X,
} from "lucide-react";
import type { RoomView, PlayerColor } from "./room/roomService";

type Terrain = "wood" | "wool" | "grain" | "brick" | "ore" | "desert";
type BoardTile = {
  q: number;
  r: number;
  terrain: Terrain;
  number: number | null;
};
type Drawer = "build" | "trade" | null;

const terrains: Terrain[] = [
  "wood",
  "wool",
  "grain",
  "brick",
  "wood",
  "ore",
  "wool",
  "grain",
  "wool",
  "desert",
  "wood",
  "brick",
  "ore",
  "grain",
  "wool",
  "wood",
  "brick",
  "grain",
  "ore",
];
const numbers: (number | null)[] = [
  5,
  2,
  6,
  3,
  8,
  10,
  11,
  12,
  11,
  null,
  4,
  5,
  6,
  3,
  8,
  10,
  9,
  4,
  11,
];
const boardTiles: BoardTile[] = [];
let tileIndex = 0;
for (let r = -2; r <= 2; r++) {
  const minQ = Math.max(-2, -r - 2);
  const maxQ = Math.min(2, -r + 2);
  for (let q = minQ; q <= maxQ; q++) {
    boardTiles.push({
      q,
      r,
      terrain: terrains[tileIndex],
      number: numbers[tileIndex],
    });
    tileIndex++;
  }
}

const terrainNames: Record<Terrain, string> = {
  wood: "Forest",
  wool: "Pasture",
  grain: "Fields",
  brick: "Hills",
  ore: "Mountains",
  desert: "Desert",
};
const resourceCards: {
  key: Terrain;
  label: string;
  count: number;
  symbol: string;
}[] = [
  { key: "wood", label: "WOOD", count: 2, symbol: "♠" },
  { key: "wool", label: "WOOL", count: 2, symbol: "●" },
  { key: "brick", label: "BRICK", count: 1, symbol: "▥" },
  { key: "grain", label: "GRAIN", count: 3, symbol: "❋" },
  { key: "ore", label: "ORE", count: 0, symbol: "◆" },
];

function polygonPoints(cx: number, cy: number, size: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 90);
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(" ");
}

function pipCount(number: number | null) {
  if (!number || number === 7) return 0;
  return 6 - Math.abs(number - 7);
}

function TerrainIcon({
  terrain,
  x,
  y,
}: {
  terrain: Terrain;
  x: number;
  y: number;
}) {
  const origin = `translate(${x} ${y})`;
  if (terrain === "wood")
    return (
      <g transform={origin} className="terrain-icon wood-icon">
        <path
          d="M-18 16 L-12 -9 L-3 5 L2 -23 L11 4 L19 -12 L25 16Z"
          fill="#174f36"
          stroke="#0d3b2e"
          strokeWidth="3"
        />
        <path d="M-3 16V25M12 16V25" stroke="#51371e" strokeWidth="5" />
      </g>
    );
  if (terrain === "wool")
    return (
      <g transform={origin} className="terrain-icon wool-icon">
        <ellipse
          cx="0"
          cy="5"
          rx="22"
          ry="13"
          fill="#f4f0da"
          stroke="#aab58e"
          strokeWidth="2"
        />
        <circle cx="-13" cy="-2" r="8" fill="#fbf8eb" />
        <circle cx="1" cy="-5" r="9" fill="#fbf8eb" />
        <circle cx="13" cy="-1" r="8" fill="#fbf8eb" />
        <circle cx="20" cy="5" r="5" fill="#d4c9b0" />
        <circle cx="22" cy="3" r="1" fill="#2a3933" />
        <path d="M-12 14V23M8 14V23" stroke="#70675a" strokeWidth="3" />
      </g>
    );
  if (terrain === "grain")
    return (
      <g
        transform={origin}
        className="terrain-icon grain-icon"
        stroke="#745515"
        strokeWidth="2.5"
        fill="none"
      >
        <path d="M0 23V-20M-11 23V-9M11 23V-12" />
        <path d="M0 -10l-8 -5M0 -4l8 -5M0 2l-8 -5M0 9l8 -5M-11 1l-7 -5M-11 9l6 -5M11 -2l-6 -5M11 6l7 -5" />
      </g>
    );
  if (terrain === "brick")
    return (
      <g
        transform={origin}
        className="terrain-icon brick-icon"
        fill="#d69366"
        stroke="#8d4934"
        strokeWidth="2"
      >
        <rect x="-22" y="-14" width="23" height="11" rx="1" />
        <rect x="2" y="-14" width="23" height="11" rx="1" />
        <rect x="-29" y="-1" width="23" height="11" rx="1" />
        <rect x="-5" y="-1" width="23" height="11" rx="1" />
        <rect x="19" y="-1" width="10" height="11" rx="1" />
        <rect x="-22" y="12" width="23" height="11" rx="1" />
        <rect x="2" y="12" width="23" height="11" rx="1" />
      </g>
    );
  if (terrain === "ore")
    return (
      <g transform={origin} className="terrain-icon ore-icon">
        <path
          d="M-27 23 L-14 -12 L-5 4 L5 -22 L27 23Z"
          fill="#52677c"
          stroke="#364c60"
          strokeWidth="3"
        />
        <path d="M-14 -12L-8 2L-5 4L5 -22L13 -5L4 -7Z" fill="#d1d7d1" />
        <path d="M-27 23L-14 -12L-8 2L-16 16Z" fill="#87969b" />
      </g>
    );
  return (
    <g transform={origin} className="terrain-icon desert-icon">
      <path
        d="M-28 16Q-15 0 0 12T28 10"
        fill="none"
        stroke="#d0a462"
        strokeWidth="7"
      />
      <path
        d="M-23 24Q0 8 24 24"
        fill="none"
        stroke="#efcf8a"
        strokeWidth="5"
      />
      <path
        d="M8 0v-20M8 -12l8 -5M8 -6l-7 -5"
        stroke="#8b6944"
        strokeWidth="3"
        fill="none"
      />
    </g>
  );
}

function HexTile({ tile }: { tile: BoardTile }) {
  const size = 56;
  const x = 450 + Math.sqrt(3) * size * (tile.q + tile.r / 2);
  const y = 340 + 1.5 * size * tile.r;
  const points = polygonPoints(x, y, size - 2);
  const inner = polygonPoints(x, y, size - 7);
  return (
    <g className={`board-hex hex-${tile.terrain}`}>
      <polygon
        points={points}
        fill="#b3833f"
        stroke="#795525"
        strokeWidth="2"
      />
      <polygon
        points={inner}
        fill={`url(#terrain-${tile.terrain})`}
        stroke="#e7c47b"
        strokeWidth="3"
      />
      <polygon points={inner} fill="url(#grain-speckle)" opacity=".38" />
      <TerrainIcon
        terrain={tile.terrain}
        x={x}
        y={y - (tile.number ? 16 : 0)}
      />
      {tile.number ? (
        <g className="number-token">
          <circle
            cx={x}
            cy={y + 19}
            r="19"
            fill="#fdf6e2"
            stroke="#a4773c"
            strokeWidth="3"
          />
          <text
            x={x}
            y={y + 27}
            textAnchor="middle"
            fontSize="25"
            fontWeight="800"
            fill={
              tile.number === 6 || tile.number === 8 ? "#ad3126" : "#21374a"
            }
          >
            {tile.number}
          </text>
          <g
            fill={
              tile.number === 6 || tile.number === 8 ? "#b7352b" : "#1b3847"
            }
          >
            {Array.from({ length: pipCount(tile.number) }, (_, index) => (
              <circle
                key={index}
                cx={x + (index - (pipCount(tile.number) - 1) / 2) * 5}
                cy={y + 35}
                r="1.5"
              />
            ))}
          </g>
        </g>
      ) : (
        <text
          x={x}
          y={y + 39}
          textAnchor="middle"
          fontSize="11"
          fill="#745125"
          fontWeight="800"
        >
          ROBBER
        </text>
      )}
      <title>
        {terrainNames[tile.terrain]}
        {tile.number ? ` · ${tile.number}` : ""}
      </title>
    </g>
  );
}

function IslandBoard({ rolled }: { rolled: number | null }) {
  return (
    <div className="board-stage">
      <svg
        className="island-svg"
        viewBox="0 0 900 690"
        role="img"
        aria-label="Base game island with nineteen terrain hexes, number tokens, roads, settlements, and ports"
      >
        <defs>
          <linearGradient id="sea-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#208bca" />
            <stop offset="1" stopColor="#0b5f9b" />
          </linearGradient>
          <radialGradient id="terrain-wood">
            <stop offset="0" stopColor="#628b43" />
            <stop offset="1" stopColor="#2d6241" />
          </radialGradient>
          <radialGradient id="terrain-wool">
            <stop offset="0" stopColor="#b6ce68" />
            <stop offset="1" stopColor="#77a64a" />
          </radialGradient>
          <radialGradient id="terrain-grain">
            <stop offset="0" stopColor="#f2d66c" />
            <stop offset="1" stopColor="#d0a847" />
          </radialGradient>
          <radialGradient id="terrain-brick">
            <stop offset="0" stopColor="#d48859" />
            <stop offset="1" stopColor="#a95643" />
          </radialGradient>
          <radialGradient id="terrain-ore">
            <stop offset="0" stopColor="#9faab1" />
            <stop offset="1" stopColor="#5b7182" />
          </radialGradient>
          <radialGradient id="terrain-desert">
            <stop offset="0" stopColor="#edd69c" />
            <stop offset="1" stopColor="#d9bc80" />
          </radialGradient>
          <pattern
            id="grain-speckle"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="3" r="1.2" fill="#fff" opacity=".4" />
            <circle cx="12" cy="9" r="1" fill="#613d20" opacity=".4" />
            <path d="M8 15l3 -2" stroke="#fff" opacity=".35" />
          </pattern>
          <pattern
            id="wave-pattern"
            width="48"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 12 Q12 5 24 12 T48 12"
              fill="none"
              stroke="#a7e2e5"
              strokeWidth="2"
              opacity=".13"
            />
          </pattern>
          <filter id="island-shadow">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="12"
              floodColor="#064572"
              floodOpacity=".4"
            />
          </filter>
        </defs>
        <rect width="900" height="690" fill="url(#sea-gradient)" />
        <rect width="900" height="690" fill="url(#wave-pattern)" />
        <path
          d="M315 68Q441 12 576 67L642 119Q713 158 744 258Q786 372 722 473L642 548Q580 620 444 625L305 592Q190 570 151 459L115 360Q108 265 176 178L238 118Z"
          fill="#b3d7cd"
          stroke="#78bfd2"
          strokeWidth="13"
          filter="url(#island-shadow)"
        />
        <path
          d="M311 77Q441 27 569 77L636 128Q703 164 734 258Q767 369 714 465L638 540Q573 611 448 613L310 581Q198 559 161 455L126 359Q116 267 185 188L246 128Z"
          fill="#dfc88e"
          stroke="#f7e4b1"
          strokeWidth="12"
        />
        {boardTiles.map((tile) => (
          <HexTile key={`${tile.q},${tile.r}`} tile={tile} />
        ))}
        <g className="board-roads" strokeLinecap="round">
          <path d="M450 297L498 269" stroke="#e56653" />
          <path d="M450 297L402 269" stroke="#e56653" />
          <path d="M354 423L402 451" stroke="#469be2" />
          <path d="M546 423L594 451" stroke="#469be2" />
          <path d="M306 339L354 311" stroke="#56ac74" />
          <path d="M594 255L642 283" stroke="#56ac74" />
        </g>
        <g className="board-buildings">
          <path
            d="M439 296l11 -10l11 10v19h-22Z"
            fill="#e56550"
            stroke="#fff0ca"
            strokeWidth="3"
          />
          <path
            d="M344 420l10 -10l10 10v17h-20Z"
            fill="#4b93dc"
            stroke="#fff0ca"
            strokeWidth="3"
          />
          <path
            d="M583 246l10 -10l10 10v17h-20Z"
            fill="#4ea66b"
            stroke="#fff0ca"
            strokeWidth="3"
          />
          <path
            d="M390 454l10 -10l10 10v17h-20Z"
            fill="#e56550"
            stroke="#fff0ca"
            strokeWidth="3"
          />
        </g>
        <g
          className="ports"
          fontFamily="inherit"
          fontWeight="800"
          fontSize="14"
          textAnchor="middle"
        >
          <g>
            <circle cx="450" cy="59" r="23" />
            <text x="450" y="64">
              3:1
            </text>
          </g>
          <g>
            <circle cx="710" cy="235" r="23" />
            <text x="710" y="240">
              2:1
            </text>
          </g>
          <g>
            <circle cx="195" cy="490" r="23" />
            <text x="195" y="495">
              3:1
            </text>
          </g>
          <g>
            <circle cx="665" cy="510" r="23" />
            <text x="665" y="515">
              3:1
            </text>
          </g>
        </g>
        {rolled && (
          <g className="rolled-dice">
            <rect
              x="386"
              y="578"
              width="128"
              height="53"
              rx="15"
              fill="#fff8e7"
              stroke="#ba8d4e"
              strokeWidth="4"
            />
            <text
              x="450"
              y="612"
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill="#1a4163"
            >
              Roll {rolled}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function colorClass(color: PlayerColor) {
  return `color-${color}`;
}

export default function BoardPreview({
  room,
  onBack,
  onCopy,
}: {
  room: RoomView | null;
  onBack: () => void;
  onCopy: () => void;
}) {
  const [rolled, setRolled] = useState<number | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([
    "A new island is ready for your table.",
  ]);
  const demoPlayers = room?.players.length
    ? room.players
    : [
        {
          id: "faizan",
          name: "Faizan",
          color: "coral" as PlayerColor,
          ready: true,
        },
        { id: "sam", name: "Sam", color: "sky" as PlayerColor, ready: true },
        { id: "ari", name: "Ari", color: "mint" as PlayerColor, ready: true },
        {
          id: "mina",
          name: "Mina",
          color: "violet" as PlayerColor,
          ready: true,
        },
      ];
  const currentPlayer = demoPlayers[turnIndex % demoPlayers.length];

  function rollDice() {
    const value = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
    setRolled(value);
    setEvents((current) =>
      [`${currentPlayer.name} rolled ${value}.`, ...current].slice(0, 8),
    );
  }

  function endTurn() {
    setTurnIndex((current) => current + 1);
    setRolled(null);
    setEvents((current) =>
      [`${currentPlayer.name} ended their turn.`, ...current].slice(0, 8),
    );
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatDraft.trim()) return;
    setMessages((current) => [...current, chatDraft.trim()].slice(-20));
    setChatDraft("");
  }

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <button type="button" className="game-back" onClick={onBack}>
          <ArrowLeft size={19} /> Rooms
        </button>
        <div className="game-brand">HARBOR TABLE</div>
        <span className="game-room-name">
          {room ? `Room ${room.code}` : "Board preview"}
        </span>
        <span className="game-base-label">Base game · 10 points</span>
        <div className="game-top-actions">
          {room && (
            <button type="button" onClick={onCopy} title="Copy invite">
              <Copy size={18} />
            </button>
          )}
          <span>
            TURN {turnIndex + 1} / {currentPlayer.name.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="game-main">
        <section className="game-board-area">
          <div className="turn-callout">
            <strong>{room ? "LOCAL MATCH PREVIEW" : "BOARD PREVIEW"}</strong>
            <span>
              {currentPlayer.name}'s turn ·{" "}
              {rolled ? `Rolled ${rolled}` : "Roll the dice"}
            </span>
          </div>
          <IslandBoard rolled={rolled} />
          <div className="board-preview-note">
            <BookOpen size={17} /> Sample board and interactions while the
            complete rules are being connected.
          </div>
        </section>
        <aside className="game-aside">
          <h2>TURN ORDER</h2>
          <div className="turn-list">
            {demoPlayers.map((player, index) => (
              <div
                className={`turn-player ${index === turnIndex % demoPlayers.length ? "current" : ""}`}
                key={player.id}
              >
                <span className={`turn-avatar ${colorClass(player.color)}`}>
                  {player.name.charAt(0)}
                </span>
                <div>
                  <strong>{player.name}</strong>
                  <small>
                    {index === turnIndex % demoPlayers.length
                      ? "Active turn"
                      : "Waiting"}{" "}
                    · {index === 0 ? 2 : 0} points
                  </small>
                </div>
                {index === turnIndex % demoPlayers.length && (
                  <span className="turn-indicator" />
                )}
              </div>
            ))}
          </div>
          <h2>ACTIVITY</h2>
          <div className="activity-list">
            {events.map((event, index) => (
              <p key={`${index}-${event}`}>{event}</p>
            ))}
          </div>
          <h2>BANK & PORTS</h2>
          <div className="bank-preview">
            <strong>Resources available: 19 each</strong>
            <span>Trade rates depend on your ports.</span>
          </div>
          <div className="aside-chat-title">
            <MessageCircle size={16} />
            <strong>CHAT</strong>
          </div>
          <div className="game-chat">
            <div>
              {messages.length ? (
                messages.map((message, index) => (
                  <p key={index}>
                    <strong>You:</strong> {message}
                  </p>
                ))
              ) : (
                <span>Plan your next move together.</span>
              )}
            </div>
            <form onSubmit={sendMessage}>
              <input
                aria-label="Game chat message"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Send a message"
              />
              <button
                type="submit"
                disabled={!chatDraft.trim()}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </aside>
      </div>
      <div className="game-toolbar">
        <div className="resource-hand">
          <span className="toolbar-label">YOUR HAND · 8 CARDS</span>
          <div className="resource-cards">
            {resourceCards.map((card) => (
              <div
                className={`resource-card resource-${card.key}`}
                key={card.key}
              >
                <span className="resource-symbol">{card.symbol}</span>
                <strong>{card.label}</strong>
                <em>{card.count}</em>
              </div>
            ))}
          </div>
        </div>
        <div className="game-actions">
          <span className="toolbar-label">ACTIONS</span>
          <div>
            <button
              className="button game-roll"
              type="button"
              onClick={rollDice}
            >
              <Dice5 size={20} /> Roll dice
            </button>
            <button
              className="button game-trade"
              type="button"
              onClick={() => setDrawer("trade")}
            >
              <ShoppingBasket size={19} /> Trade
            </button>
            <button
              className="button game-build"
              type="button"
              onClick={() => setDrawer("build")}
            >
              <Hammer size={19} /> Build
            </button>
            <button className="button game-end" type="button" onClick={endTurn}>
              <RotateCcw size={19} /> End turn
            </button>
          </div>
        </div>
      </div>
      {drawer && (
        <div
          className="game-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawer(null);
          }}
        >
          <div
            className="game-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={drawer === "build" ? "Build options" : "Trade options"}
          >
            <div className="drawer-heading">
              <h2>{drawer === "build" ? "Build" : "Trade"}</h2>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            {drawer === "build" ? (
              <>
                <p>Use resources to expand your place on the island.</p>
                <div className="drawer-option">
                  <strong>Road</strong>
                  <span>1 wood · 1 brick</span>
                </div>
                <div className="drawer-option">
                  <strong>Settlement</strong>
                  <span>1 wood · 1 brick · 1 wool · 1 grain</span>
                </div>
                <div className="drawer-option">
                  <strong>City</strong>
                  <span>2 grain · 3 ore</span>
                </div>
              </>
            ) : (
              <>
                <p>
                  Bank and player trades appear here during a complete match.
                </p>
                <div className="drawer-option">
                  <strong>Bank trade</strong>
                  <span>Four matching resources for one chosen resource.</span>
                </div>
                <div className="drawer-option">
                  <strong>Friend trade</strong>
                  <span>Make an offer to another player on your turn.</span>
                </div>
              </>
            )}
            <button
              className="button primary full-width"
              type="button"
              onClick={() => setDrawer(null)}
            >
              Close preview <Check size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
