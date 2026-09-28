import type { GameCommand, GameView } from "../../engine/index.ts";
import type { RoomView } from "../room/roomService.ts";
import { createSupabaseMatchClient } from "./supabaseMatch.ts";

/** A player command. The adapter supplies the authenticated actor ID. */
export type MatchCommand = { type: "expire-turn" } | (GameCommand extends infer Command
  ? Command extends GameCommand
    ? Omit<Command, "actorId">
    : never
  : never);

export interface MatchClient {
  /** Reads only this player's projected state. */
  load(): Promise<GameView>;
  /** Applies one move and returns the latest projected state. */
  command(command: MatchCommand): Promise<GameView>;
  /** Signals that a fresh load may be useful; never carries game secrets. */
  subscribe(callback: () => void, onStatus?: (status: "live" | "reconnecting") => void): () => void;
}

export function createMatchClient(room: RoomView, selfId: string): MatchClient {
  if (room.status !== "in_game" && room.status !== "completed") {
    throw new Error("Start a match before opening the board.");
  }
  if (!room.players.some((player) => player.id === selfId)) {
    throw new Error("Join the room before opening its match.");
  }
  return createSupabaseMatchClient(room, selfId);
}
