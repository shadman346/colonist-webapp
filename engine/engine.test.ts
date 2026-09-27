import { describe, expect, it, vi } from 'vitest';
import {
  applyGameCommand,
  createBaseBoard,
  createGame,
  createShuffledDevelopmentDeck,
  createSecureBoardSeed,
  legalRoadEdges,
  legalSetupRoadEdges,
  legalSetupSettlementVertices,
  longestRoadLength,
  projectGame,
  randomOutcomeForCommand,
  resourceTotal,
  seededRandom,
  webCryptoRandomSource,
  type GameState,
  type Resource,
} from './index.ts';

const PLAYERS = [
  { id: 'alice', name: 'Alice', color: 'red' },
  { id: 'bob', name: 'Bob', color: 'blue' },
  { id: 'cara', name: 'Cara', color: 'orange' },
] as const;

function testDeck(seed: string) {
  const random = seededRandom(`test-only:${seed}`);
  return createShuffledDevelopmentDeck({ int: (maxExclusive) => Math.floor(random() * maxExclusive) });
}

function newGame(seed = 'test-base-board', victoryPointsToWin = 10): GameState {
  return createGame({ players: [...PLAYERS], seed, developmentDeck: testDeck(seed), victoryPointsToWin });
}

function finishSetup(game = newGame()): GameState {
  let state = game;
  while (state.phase === 'setup-settlement' || state.phase === 'setup-road') {
    if (state.phase === 'setup-settlement') {
      const vertexId = legalSetupSettlementVertices(state)[0]!;
      state = applyGameCommand(state, { type: 'place-setup-settlement', actorId: state.activePlayerId, vertexId });
    } else {
      const edgeId = legalSetupRoadEdges(state)[0]!;
      state = applyGameCommand(state, { type: 'place-setup-road', actorId: state.activePlayerId, edgeId });
    }
  }
  return state;
}

function grant(state: GameState, playerId: string, resource: Resource, amount: number): void {
  state.bank[resource] -= amount;
  state.players.find((player) => player.id === playerId)!.resources[resource] += amount;
}

