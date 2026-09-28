import type { GameView } from "../../engine/index.ts";
import type { RoomView } from "../room/localRoom.ts";
import {
  authenticatedActor,
  getClient,
  onRoomChange,
} from "../room/supabaseRoom.ts";
import type { MatchClient, MatchCommand } from "./matchService.ts";

type GameCommandBody = {
  actionId: string;
  gameId: string;
  expectedRevision: number;
  command: Record<string, unknown>;
};

type GameCommandResponse = {
  gameId: string;
  roomId: string;
  revision: number;
  status: "active" | "completed";
};

type GameViewRow = {
  game_id: string;
  room_id: string;
  user_id: string;
  revision: number;
  view: GameView;
};

export class MatchActionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  STALE_REVISION: "The board changed. Its latest state is loading; try that move again.",
  NOT_GAME_MEMBER: "You are no longer a member of this match.",
  GAME_COMPLETED: "This match is complete.",
  ACTION_ID_REUSED: "This move could not be retried. Reload the board.",
  INVALID_COMMAND: "This move is not valid.",
  ORIGIN_NOT_ALLOWED: "This web address is not enabled for match requests.",
  UNAUTHENTICATED: "Your session expired. Reload the page and try again.",
  TURN_EXPIRED: "Time ran out. The next turn is loading.",
  TIMER_NOT_EXPIRED: "The timer is still running.",
};

async function actorFor(selfId: string): Promise<string> {
  const actor = await authenticatedActor();
  if (actor !== selfId) {
    throw new MatchActionError(
      "Your session changed. Return to the room and reload the board.",
      "ACTOR_CHANGED",
    );
  }
  return actor;
}

async function resolveGameId(room: RoomView): Promise<string> {
  if (room.gameId) return room.gameId;
  if (!room.roomId) {
    throw new MatchActionError("The room ID is missing. Reload the room.");
  }
  const { data, error } = await getClient()
    .from("games")
    .select("id")
    .eq("room_id", room.roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) {
    throw new MatchActionError(error?.message ?? "This match is not available yet.");
  }
  return String(data.id);
}

async function readView(
  room: RoomView,
  selfId: string,
  gameId: string,
): Promise<GameViewRow> {
  await actorFor(selfId);
  const { data, error } = await getClient()
    .from("game_views")
    .select("game_id,room_id,user_id,revision,view")
    .eq("game_id", gameId)
    .eq("user_id", selfId)
    .single();
  if (error || !data) {
    throw new MatchActionError(
      error?.message ?? "Your match view is not available yet.",
    );
  }
  const row = data as GameViewRow;
  if (row.game_id !== gameId || row.user_id !== selfId ||
      (room.roomId && row.room_id !== room.roomId) ||
      row.view?.self?.id !== selfId || row.view?.version !== 1 ||
      !Number.isSafeInteger(Number(row.revision))) {
    throw new MatchActionError("The match server returned an invalid player view.");
  }
  return row;
}

async function invoke(body: GameCommandBody): Promise<GameCommandResponse> {
  const send = () => getClient().functions.invoke<GameCommandResponse>(
    "game-command",
    { body },
  );
  const safeSend = async () => {
    try {
      return await send();
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  };
  let result = await safeSend();
  // The first response can be lost after a successful commit. Ask the server
  // for the receipt with the same action ID before reporting an unknown result.
  if (result.error && !(result.error as { context?: { status?: number } }).context?.status) {
    result = await safeSend();
  }
  if (result.error) {
    const context = (result.error as { context?: Response }).context;
    let code = "";
    if (context && typeof context.json === "function") {
      try {
        code = ((await context.json()) as { error?: string }).error ?? "";
      } catch {
        // The original network error remains useful.
      }
    }
    throw new MatchActionError(
      messages[code] ?? result.error.message,
      code || undefined,
      !context?.status,
    );
  }
  const data = result.data;
  if (!data || data.gameId !== body.gameId ||
      !Number.isSafeInteger(Number(data.revision))) {
    throw new MatchActionError(
      "The match server returned an incomplete move receipt.",
      undefined,
      true,
    );
  }
  return data;
}

/**
 * Hosted play never loads the canonical game state. RLS restricts the read to
 * this player's row, whose projection omits opponents' hands and hidden cards.
 */
export function createSupabaseMatchClient(room: RoomView, selfId: string): MatchClient {
  let revision: number | null = null;
  let pending: {
    key: string;
    body: GameCommandBody;
    response: GameCommandResponse | null;
  } | null = null;

  async function load(): Promise<GameView> {
    const gameId = await resolveGameId(room);
    const row = await readView(room, selfId, gameId);
    revision = Number(row.revision);
    return row.view;
  }

  return {
    load,
    async command(command: MatchCommand): Promise<GameView> {
      await actorFor(selfId);
      const gameId = await resolveGameId(room);
      // A caller cannot impersonate a player, even if plain JavaScript passes
      // an actorId despite the MatchCommand TypeScript type.
      const payload: Record<string, unknown> = { ...command };
      delete payload.actorId;
      const key = JSON.stringify(payload);
      if (pending && pending.key !== key) {
        throw new MatchActionError(
          "The previous move may still be saving. Retry that move first.",
          "MOVE_PENDING",
          true,
        );
      }
      if (!pending) {
        if (revision === null) await load();
        pending = {
          key,
          body: {
            actionId: crypto.randomUUID(),
            gameId,
            expectedRevision: revision!,
            command: payload,
          },
          response: null,
        };
      }
      try {
        if (!pending.response) pending.response = await invoke(pending.body);
      } catch (error) {
        if (!(error instanceof MatchActionError && error.outcomeUnknown)) {
          pending = null;
          if (error instanceof MatchActionError && error.code === "STALE_REVISION") {
            revision = null;
          }
        }
        throw error;
      }
      try {
        let view = await load();
        if (revision! < pending.response.revision) view = await load();
        if (revision! < pending.response.revision) {
          throw new Error("Player view has not reached the committed revision.");
        }
        pending = null;
        return view;
      } catch {
        // The committed receipt is retained, so a user retry only reloads the
        // own-player view; it never applies the move twice.
        throw new MatchActionError(
          "Your move was saved, but the board could not load. Retry the move to recover it.",
          "VIEW_LOAD_FAILED",
          true,
        );
      }
    },
    subscribe(callback, onStatus): () => void {
      return onRoomChange(room.code, callback, onStatus, 2_000);
    },
  };
}
