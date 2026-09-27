import { describe, expect, it } from 'vitest';
import {
  applyGameCommand,
  COSTS,
  createGame,
  legalSetupRoadEdges,
  legalSetupSettlementVertices,
  projectGame,
  randomOutcomeForCommand,
  resourceTotal,
  scoreFor,
  RESOURCES,
  type DevelopmentType,
  type GameCommand,
  type GameState,
  type Hex,
  type RandomOutcome,
  type Resource,
  type Vertex,
} from './index.ts';

const PLAYERS = [
  { id: 'alice', name: 'Alice', color: 'red' },
  { id: 'bob', name: 'Bob', color: 'blue' },
  { id: 'cara', name: 'Cara', color: 'orange' },
];

// The fixture order is known to the test server only. The top five draws are
// hidden points, followed by three Knights; every Base card is still present.
const DECK: DevelopmentType[] = [
  ...Array<DevelopmentType>(11).fill('knight'),
  ...Array<DevelopmentType>(2).fill('road-building'),
  ...Array<DevelopmentType>(2).fill('year-of-plenty'),
  ...Array<DevelopmentType>(2).fill('monopoly'),
  ...Array<DevelopmentType>(3).fill('knight'),
  ...Array<DevelopmentType>(5).fill('victory-point'),
];

type TraceEntry = { command: GameCommand; outcome?: RandomOutcome };

function newMatch(): GameState {
  return createGame({ players: PLAYERS, seed: 'complete-match-v1', developmentDeck: DECK });
}

function issue(state: GameState, trace: TraceEntry[], command: GameCommand, outcome?: RandomOutcome): GameState {
  const next = applyGameCommand(state, command, outcome);
  trace.push({ command, outcome });
  return next;
}

function targetHexes(state: GameState, vertices: Vertex[]): Set<string> {
  return new Set(vertices.flatMap((vertex) => vertex.hexIds).filter((hexId) => {
    const terrain = state.board.hexes[hexId]!.terrain;
    return terrain === 'wool' || terrain === 'grain' || terrain === 'ore';
  }));
}

function pip(number: number | null): number {
  return number ? 6 - Math.abs(number - 7) : 0;
}

function setupCandidates(initial: GameState): Array<[Vertex, Vertex]> {
  const vertices = Object.values(initial.board.vertices);
  const candidates: Array<{ pair: [Vertex, Vertex]; score: number }> = [];
  for (const first of vertices) for (const second of vertices) {
    if (first.id === second.id || first.neighborIds.includes(second.id)) continue;
    const hexes = targetHexes(initial, [first, second]);
    const found = new Set([...hexes].map((id) => initial.board.hexes[id]!.terrain));
    if (!(['wool', 'grain', 'ore'] as const).every((resource) => found.has(resource))) continue;
    const score = [...hexes].reduce((total, hexId) => total + pip(initial.board.hexes[hexId]!.number), 0);
    candidates.push({ pair: [first, second], score });
  }
  return candidates.sort((left, right) => right.score - left.score).map(({ pair }) => pair);
}

function opening(initial: GameState): { state: GameState; trace: TraceEntry[] } {
  for (const [first, second] of setupCandidates(initial)) {
    let state = initial;
    const trace: TraceEntry[] = [];
    const aliceTargets = targetHexes(state, [first, second]);
    let feasible = true;
    while (state.phase === 'setup-settlement' || state.phase === 'setup-road') {
      if (state.phase === 'setup-settlement') {
        let vertexId: string;
        if (state.activePlayerId === 'alice') {
          vertexId = state.setupIndex === 0 ? first.id : second.id;
          if (!legalSetupSettlementVertices(state).includes(vertexId)) {
            feasible = false;
            break;
          }
        } else {
          const available = legalSetupSettlementVertices(state)
            .map((id) => state.board.vertices[id]!)
            .filter((vertex) => vertex.id !== second.id && !vertex.neighborIds.includes(second.id))
            .sort((left, right) => {
              const overlap = (vertex: Vertex) => vertex.hexIds.filter((id) => aliceTargets.has(id)).length;
              return overlap(left) - overlap(right);
            });
          if (!available.length) {
            feasible = false;
            break;
          }
          vertexId = available[0]!.id;
        }
        state = issue(state, trace, { type: 'place-setup-settlement', actorId: state.activePlayerId, vertexId });
      } else {
        state = issue(state, trace, {
          type: 'place-setup-road', actorId: state.activePlayerId, edgeId: legalSetupRoadEdges(state)[0]!,
        });
      }
    }
    if (feasible && state.phase === 'pre-roll') return { state, trace };
  }
  throw new Error('No legal opening with wool, grain, and ore production');
}