describe('Base board', () => {
  it('builds the canonical 19/54/72 graph and nine separate ports', () => {
    const board = createBaseBoard('geometry');
    expect(Object.keys(board.hexes)).toHaveLength(19);
    expect(Object.keys(board.vertices)).toHaveLength(54);
    expect(Object.keys(board.edges)).toHaveLength(72);
    expect(board.ports).toHaveLength(9);
    expect(new Set(board.ports.flatMap((port) => port.vertexIds)).size).toBe(18);
    expect(Object.values(board.hexes).filter((hex) => hex.terrain === 'desert')).toHaveLength(1);
    expect(Object.values(board.hexes).filter((hex) => hex.number === 6)).toHaveLength(2);
    expect(Object.values(board.hexes).filter((hex) => hex.number === 8)).toHaveLength(2);
  });

  it('is reproducible and separates red number tokens', () => {
    for (let i = 0; i < 25; i += 1) {
      const board = createBaseBoard(`seed-${i}`);
      expect(createBaseBoard(`seed-${i}`)).toEqual(board);
      const red = Object.values(board.hexes).filter((hex) => hex.number === 6 || hex.number === 8);
      for (const a of red) for (const b of red) if (a !== b) {
        const distance = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
        expect(distance).toBeGreaterThan(1);
      }
    }
  });

  it('requires a complete independent hidden deck at game creation', () => {
    const firstDeck = createShuffledDevelopmentDeck({ int: () => 0 });
    const secondDeck = createShuffledDevelopmentDeck({ int: (maxExclusive) => maxExclusive - 1 });
    const first = createGame({ players: [...PLAYERS], seed: 'same-public-board', developmentDeck: firstDeck });
    const second = createGame({ players: [...PLAYERS], seed: 'same-public-board', developmentDeck: secondDeck });
    expect(first.board).toEqual(second.board);
    expect(first.developmentDeck).not.toEqual(second.developmentDeck);
    expect(() => createGame({ players: [...PLAYERS], seed: 'bad-deck', developmentDeck: ['knight'] }))
      .toThrowError(/complete/);
  });

  it('bounds server random values and rejects a biased high word', () => {
    let words = 0;
    vi.stubGlobal('crypto', {
      getRandomValues(array: Uint8Array | Uint32Array) {
        if (array instanceof Uint32Array) array[0] = ++words === 1 ? 0xffffffff : 1;
        else array.set(Array.from({ length: 16 }, (_, index) => index));
        return array;
      },
    });
    try {
      const source = webCryptoRandomSource();
      expect(source.int(6)).toBe(1);
      expect(words).toBe(2);
      expect(source.int(1)).toBe(0);
      expect(createSecureBoardSeed()).toBe('000102030405060708090a0b0c0d0e0f');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('opening and commands', () => {
  it('uses forward/reverse opening order and only the second settlement yields starting resources', () => {
    let state = newGame();
    const observed: string[] = [];
    for (let placement = 0; placement < 6; placement += 1) {
      observed.push(state.activePlayerId);
      const vertexId = legalSetupSettlementVertices(state)[0]!;
      const before = resourceTotal(state.players.find((player) => player.id === state.activePlayerId)!.resources);
      state = applyGameCommand(state, { type: 'place-setup-settlement', actorId: state.activePlayerId, vertexId });
      const after = resourceTotal(state.players.find((player) => player.id === state.activePlayerId)!.resources);
      if (placement < 3) expect(after).toBe(before);
      else expect(after).toBeGreaterThanOrEqual(before);
      state = applyGameCommand(state, { type: 'place-setup-road', actorId: state.activePlayerId, edgeId: legalSetupRoadEdges(state)[0]! });
    }
    expect(observed).toEqual(['alice', 'bob', 'cara', 'cara', 'bob', 'alice']);
    expect(state.phase).toBe('pre-roll');
    expect(state.activePlayerId).toBe('alice');
  });

  it('rejects an invalid move without changing the input state', () => {
    const state = newGame();
    const snapshot = structuredClone(state);
    const vertexId = legalSetupSettlementVertices(state)[0]!;
    expect(() => applyGameCommand(state, { type: 'place-setup-settlement', actorId: 'bob', vertexId }))
      .toThrowError(/another player/);
    expect(state).toEqual(snapshot);
  });

  it('rejects an unknown runtime command instead of returning it as game state', () => {
    const state = newGame();
    expect(() => applyGameCommand(state, {
      type: 'unknown', actorId: 'alice',
    } as never)).toThrowError(/Unsupported command/);
  });

  it('does not offer a setup settlement that has no free road edge', () => {
    const state = newGame();
    const vertex = Object.values(state.board.vertices)[0]!;
    vertex.edgeIds.forEach((edgeId) => { state.roads[edgeId] = 'bob'; });
    expect(legalSetupSettlementVertices(state)).not.toContain(vertex.id);
  });

  it('requires a trusted dice result and resolves seven through discard then robber', () => {
    let state = finishSetup();
    expect(() => applyGameCommand(state, { type: 'roll', actorId: 'alice' })).toThrowError(/Trusted dice/);
    grant(state, 'bob', 'wood', 8);
    state = applyGameCommand(state, { type: 'roll', actorId: 'alice' }, { dice: [3, 4] });
    expect(state.phase).toBe('discard');
    expect(projectGame(state, 'bob').legal.discardCount).toBeGreaterThan(0);
    expect(projectGame(state, 'alice').legal.discardCount).toBe(0);
    const discard = { wood: state.pendingDiscards.bob!, brick: 0, wool: 0, grain: 0, ore: 0 };
    state = applyGameCommand(state, { type: 'discard', actorId: 'bob', resources: discard });
    expect(state.phase).toBe('robber-move');
    const hexId = Object.keys(state.board.hexes).find((id) => id !== state.robberHexId)!;
    state = applyGameCommand(state, { type: 'move-robber', actorId: 'alice', hexId });
    expect(['action', 'robber-steal']).toContain(state.phase);
  });

  it('uses a weighted server choice when stealing', () => {
    const state = finishSetup();
    const victim = state.players[1]!;
    victim.resources.wood = 2;
    state.bank.wood -= 2;
    victim.resources.ore = 1;
    state.bank.ore -= 1;
    const outcome = randomOutcomeForCommand(state, {
      type: 'choose-robber-victim', actorId: 'alice', victimId: 'bob',
    }, { int: () => 2 });
    expect(outcome.stolenResource).toBe('ore');
  });

  it('keeps other hands, card identities, deck and seed out of another player’s view', () => {
    const state = finishSetup(newGame('do-not-send-this-seed'));
    grant(state, 'bob', 'ore', 2);
    state.players[1]!.developmentCards.push({ id: 'secret-bob-card', type: 'victory-point', acquiredTurn: 0 });
    const view = projectGame(state, 'alice');
    expect(view.players.find((player) => player.id === 'bob')?.resourceCount).toBeGreaterThanOrEqual(2);
    expect(view.players.find((player) => player.id === 'bob')?.developmentCardCount).toBe(1);
    expect(view.players.find((player) => player.id === 'bob')?.publicPoints).toBe(2);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('do-not-send-this-seed');
    expect(serialized).not.toContain('secret-bob-card');
    expect(serialized).not.toContain('developmentDeck');
    expect(serialized).not.toContain('pendingDiscards');
    expect(view.self.id).toBe('alice');
  });
});

describe('building and scoring', () => {
  it('builds roads only along connected, open edges and charges resources', () => {
    let state = finishSetup();
    state = applyGameCommand(state, { type: 'roll', actorId: 'alice' }, { dice: [1, 1] });
    grant(state, 'alice', 'wood', 1);
    grant(state, 'alice', 'brick', 1);
    const edgeId = legalRoadEdges(state, 'alice')[0]!;
    const before = resourceTotal(state.players[0]!.resources);
    state = applyGameCommand(state, { type: 'build-road', actorId: 'alice', edgeId });
    expect(state.roads[edgeId]).toBe('alice');
    expect(resourceTotal(state.players[0]!.resources)).toBe(before - 2);
    grant(state, 'alice', 'wood', 1);
    grant(state, 'alice', 'brick', 1);
    expect(() => applyGameCommand(state, { type: 'build-road', actorId: 'alice', edgeId }))
      .toThrowError(/network/);
  });

  it('counts a road path, then truncates it at an opposing settlement', () => {
    const state = newGame();
    const start = Object.values(state.board.vertices)[0]!;
    const path: string[] = [];
    const vertices = [start.id];
    const used = new Set<string>();
    while (path.length < 5) {
      const current = state.board.vertices[vertices.at(-1)!]!;
      const nextEdge = current.edgeIds.find((id) => !used.has(id) &&
        !vertices.includes(state.board.edges[id]!.vertexIds.find((value) => value !== current.id)!));
      expect(nextEdge).toBeDefined();
      used.add(nextEdge!);
      path.push(nextEdge!);
      vertices.push(state.board.edges[nextEdge!]!.vertexIds.find((value) => value !== current.id)!);
    }
    path.forEach((id) => { state.roads[id] = 'alice'; });
    expect(longestRoadLength(state, 'alice')).toBe(5);
    state.buildings[vertices[2]!] = { ownerId: 'bob', level: 'settlement' };
    expect(longestRoadLength(state, 'alice')).toBe(3);
  });

  it('uses an occupied port immediately for bank trade', () => {
    let state = newGame();
    state.phase = 'action';
    state.turn = 1;
    const port = state.board.ports.find((candidate) => candidate.resource !== null)!;
    const give = port.resource!;
    const receive = (['wood', 'brick', 'wool', 'grain', 'ore'] as const).find((item) => item !== give)!;
    state.buildings[port.vertexIds[0]] = { ownerId: 'alice', level: 'settlement' };
    grant(state, 'alice', give, 2);
    const before = state.players[0]!.resources[receive];
    state = applyGameCommand(state, { type: 'bank-trade', actorId: 'alice', give, receive });
    expect(state.players[0]!.resources[give]).toBe(0);
    expect(state.players[0]!.resources[receive]).toBe(before + 1);
  });

  it('prevents scarce production for multiple claimants but pays the lone claimant what remains', () => {
    let state = newGame();
    state.phase = 'pre-roll';
    state.turn = 1;
    const hex = Object.values(state.board.hexes).find((item) => item.number === 2)!;
    const resource = hex.terrain as Resource;
    state.buildings[hex.vertexIds[0]!] = { ownerId: 'alice', level: 'settlement' };
    state.buildings[hex.vertexIds[2]!] = { ownerId: 'bob', level: 'settlement' };
    grant(state, 'cara', resource, 18);
    state = applyGameCommand(state, { type: 'roll', actorId: 'alice' }, { dice: [1, 1] });
    expect(state.players[0]!.resources[resource]).toBe(0);
    expect(state.players[1]!.resources[resource]).toBe(0);
    expect(state.bank[resource]).toBe(1);

    const solo = newGame();
    solo.phase = 'pre-roll';
    solo.turn = 1;
    const soloHex = Object.values(solo.board.hexes).find((item) => item.number === 2)!;
    const soloResource = soloHex.terrain as Resource;
    solo.buildings[soloHex.vertexIds[0]!] = { ownerId: 'alice', level: 'city' };
    grant(solo, 'cara', soloResource, 18);
    const after = applyGameCommand(solo, { type: 'roll', actorId: 'alice' }, { dice: [1, 1] });
    expect(after.players[0]!.resources[soloResource]).toBe(1);
    expect(after.bank[soloResource]).toBe(0);
  });

  it('executes a private direct trade and rejects an outdated offer', () => {
    let state = newGame();
    state.phase = 'action';
    state.turn = 1;
    grant(state, 'alice', 'wood', 2);
    grant(state, 'bob', 'ore', 1);
    state = applyGameCommand(state, {
      type: 'offer-trade', actorId: 'alice', toPlayerId: 'bob',
      give: { wood: 2, brick: 0, wool: 0, grain: 0, ore: 0 },
      want: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 1 },
    });
    const tradeId = state.pendingTrade!.id;
    expect(projectGame(state, 'cara').visibleTrade).toBeNull();
    expect(projectGame(state, 'bob').visibleTrade?.id).toBe(tradeId);
    state = applyGameCommand(state, { type: 'accept-trade', actorId: 'bob', tradeId });
    expect(state.players[0]!.resources.ore).toBe(1);
    expect(state.players[1]!.resources.wood).toBe(2);
    expect(() => applyGameCommand(state, { type: 'accept-trade', actorId: 'bob', tradeId }))
      .toThrowError(/no longer available/);
  });

  it('resolves progress cards before roll and allows only one action card per turn', () => {
    let state = finishSetup();
    state.players[0]!.developmentCards.push({ id: 'plenty', type: 'year-of-plenty', acquiredTurn: 0 });
    state.players[0]!.developmentCards.push({ id: 'monopoly', type: 'monopoly', acquiredTurn: 0 });
    const before = state.players[0]!.resources.ore;
    state = applyGameCommand(state, {
      type: 'play-year-of-plenty', actorId: 'alice', cardId: 'plenty', resources: ['ore', 'ore'],
    });
    expect(state.players[0]!.resources.ore).toBe(before + 2);
    expect(state.phase).toBe('pre-roll');
    expect(() => applyGameCommand(state, {
      type: 'play-monopoly', actorId: 'alice', cardId: 'monopoly', resource: 'wood',
    })).toThrowError(/Only one action/);
  });

  it('plays Road Building as two consecutive zero-cost placements', () => {
    let state = finishSetup();
    state.players[0]!.developmentCards.push({ id: 'roads', type: 'road-building', acquiredTurn: 0 });
    const before = structuredClone(state.players[0]!.resources);
    state = applyGameCommand(state, { type: 'play-road-building', actorId: 'alice', cardId: 'roads' });
    expect(state.phase).toBe('road-building');
    const first = legalRoadEdges(state, 'alice')[0]!;
    state = applyGameCommand(state, { type: 'build-road', actorId: 'alice', edgeId: first });
    expect(state.phase).toBe('road-building');
    const second = legalRoadEdges(state, 'alice')[0]!;
    state = applyGameCommand(state, { type: 'build-road', actorId: 'alice', edgeId: second });
    expect(state.phase).toBe('pre-roll');
    expect(state.players[0]!.resources).toEqual(before);
    expect(state.roads[first]).toBe('alice');
    expect(state.roads[second]).toBe('alice');
  });

  it('plays Monopoly and takes every opponent card of the chosen resource', () => {
    let state = finishSetup();
    state.players[0]!.developmentCards.push({ id: 'monopoly', type: 'monopoly', acquiredTurn: 0 });
    grant(state, 'bob', 'ore', 3);
    grant(state, 'cara', 'ore', 2);
    const before = state.players[0]!.resources.ore;
    const taken = state.players[1]!.resources.ore + state.players[2]!.resources.ore;
    state = applyGameCommand(state, { type: 'play-monopoly', actorId: 'alice', cardId: 'monopoly', resource: 'ore' });
    expect(state.players[0]!.resources.ore).toBe(before + taken);
    expect(state.players[1]!.resources.ore).toBe(0);
    expect(state.players[2]!.resources.ore).toBe(0);
  });

  it('retains Largest Army on a tie and transfers it on a strict lead', () => {
    let state = finishSetup();
    state.phase = 'pre-roll';
    state.activePlayerId = 'bob';
    state.turn = 2;
    state.largestArmyHolderId = 'alice';
    state.players[0]!.playedKnights = 3;
    state.players[1]!.playedKnights = 2;
    state.players[1]!.developmentCards.push({ id: 'knight-one', type: 'knight', acquiredTurn: 0 });
    state.players[1]!.developmentCards.push({ id: 'knight-two', type: 'knight', acquiredTurn: 0 });
    state = applyGameCommand(state, { type: 'play-knight', actorId: 'bob', cardId: 'knight-one' });
    expect(state.largestArmyHolderId).toBe('alice');
    state.phase = 'pre-roll';
    state.turn += 3;
    state.developmentPlayedThisTurn = false;
    state = applyGameCommand(state, { type: 'play-knight', actorId: 'bob', cardId: 'knight-two' });
    expect(state.largestArmyHolderId).toBe('bob');
  });

  it('counts a newly bought hidden VP card for an immediate win', () => {
    let state = finishSetup(newGame('vp-finish', 3));
    state = applyGameCommand(state, { type: 'roll', actorId: 'alice' }, { dice: [1, 1] });
    grant(state, 'alice', 'wool', 1);
    grant(state, 'alice', 'grain', 1);
    grant(state, 'alice', 'ore', 1);
    state.developmentDeck[state.developmentDeck.length - 1] = 'victory-point';
    state = applyGameCommand(state, { type: 'buy-development', actorId: 'alice' });
    expect(state.phase).toBe('completed');
    expect(state.winnerId).toBe('alice');
    expect(projectGame(state, 'bob').players.find((player) => player.id === 'alice')?.publicPoints).toBe(2);
    expect(projectGame(state, 'alice').self.totalPoints).toBe(3);
  });

  it('replays the same commands and trusted outcomes to the same state', () => {
    const initial = newGame('replay-seed');
    let first = initial;
    const trace: Array<{ command: Parameters<typeof applyGameCommand>[1]; outcome?: Parameters<typeof applyGameCommand>[2] }> = [];
    while (first.phase === 'setup-settlement' || first.phase === 'setup-road') {
      const command = first.phase === 'setup-settlement'
        ? { type: 'place-setup-settlement' as const, actorId: first.activePlayerId, vertexId: legalSetupSettlementVertices(first)[0]! }
        : { type: 'place-setup-road' as const, actorId: first.activePlayerId, edgeId: legalSetupRoadEdges(first)[0]! };
      trace.push({ command });
      first = applyGameCommand(first, command);
    }
    const roll = { type: 'roll' as const, actorId: 'alice' };
    trace.push({ command: roll, outcome: { dice: [1, 1] } });
    first = applyGameCommand(first, roll, { dice: [1, 1] });
    trace.push({ command: { type: 'end-turn', actorId: 'alice' } });
    first = applyGameCommand(first, { type: 'end-turn', actorId: 'alice' });
    const second = trace.reduce((state, entry) => applyGameCommand(state, entry.command, entry.outcome), initial);
    expect(second).toEqual(first);
    expect(initial.phase).toBe('setup-settlement');
  });
});
