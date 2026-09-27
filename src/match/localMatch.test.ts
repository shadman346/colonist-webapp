import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { RoomView } from "../room/localRoom.ts";
import { createLocalMatchClient } from "./localMatch.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const room: RoomView = {
  code: "A1B2C3D4E5F60718",
  gameId: "11111111-1111-4111-8111-111111111111",
  hostId: "alice",
  status: "in_game",
  settings: {
    maxPlayers: 3,
    pointsToWin: 10,
    turnTimerSeconds: null,
    mode: "base",
    map: "base",
    private: true,
  },
  players: [
    { id: "alice", name: "Alice", color: "coral", ready: true, joinedAt: 1 },
    { id: "bob", name: "Bob", color: "sky", ready: true, joinedAt: 2 },
    { id: "cara", name: "Cara", color: "mint", ready: true, joinedAt: 3 },
  ],
  chat: [],
  revision: 4,
  createdAt: 1,
};

describe("local match preview", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    const localStorage = new MemoryStorage();
    localStorage.setItem(`harbor-table-room-v1:${room.code}`, JSON.stringify(room));
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("navigator", {
      locks: { request: async (_name: string, work: () => unknown) => work() },
    });
    vi.stubGlobal("BroadcastChannel", class {
      postMessage(): void {}
      close(): void {}
    });
  });

  it("shares one initialized match and enforces player turns", async () => {
    const alice = createLocalMatchClient(room, "alice");
    const bob = createLocalMatchClient(room, "bob");
    const first = await alice.load();
    const other = await bob.load();
    expect(first.board).toEqual(other.board);
    expect(first.self.id).toBe("alice");
    expect(other.self.id).toBe("bob");
    expect(other.legal.setupSettlementVertices).toHaveLength(0);

    const vertexId = first.legal.setupSettlementVertices[0]!;
    const after = await alice.command({ type: "place-setup-settlement", vertexId });
    expect(after.phase).toBe("setup-road");
    expect(after.buildings[vertexId]?.ownerId).toBe("alice");
    expect((await bob.load()).buildings[vertexId]?.ownerId).toBe("alice");
    await expect(bob.command({ type: "place-setup-road", edgeId: after.legal.setupRoadEdges[0]! }))
      .rejects.toThrow();
    expect((await alice.load()).phase).toBe("setup-road");
  });

  it("keeps rematch state separate by game ID", async () => {
    const first = await createLocalMatchClient(room, "alice").load();
    const newer = { ...room, gameId: "22222222-2222-4222-8222-222222222222", revision: 8 };
    localStorage.setItem(`harbor-table-room-v1:${room.code}`, JSON.stringify(newer));
    const second = await createLocalMatchClient(newer, "alice").load();
    expect(first.phase).toBe("setup-settlement");
    expect(second.phase).toBe("setup-settlement");
    expect(localStorage.getItem(`harbor-table-match-v1:${room.gameId}`)).not.toBeNull();
    expect(localStorage.getItem(`harbor-table-match-v1:${newer.gameId}`)).not.toBeNull();
  });
});