function diceFor(total: number): [number, number] {
  return total <= 7 ? [1, total - 1] : [total - 6, 6];
}

function deficits(state: GameState, bought: number, cityBuilt: boolean): Record<'wool' | 'grain' | 'ore', number> {
  const hand = state.players[0]!.resources;
  const remainingCards = 8 - bought;
  return {
    wool: Math.max(0, remainingCards - hand.wool),
    grain: Math.max(0, remainingCards + (cityBuilt ? 0 : 2) - hand.grain),
    ore: Math.max(0, remainingCards + (cityBuilt ? 0 : 3) - hand.ore),
  };
}

function bestRoll(state: GameState, bought: number, cityBuilt: boolean): [number, number] {
  const need = deficits(state, bought, cityBuilt);
  let choice: [number, number] = [1, 1];
  let best = -1;
  for (let sum = 2; sum <= 12; sum += 1) {
    if (sum === 7) continue;
    const dice = diceFor(sum);
    const trial = applyGameCommand(state, { type: 'roll', actorId: state.activePlayerId }, { dice });
    const previous = state.players[0]!.resources;
    const next = trial.players[0]!.resources;
    const score = (['wool', 'grain', 'ore'] as const).reduce((total, resource) =>
      total + Math.min(need[resource], next[resource] - previous[resource]), 0);
    if (score > best) {
      best = score;
      choice = dice;
    }
  }
  return choice;
}

function shortageThatCanBeRecycled(state: GameState, bought: number, cityBuilt: boolean): Resource | null {
  const need = deficits(state, bought, cityBuilt);
  return (['ore', 'grain', 'wool'] as const).find((resource) =>
    need[resource] > 0 && state.bank[resource] === 0 &&
    state.players.some((player) => player.id !== 'alice' &&
      resourceTotal(player.resources) > 7 && player.resources[resource] > 0)) ?? null;
}

