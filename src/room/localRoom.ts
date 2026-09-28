export type PlayerColor = "coral" | "sky" | "mint" | "violet" | "gold" | "teal";
export type RoomStatus = "waiting" | "in_game" | "completed" | "closed";

export interface RoomPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  ready: boolean;
  joinedAt: number;
}

export interface RoomSettings {
  maxPlayers: 3 | 4 | 5 | 6;
  pointsToWin: 10;
  turnTimerSeconds: 60 | 90 | 120 | 180 | null;
  mode: "base";
  map: "base" | "large";
  private: true;
}

export interface ChatLine {
  id: string;
  playerId: string;
  name: string;
  text: string;
  sentAt: number;
}

export interface RoomView {
  roomId?: string;
  gameId?: string;
  blockedIds?: string[];
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: RoomPlayer[];
  chat: ChatLine[];
  revision: number;
  createdAt: number;
}

export interface LocalIdentity {
  id: string;
  name: string;
}

const STORAGE_PREFIX = "harbor-table-room-v1:";
const IDENTITY_KEY = "harbor-table-identity-v1";
const CHANNEL_NAME = "harbor-table-room-events";
const COLORS: PlayerColor[] = ["coral", "sky", "mint", "violet", "gold", "teal"];
const CODE_ALPHABET = "0123456789ABCDEF";

function roomKey(code: string): string {
  return `${STORAGE_PREFIX}${code.toUpperCase()}`;
}

export function normalizeCode(value: string): string {
  return value
    .replace(/[^a-z\d]/gi, "")
    .toUpperCase()
    .slice(0, 16);
}

export function roomLink(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

export function getIdentity(): LocalIdentity {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalIdentity;
      if (parsed.id) return parsed;
    }
  } catch {
    // A new local identity will be made below.
  }
  const identity = { id: crypto.randomUUID(), name: "" };
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function saveIdentity(name: string): LocalIdentity {
  const current = getIdentity();
  const identity = { ...current, name: name.trim().slice(0, 24) || "Guest" };
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function readRoom(code: string): RoomView | null {
  try {
    const raw = localStorage.getItem(roomKey(code));
    return raw ? (JSON.parse(raw) as RoomView) : null;
  } catch {
    return null;
  }
}

function notify(code: string) {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ code });
    channel.close();
  } catch {
    // Storage events still update other tabs where BroadcastChannel is unavailable.
  }
}

function writeRoom(room: RoomView): RoomView {
  localStorage.setItem(roomKey(room.code), JSON.stringify(room));
  notify(room.code);
  return room;
}

export function onRoomChange(code: string, callback: () => void): () => void {
  const storageHandler = (event: StorageEvent) => {
    if (event.key === roomKey(code)) callback();
  };
  window.addEventListener("storage", storageHandler);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<{ code: string }>) => {
      if (event.data?.code === code) callback();
    };
  } catch {
    // The storage listener remains available.
  }
  return () => {
    window.removeEventListener("storage", storageHandler);
    channel?.close();
  };
}

function generateCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(values, (value) =>
    CODE_ALPHABET[value >>> 4] + CODE_ALPHABET[value & 15],
  ).join("");
}

export function createRoom(identity: LocalIdentity): RoomView {
  let code = generateCode();
  while (readRoom(code)) code = generateCode();
  return writeRoom({
    code,
    hostId: identity.id,
    status: "waiting",
    settings: {
      maxPlayers: 4,
      pointsToWin: 10,
      turnTimerSeconds: 90,
      mode: "base",
      map: "base",
      private: true,
    },
    players: [
      {
        id: identity.id,
        name: identity.name,
        color: "coral",
        ready: true,
        joinedAt: Date.now(),
      },
    ],
    chat: [],
    revision: 1,
    createdAt: Date.now(),
  });
}

export class RoomActionError extends Error {}

export function joinRoom(codeInput: string, identity: LocalIdentity): RoomView {
  const code = normalizeCode(codeInput);
  const room = readRoom(code);
  if (!room)
    throw new RoomActionError("Room not found. Check the code and try again.");
  if (room.blockedIds?.includes(identity.id))
    throw new RoomActionError("You cannot rejoin this room.");
  if (room.players.some((player) => player.id === identity.id)) return room;
  if (room.status !== "waiting" && room.status !== "completed")
    throw new RoomActionError("This game has already started.");
  if (room.players.length >= room.settings.maxPlayers)
    throw new RoomActionError("This room is full.");
  const usedColors = new Set(room.players.map((player) => player.color));
  const color =
    COLORS.find((candidate) => !usedColors.has(candidate)) ?? "teal";
  return writeRoom({
    ...room,
    players: [
      ...room.players,
      {
        id: identity.id,
        name: identity.name,
        color,
        ready: false,
        joinedAt: Date.now(),
      },
    ],
    revision: room.revision + 1,
  });
}

function mutateRoom(
  code: string,
  update: (room: RoomView) => RoomView,
): RoomView {
  const current = readRoom(code);
  if (!current) throw new RoomActionError("Room not found.");
  const next = update(current);
  return writeRoom({ ...next, revision: current.revision + 1 });
}

