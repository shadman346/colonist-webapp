import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameView } from "../../engine/index.ts";
import type { RoomView } from "../room/localRoom.ts";

const actor = "00000000-0000-0000-0000-000000000001";
const roomId = "00000000-0000-0000-0000-000000000002";
const gameId = "00000000-0000-0000-0000-000000000003";
const mock = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));

vi.mock("../room/supabaseRoom.ts", () => ({
  authenticatedActor: async () => actor,
  getClient: () => ({
    functions: { invoke: mock.invoke },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        single: mock.read,
      };
      return query;
    },
  }),
  onRoomChange: () => () => {},
}));

const room = {
  roomId,
  gameId,
  code: "A1B2C3D4E5F60718",
  hostId: actor,
  status: "in_game",
  players: [{ id: actor }],
} as RoomView;

function ownView(revision: number): { data: unknown; error: null } {
  const view = { version: 1, self: { id: actor } } as GameView;
  return {
    data: { game_id: gameId, room_id: roomId, user_id: actor, revision, view },
    error: null,
  };
}

describe("Supabase player match adapter", () => {
  beforeEach(() => {
    mock.invoke.mockReset();
    mock.read.mockReset();
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  });

  it("reads only the caller's game view and sends commands without actorId", async () => {
    mock.read.mockResolvedValueOnce(ownView(0)).mockResolvedValueOnce(ownView(1));
    mock.invoke.mockResolvedValue({
      data: { gameId, roomId, revision: 1, status: "active" }, error: null,
    });
    const { createSupabaseMatchClient } = await import("./supabaseMatch.ts");
    const client = createSupabaseMatchClient(room, actor);
    expect((await client.load()).self.id).toBe(actor);
    const next = await client.command({ type: "roll", actorId: "someone-else" } as never);
    expect(next.self.id).toBe(actor);
    const body = mock.invoke.mock.calls[0]![1].body;
    expect(body.expectedRevision).toBe(0);
    expect(body.command).toEqual({ type: "roll" });
  });

  it("reuses the same action ID after uncertain transport failures", async () => {
    mock.read.mockResolvedValueOnce(ownView(0)).mockResolvedValueOnce(ownView(1));
    mock.invoke
      .mockResolvedValueOnce({ data: null, error: new Error("Network lost") })
      .mockResolvedValueOnce({ data: null, error: new Error("Network lost") })
      .mockResolvedValueOnce({
        data: { gameId, roomId, revision: 1, status: "active" }, error: null,
      });
    const { createSupabaseMatchClient, MatchActionError } = await import("./supabaseMatch.ts");
    const client = createSupabaseMatchClient(room, actor);
    await client.load();
    await expect(client.command({ type: "roll" })).rejects.toBeInstanceOf(MatchActionError);
    expect((await client.command({ type: "roll" })).self.id).toBe(actor);
    const IDs = mock.invoke.mock.calls.map((call) => call[1].body.actionId);
    expect(new Set(IDs).size).toBe(1);
    expect(IDs).toHaveLength(3);
  });

  it("reuses a committed receipt when its player view cannot load", async () => {
    mock.read
      .mockResolvedValueOnce(ownView(0))
      .mockResolvedValueOnce({ data: null, error: new Error("Read interrupted") })
      .mockResolvedValueOnce(ownView(1));
    mock.invoke.mockResolvedValue({
      data: { gameId, roomId, revision: 1, status: "active" }, error: null,
    });
    const { createSupabaseMatchClient } = await import("./supabaseMatch.ts");
    const client = createSupabaseMatchClient(room, actor);
    await client.load();
    await expect(client.command({ type: "roll" })).rejects.toThrow("move was saved");
    expect((await client.command({ type: "roll" })).self.id).toBe(actor);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it("waits for the player view to reach the committed revision", async () => {
    mock.read
      .mockResolvedValueOnce(ownView(0))
      .mockResolvedValueOnce(ownView(0))
      .mockResolvedValueOnce(ownView(1));
    mock.invoke.mockResolvedValue({
      data: { gameId, roomId, revision: 1, status: "active" }, error: null,
    });
    const { createSupabaseMatchClient } = await import("./supabaseMatch.ts");
    const client = createSupabaseMatchClient(room, actor);
    await client.load();
    expect((await client.command({ type: "roll" })).self.id).toBe(actor);
    expect(mock.read).toHaveBeenCalledTimes(3);
  });

  it("rejects a view whose self ID does not match the authenticated player", async () => {
    mock.read.mockResolvedValue({
      data: {
        game_id: gameId, room_id: roomId, user_id: actor, revision: 0,
        view: { version: 1, self: { id: "another-player" } },
      },
      error: null,
    });
    const { createSupabaseMatchClient } = await import("./supabaseMatch.ts");
    await expect(createSupabaseMatchClient(room, actor).load())
      .rejects.toThrow("invalid player view");
  });
});