function resolveDiscards(state: GameState, trace: TraceEntry[], preferred: Resource): GameState {
  for (const [actorId, required] of Object.entries(state.pendingDiscards)) {
    const hand = state.players.find((player) => player.id === actorId)!.resources;
    const resources = { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    let remaining = required;
    for (const resource of [preferred, ...RESOURCES.filter((item) => item !== preferred)]) {
      const quantity = Math.min(hand[resource], remaining);
      resources[resource] += quantity;
      remaining -= quantity;
    }
    expect(remaining).toBe(0);
    state = issue(state, trace, { type: 'discard', actorId, resources });
  }
  return state;
}

function safeRobberHex(state: GameState): Hex {
  const choices = Object.values(state.board.hexes)
    .filter((hex) => hex.id !== state.robberHexId &&
      !hex.vertexIds.some((id) => state.buildings[id]?.ownerId === 'alice'))
    .sort((left, right) => {
      const victims = (hex: Hex) => hex.vertexIds.filter((id) => state.buildings[id]).length;
      return victims(left) - victims(right);
    });
  if (!choices.length) throw new Error('No robber destination away from Alice production');
  return choices[0]!;
}

function resolveRobber(state: GameState, trace: TraceEntry[]): GameState {
  const actorId = state.activePlayerId;
  state = issue(state, trace, { type: 'move-robber', actorId, hexId: safeRobberHex(state).id });
  if (state.phase === 'robber-steal') {
    const command: GameCommand = { type: 'choose-robber-victim', actorId, victimId: state.robberVictimIds[0]! };
    const outcome = randomOutcomeForCommand(state, command, { int: () => 0 });
    state = issue(state, trace, command, outcome);
  }
  return state;
}

function canAfford(state: GameState, cost: Record<Resource, number>): boolean {
  return RESOURCES.every((resource) => state.players[0]!.resources[resource] >= cost[resource]);
}

describe('complete Base match', () => {
  it('legally reaches ten points and replays every committed command', () => {
    const initial = newMatch();
    const opened = opening(initial);
    let state = opened.state;
    const trace = opened.trace;
    let bought = 0;
    let cityBuilt = false;
    let playedKnights = 0;

    for (let turns = 0; turns < 180 && state.phase !== 'completed'; turns += 1) {
      expect(state.phase).toBe('pre-roll');
      const actorId = state.activePlayerId;

      if (actorId === 'alice') {
        const knight = state.players[0]!.developmentCards.find((card) =>
          card.type === 'knight' && card.acquiredTurn < state.turn);
        if (knight && playedKnights < 3) {
          state = issue(state, trace, { type: 'play-knight', actorId, cardId: knight.id });
          playedKnights += 1;
          state = resolveRobber(state, trace);
          if (state.phase === 'completed') break;
        }
      }

      const recycle = shortageThatCanBeRecycled(state, bought, cityBuilt);
      const dice: [number, number] = recycle && resourceTotal(state.players[0]!.resources) <= 7
        ? [3, 4] : bestRoll(state, bought, cityBuilt);
      state = issue(state, trace, { type: 'roll', actorId }, { dice });
      if (state.phase === 'discard') state = resolveDiscards(state, trace, recycle ?? 'ore');
      if (state.phase === 'robber-move') state = resolveRobber(state, trace);
      expect(state.phase).toBe('action');

      if (actorId === 'alice') {
        if (!cityBuilt && canAfford(state, COSTS.city)) {
          const vertexId = Object.entries(state.buildings)
            .find(([, building]) => building.ownerId === 'alice' && building.level === 'settlement')![0];
          state = issue(state, trace, { type: 'build-city', actorId, vertexId });
          cityBuilt = true;
        }
        while (bought < 8 && canAfford(state, COSTS.development)) {
          state = issue(state, trace, { type: 'buy-development', actorId });
          bought += 1;
        }
      }
      if (state.phase !== 'completed') state = issue(state, trace, { type: 'end-turn', actorId });
    }

    expect({ phase: state.phase, score: scoreFor(state, 'alice'), bought, cityBuilt, playedKnights })
      .toEqual({ phase: 'completed', score: 10, bought: 8, cityBuilt: true, playedKnights: 3 });
    expect(state.winnerId).toBe('alice');
    expect(projectGame(state, 'bob').players.find((player) => player.id === 'alice')?.publicPoints).toBe(5);
    expect(projectGame(state, 'alice').self.totalPoints).toBe(10);
    expect(trace.length).toBeGreaterThan(40);
    expect(trace.filter((entry) => entry.command.type === 'buy-development')).toHaveLength(8);
    expect(trace.filter((entry) => entry.command.type === 'play-knight')).toHaveLength(3);
    expect(trace.filter((entry) => entry.command.type === 'build-city')).toHaveLength(1);
    expect(trace.some((entry) => entry.command.type === 'discard')).toBe(true);
    expect(trace.some((entry) => entry.command.type === 'move-robber')).toBe(true);
    const replayed = trace.reduce((current, entry) =>
      applyGameCommand(current, entry.command, entry.outcome), initial);
    expect(replayed).toEqual(state);
    expect(initial.phase).toBe('setup-settlement');
    expect(resourceTotal(state.players[0]!.resources)).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
