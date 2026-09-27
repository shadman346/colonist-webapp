import {
  applyGameCommand,
  createGame,
  createSecureBoardSeed,
  createShuffledDevelopmentDeck,
  projectGame,
  randomOutcomeForCommand,
  webCryptoRandomSource,
  type GameCommand,
  type GameState,
  type GameView,
} from "../../engine/index.ts";
import { completeRoom, readRoom, type RoomView } from "../room/localRoom.ts";
import type { MatchClient, MatchCommand } from "./matchService.ts";

const PREFIX = "harbor-table-match-v1:";
const CHANNEL = "harbor-table-match-events";

interface StoredMatch {
  gameId: string;
  roomCode: string;
  revision: number;
  state: GameState;
}

function gameIdFor(room: RoomView): string {
  // Old browser preview rooms may predate gameId. New starts always have one.
  return room.gameId ?? `legacy:${room.code}:${room.createdAt}`;
}

function key(gameId: string): string {
  return `${PREFIX}${gameId}`;
}

function read(gameId: string): StoredMatch | null {
  const raw = localStorage.getItem(key(gameId));
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredMatch;
    return stored.gameId === gameId && stored.state?.version === 1 ? stored : null;
  } catch {
    return null;
  }
}

function notify(gameId: string): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ gameId });
    channel.close();
  } catch {
    // Storage events are a fallback for other tabs.
  }
}

function write(stored: StoredMatch): void {
  localStorage.setItem(key(stored.gameId), JSON.stringify(stored));
  notify(stored.gameId);
}

async function locked<T>(gameId: string, work: () => T | Promise<T>): Promise<T> {
  // Web Locks serialize commands across tabs in the browser-only preview.
  // This remains a local fixture, not a trusted multiplayer backend.
  if (navigator.locks?.request) {
    return navigator.locks.request(`harbor-table:${gameId}`, work);
  }
  return work();
}

function currentRoom(room: RoomView, gameId: string): RoomView {
  const latest = readRoom(room.code);
  if (!latest || gameIdFor(latest) !== gameId) {
    throw new Error("This match is no longer current. Return to the room.");
  }
  return latest;
}

function initialize(room: RoomView, gameId: string): StoredMatch {
  const latest = currentRoom(room, gameId);
  if (latest.status !== "in_game") {
    throw new Error("This match has not started.");
  }
  // Canonical state is intentionally kept in this browser for the local
  // preview. Hosted play reads only per-player projections from Supabase.
  const state = createGame({
    players: latest.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
    })),
    seed: createSecureBoardSeed(),
    developmentDeck: createShuffledDevelopmentDeck(webCryptoRandomSource()),
    victoryPointsToWin: latest.settings.pointsToWin,
  });
  const stored = { gameId, roomCode: latest.code, revision: 0, state };
  write(stored);
  return stored;
}

async function loadStored(room: RoomView, gameId: string): Promise<StoredMatch> {
  return locked(gameId, () => read(gameId) ?? initialize(room, gameId));
}

function subscribe(gameId: string, callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key(gameId)) callback();
  };
  window.addEventListener("storage", onStorage);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<{ gameId?: string }>) => {
      if (event.data?.gameId === gameId) callback();
    };
  } catch {
    // Storage listener remains available.
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}

export function createLocalMatchClient(room: RoomView, selfId: string): MatchClient {
  const gameId = gameIdFor(room);
  return {
    async load(): Promise<GameView> {
      const stored = await loadStored(room, gameId);
      return projectGame(stored.state, selfId);
    },
    async command(command: MatchCommand): Promise<GameView> {
      return locked(gameId, () => {
        const latestRoom = currentRoom(room, gameId);
        if (latestRoom.status !== "in_game") {
          throw new Error("This match is already complete.");
        }
        if (!latestRoom.players.some((player) => player.id === selfId)) {
          throw new Error("You are no longer a member of this match.");
        }
        const stored = read(gameId) ?? initialize(room, gameId);
        const engineCommand = { ...command, actorId: selfId } as GameCommand;
        const outcome = randomOutcomeForCommand(
          stored.state,
          engineCommand,
          webCryptoRandomSource(),
        );
        const next = applyGameCommand(stored.state, engineCommand, outcome);
        write({ ...stored, revision: stored.revision + 1, state: next });
        if (next.phase === "completed") completeRoom(room.code, gameId);
        return projectGame(next, selfId);
      });
    },
    subscribe(callback): () => void {
      return subscribe(gameId, callback);
    },
  };
}