export function updateSeats(
  code: string,
  actorId: string,
  maxPlayers: 3 | 4 | 5 | 6,
): RoomView {
  return mutateRoom(code, (room) => {
    if (room.hostId !== actorId)
      throw new RoomActionError("Only the host can change room settings.");
    if (room.status !== "waiting" && room.status !== "completed")
      throw new RoomActionError("This game has already started.");
    if (room.players.length > maxPlayers)
      throw new RoomActionError(
        "There are too many players for that seat count.",
      );
    if (room.settings.maxPlayers === maxPlayers) return room;
    return {
      ...room,
      settings: { ...room.settings, maxPlayers, map: maxPlayers >= 5 ? "large" : "base" },
      players: room.players.map((player) => ({
        ...player,
        ready: player.id === room.hostId,
      })),
    };
  });
}

export function updateTurnTimer(code: string, actorId: string, seconds: 60 | 90 | 120 | 180): RoomView {
  return mutateRoom(code, (room) => {
    if (room.hostId !== actorId || !["waiting", "completed"].includes(room.status))
      throw new RoomActionError("Only the host can change the timer before a match.");
    if (![60, 90, 120, 180].includes(seconds))
      throw new RoomActionError("Choose a valid turn timer.");
    if (room.settings.turnTimerSeconds === seconds) return room;
    return {
      ...room,
      settings: { ...room.settings, turnTimerSeconds: seconds },
      players: room.players.map((player) => ({ ...player, ready: player.id === room.hostId })),
    };
  });
}

export function setReady(
  code: string,
  actorId: string,
  ready: boolean,
): RoomView {
  return mutateRoom(code, (room) => {
    if (room.status !== "waiting" && room.status !== "completed")
      throw new RoomActionError("This game has already started.");
    if (!room.players.some((player) => player.id === actorId))
      throw new RoomActionError("You are not in this room.");
    return {
      ...room,
      players: room.players.map((player) =>
        player.id === actorId ? { ...player, ready } : player,
      ),
    };
  });
}

export function canStart(room: RoomView): boolean {
  return (
    (room.status === "waiting" || room.status === "completed") &&
    room.players.length >= (room.settings.maxPlayers >= 5 ? 5 : 3) &&
    room.players.every((player) => player.ready)
  );
}

export function startRoom(code: string, actorId: string): RoomView {
  return mutateRoom(code, (room) => {
    if (room.hostId !== actorId)
      throw new RoomActionError("Only the host can start the game.");
    if (!canStart(room))
      throw new RoomActionError(
        "Wait for at least three players and for everyone to be ready.",
      );
    return { ...room, status: "in_game", gameId: crypto.randomUUID() };
  });
}

export function completeRoom(code: string, gameId: string): void {
  const room = readRoom(code);
  if (!room || room.status !== "in_game" || room.gameId !== gameId) return;
  writeRoom({
    ...room,
    status: "completed",
    players: room.players.map((player) => ({
      ...player,
      ready: player.id === room.hostId,
    })),
    revision: room.revision + 1,
  });
}

export function kickMember(code: string, actorId: string, userId: string): RoomView {
  return mutateRoom(code, (room) => {
    if (room.hostId !== actorId || !["waiting", "completed"].includes(room.status))
      throw new RoomActionError("Only the host can remove a friend before or between games.");
    if (userId === actorId || !room.players.some((player) => player.id === userId))
      throw new RoomActionError("That player is no longer in the room.");
    return {
      ...room,
      blockedIds: [...(room.blockedIds ?? []), userId],
      players: room.players.filter((player) => player.id !== userId),
    };
  });
}

export function leaveRoom(code: string, actorId: string): RoomView {
  return mutateRoom(code, (room) => {
    if (room.status !== "waiting" && room.status !== "completed")
      throw new RoomActionError("Finish this match before leaving the room.");
    const players = room.players.filter((player) => player.id !== actorId);
    const hostId =
      room.hostId === actorId ? (players[0]?.id ?? "") : room.hostId;
    return {
      ...room,
      hostId,
      players: players.map((player) => ({
        ...player,
        ready: player.id === hostId,
      })),
      status: players.length ? room.status : "closed",
    };
  });
}

export function sendChat(
  code: string,
  actorId: string,
  text: string,
): RoomView {
  return mutateRoom(code, (room) => {
    const player = room.players.find((candidate) => candidate.id === actorId);
    if (!player)
      throw new RoomActionError("Join this room before sending a message.");
    const message = text.trim();
    if (!message || message.length > 500)
      throw new RoomActionError("Write a message of up to 500 characters.");
    if (room.chat.some((line) =>
      line.playerId === actorId && line.sentAt > Date.now() - 3000))
      throw new RoomActionError("Please wait a moment before sending another message.");
    return {
      ...room,
      chat: [
        ...room.chat.slice(-99),
        {
          id: crypto.randomUUID(),
          playerId: actorId,
          name: player.name,
          text: message,
          sentAt: Date.now(),
        },
      ],
    };
  });
}
