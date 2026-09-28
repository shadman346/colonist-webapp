import { useState, type FormEvent } from "react";
import PreviewIsland from "./PreviewIsland";
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

type Terrain = "wood" | "wool" | "grain" | "brick" | "ore";
type Drawer = "build" | "trade" | null;

const resourceCards: { key: Terrain; label: string; count: number }[] = [
  { key: "wood", label: "Wood", count: 2 },
  { key: "wool", label: "Wool", count: 2 },
  { key: "brick", label: "Brick", count: 1 },
  { key: "grain", label: "Grain", count: 3 },
  { key: "ore", label: "Ore", count: 0 },
];
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
          <PreviewIsland rolled={rolled} />
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
            <div className="bank-resource-cards" aria-label="Bank resource cards">
              {resourceCards.map((card) => (
                <img
                  key={card.key}
                  src={`/assets/colonist/base/png/card-${card.key}@2x.png`}
                  alt={card.label}
                />
              ))}
            </div>
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
          <div className="resource-cards" aria-label="Your resource cards">
            {resourceCards.filter((card) => card.count > 0).map((card) => (
              <div
                className="resource-card"
                key={card.key}
                role="img"
                aria-label={`${card.count} ${card.label} cards`}
              >
                <img src={`/assets/colonist/base/png/card-${card.key}@2x.png`} alt="" />
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
