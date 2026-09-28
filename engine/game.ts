import { createBaseBoard, createLargeBoard } from './board.ts';
import {
  RESOURCES,
  type CreateGameOptions,
  type DevelopmentCard,
  type DevelopmentType,
  type EdgeId,
  type GameCommand,
  type GamePhase,
  type GamePlayer,
  type GameState,
  type PlayerId,
  type RandomIntSource,
  type RandomOutcome,
  type Resource,
  type ResourceCounts,
  type VertexId,
} from './types.ts';

export class GameRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}

export function emptyResources(): ResourceCounts {
  return { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

export function resourceTotal(resources: ResourceCounts): number {
  return RESOURCES.reduce((total, resource) => total + resources[resource], 0);
}

function fail(code: string, message: string): never {
  throw new GameRuleError(code, message);
}

function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) fail(code, message);
}

function validCounts(value: ResourceCounts): boolean {
  if (!value || typeof value !== 'object') return false;
  return RESOURCES.every((resource) => Number.isInteger(value[resource]) && value[resource] >= 0);
}

function validResource(value: unknown): value is Resource {
  return RESOURCES.includes(value as Resource);
}

function getPlayer(state: GameState, id: PlayerId): GamePlayer {
  const player = state.players.find((candidate) => candidate.id === id);
  requireRule(player, 'UNKNOWN_PLAYER', 'Player is not in this match');
  return player;
}

function requireActive(state: GameState, actorId: PlayerId): GamePlayer {
  requireRule(state.activePlayerId === actorId, 'NOT_YOUR_TURN', 'It is another player’s turn');
  return getPlayer(state, actorId);
}

function requirePhase(state: GameState, ...phases: GamePhase[]): void {
  requireRule(phases.includes(state.phase), 'WRONG_PHASE', `This action is unavailable during ${state.phase}`);
}

function requireNoTrade(state: GameState): void {
  requireRule(!state.pendingTrade, 'TRADE_PENDING', 'Resolve the pending trade first');
}

function hasResources(player: GamePlayer, cost: ResourceCounts): boolean {
  return RESOURCES.every((resource) => player.resources[resource] >= cost[resource]);
}

function requireAffordable(player: GamePlayer, cost: ResourceCounts): void {
  requireRule(hasResources(player, cost), 'INSUFFICIENT_RESOURCES', 'You do not have enough resources');
}

function toBank(state: GameState, player: GamePlayer, counts: ResourceCounts): void {
  requireAffordable(player, counts);
  RESOURCES.forEach((resource) => {
    player.resources[resource] -= counts[resource];
    state.bank[resource] += counts[resource];
  });
}

function fromBank(state: GameState, player: GamePlayer, counts: ResourceCounts): void {
  RESOURCES.forEach((resource) => {
    requireRule(state.bank[resource] >= counts[resource], 'BANK_EMPTY', `The bank lacks ${resource}`);
  });
  RESOURCES.forEach((resource) => {
    state.bank[resource] -= counts[resource];
    player.resources[resource] += counts[resource];
  });
}

function counts(...pairs: Array<[Resource, number]>): ResourceCounts {
  const result = emptyResources();
  pairs.forEach(([resource, amount]) => { result[resource] += amount; });
  return result;
}

export const COSTS = {
  road: counts(['wood', 1], ['brick', 1]),
  settlement: counts(['wood', 1], ['brick', 1], ['wool', 1], ['grain', 1]),
  city: counts(['grain', 2], ['ore', 3]),
  development: counts(['wool', 1], ['grain', 1], ['ore', 1]),
} as const;

const DEVELOPMENT_DECK: DevelopmentType[] = [
  ...Array<DevelopmentType>(14).fill('knight'),
  ...Array<DevelopmentType>(5).fill('victory-point'),
  ...Array<DevelopmentType>(2).fill('road-building'),
  ...Array<DevelopmentType>(2).fill('year-of-plenty'),
  ...Array<DevelopmentType>(2).fill('monopoly'),
];
const LARGE_DEVELOPMENT_DECK: DevelopmentType[] = [
  ...Array<DevelopmentType>(20).fill('knight'),
  ...Array<DevelopmentType>(5).fill('victory-point'),
  ...Array<DevelopmentType>(3).fill('road-building'),
  ...Array<DevelopmentType>(3).fill('year-of-plenty'),
  ...Array<DevelopmentType>(3).fill('monopoly'),
];

/** Shuffle the hidden deck using the server's cryptographically secure random source. */
export function createShuffledDevelopmentDeck(source: RandomIntSource, playerCount = 4): DevelopmentType[] {
  const deck = [...(playerCount >= 5 ? LARGE_DEVELOPMENT_DECK : DEVELOPMENT_DECK)];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = source.int(i + 1);
    requireRule(Number.isInteger(j) && j >= 0 && j <= i,
      'INVALID_RANDOM_SOURCE', 'Random source returned an out-of-range integer');
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function validDevelopmentDeck(deck: DevelopmentType[], playerCount: number): boolean {
  const expectedDeck = playerCount >= 5 ? LARGE_DEVELOPMENT_DECK : DEVELOPMENT_DECK;
  if (!Array.isArray(deck) || deck.length !== expectedDeck.length) return false;
  const expected = new Map<DevelopmentType, number>();
  const actual = new Map<DevelopmentType, number>();
  expectedDeck.forEach((type) => expected.set(type, (expected.get(type) ?? 0) + 1));
  deck.forEach((type) => actual.set(type, (actual.get(type) ?? 0) + 1));
  return [...expected].every(([type, count]) => actual.get(type) === count) && actual.size === expected.size;
}

function occupiedNeighbors(state: GameState, vertexId: VertexId): boolean {
  return state.board.vertices[vertexId]!.neighborIds.some((neighborId) => Boolean(state.buildings[neighborId]));
}

export function legalSetupSettlementVertices(state: GameState): VertexId[] {
  return Object.keys(state.board.vertices).filter((vertexId) =>
    !state.buildings[vertexId] && !occupiedNeighbors(state, vertexId) &&
    state.board.vertices[vertexId]!.edgeIds.some((edgeId) => !state.roads[edgeId])
  );
}

export function legalSetupRoadEdges(state: GameState): EdgeId[] {
  if (!state.setupVertexId) return [];
  return state.board.vertices[state.setupVertexId]!.edgeIds.filter((edgeId) => !state.roads[edgeId]);
}

export function legalRoadEdges(state: GameState, actorId: PlayerId): EdgeId[] {
  const placed = Object.values(state.roads).filter((ownerId) => ownerId === actorId).length;
  if (placed >= 15) return [];
  return Object.values(state.board.edges)
    .filter((edge) => {
      if (state.roads[edge.id]) return false;
      return edge.vertexIds.some((vertexId) => {
        const building = state.buildings[vertexId];
        if (building?.ownerId === actorId) return true;
        if (building && building.ownerId !== actorId) return false;
        return state.board.vertices[vertexId]!.edgeIds.some((edgeId) => state.roads[edgeId] === actorId);
      });
    })
    .map((edge) => edge.id);
}

export function legalSettlementVertices(state: GameState, actorId: PlayerId): VertexId[] {
  const placed = Object.values(state.buildings)
    .filter((building) => building.ownerId === actorId && building.level === 'settlement').length;
  if (placed >= 5) return [];
  return Object.values(state.board.vertices)
    .filter((vertex) =>
      !state.buildings[vertex.id] &&
      !occupiedNeighbors(state, vertex.id) &&
      vertex.edgeIds.some((edgeId) => state.roads[edgeId] === actorId)
    )
    .map((vertex) => vertex.id);
}

export function legalCityVertices(state: GameState, actorId: PlayerId): VertexId[] {
  const placed = Object.values(state.buildings)
    .filter((building) => building.ownerId === actorId && building.level === 'city').length;
  if (placed >= 4) return [];
  return Object.entries(state.buildings)
    .filter(([, building]) => building.ownerId === actorId && building.level === 'settlement')
    .map(([vertexId]) => vertexId);
}

/** An opponent's settlement/city terminates a path, including a branching path. */
export function longestRoadLength(state: GameState, actorId: PlayerId): number {
  const ownedEdges = Object.keys(state.roads).filter((edgeId) => state.roads[edgeId] === actorId);
  if (!ownedEdges.length) return 0;
  const edgeSet = new Set(ownedEdges);
  const visited = new Set<EdgeId>();
  const search = (vertexId: VertexId, fromEdge: EdgeId | null): number => {
    const building = state.buildings[vertexId];
    if (fromEdge && building && building.ownerId !== actorId) return 0;
    let best = 0;
    for (const edgeId of state.board.vertices[vertexId]!.edgeIds) {
      if (!edgeSet.has(edgeId) || visited.has(edgeId)) continue;
      visited.add(edgeId);
      const [a, b] = state.board.edges[edgeId]!.vertexIds;
      best = Math.max(best, 1 + search(a === vertexId ? b : a, edgeId));
      visited.delete(edgeId);
    }
    return best;
  };
  const endpoints = new Set(ownedEdges.flatMap((edgeId) => state.board.edges[edgeId]!.vertexIds));
  return Math.max(...Array.from(endpoints, (vertexId) => search(vertexId, null)));
}

function awardHolder(
  state: GameState,
  currentId: PlayerId | null,
  minimum: number,
  size: (playerId: PlayerId) => number,
): PlayerId | null {
  const lengths = state.players.map((player) => ({ id: player.id, length: size(player.id) }));
  const best = Math.max(...lengths.map((entry) => entry.length));
  if (best < minimum) return null;
  const leaders = lengths.filter((entry) => entry.length === best);
  if (currentId && leaders.some((entry) => entry.id === currentId)) return currentId;
  return leaders.length === 1 ? leaders[0]!.id : null;
}

function refreshAwards(state: GameState): void {
  state.longestRoadHolderId = awardHolder(state, state.longestRoadHolderId, 5,
    (playerId) => longestRoadLength(state, playerId));
  state.largestArmyHolderId = awardHolder(state, state.largestArmyHolderId, 3,
    (playerId) => getPlayer(state, playerId).playedKnights);
}

export function scoreFor(state: GameState, playerId: PlayerId, includeHidden = true): number {
  const buildings = Object.values(state.buildings).reduce((total, building) =>
    total + (building.ownerId === playerId ? building.level === 'city' ? 2 : 1 : 0), 0);
  const awards = (state.longestRoadHolderId === playerId ? 2 : 0) +
    (state.largestArmyHolderId === playerId ? 2 : 0);
  const hidden = includeHidden ? getPlayer(state, playerId).developmentCards
    .filter((card) => card.type === 'victory-point').length : 0;
  return buildings + awards + hidden;
}

function completeIfWon(state: GameState): void {
  if (state.phase !== 'action' && state.phase !== 'pre-roll') return;
  if (scoreFor(state, state.activePlayerId) >= state.victoryPointsToWin) {
    state.phase = 'completed';
    state.winnerId = state.activePlayerId;
    state.pendingTrade = null;
  }
}

function validDevelopmentCard(state: GameState, actorId: PlayerId, cardId: string, type: DevelopmentType): DevelopmentCard {
  requirePhase(state, 'pre-roll', 'action');
  requireNoTrade(state);
  requireActive(state, actorId);
  requireRule(!state.developmentPlayedThisTurn, 'DEVELOPMENT_ALREADY_PLAYED', 'Only one action development card may be played per turn');
  const card = getPlayer(state, actorId).developmentCards.find((item) => item.id === cardId);
  requireRule(card?.type === type, 'CARD_UNAVAILABLE', 'Development card is unavailable');
  requireRule(card.acquiredTurn < state.turn, 'CARD_TOO_NEW', 'A development card cannot be played on the turn it was bought');
  return card;
}

function consumeDevelopmentCard(state: GameState, actorId: PlayerId, cardId: string): void {
  const player = getPlayer(state, actorId);
  player.developmentCards = player.developmentCards.filter((card) => card.id !== cardId);
  state.developmentPlayedThisTurn = true;
}

function produce(state: GameState, total: number): void {
  const owed = new Map<Resource, Record<PlayerId, number>>();
  RESOURCES.forEach((resource) => owed.set(resource, {}));
  Object.values(state.board.hexes).forEach((hex) => {
    if (hex.number !== total || hex.id === state.robberHexId || hex.terrain === 'desert') return;
    const due = owed.get(hex.terrain)!;
    hex.vertexIds.forEach((vertexId) => {
      const building = state.buildings[vertexId];
      if (building) due[building.ownerId] = (due[building.ownerId] ?? 0) + (building.level === 'city' ? 2 : 1);
    });
  });
  RESOURCES.forEach((resource) => {
    const due = owed.get(resource)!;
    const playerIds = Object.keys(due);
    const totalDue = Object.values(due).reduce((sum, count) => sum + count, 0);
    if (!totalDue) return;
    if (state.bank[resource] < totalDue && playerIds.length > 1) return;
    playerIds.forEach((playerId) => {
      const granted = Math.min(due[playerId]!, state.bank[resource]);
      state.bank[resource] -= granted;
      getPlayer(state, playerId).resources[resource] += granted;
    });
  });
}

export function bankTradeRatio(state: GameState, actorId: PlayerId, resource: Resource): 2 | 3 | 4 {
  let ratio: 2 | 3 | 4 = 4;
  state.board.ports.forEach((port) => {
    if (port.vertexIds.some((vertexId) => state.buildings[vertexId]?.ownerId === actorId)) {
      if (port.resource === resource) ratio = 2;
      else if (port.resource === null && ratio > 3) ratio = 3;
    }
  });
  return ratio;
}

export function createGame(options: CreateGameOptions): GameState {
  requireRule(options.players.length >= 3 && options.players.length <= 6,
    'PLAYER_COUNT', 'Base game supports three to six players');
  requireRule(new Set(options.players.map((player) => player.id)).size === options.players.length,
    'DUPLICATE_PLAYER', 'Player IDs must be unique');
  requireRule(options.players.every((player) => player.id && player.name.trim() && player.color),
    'INVALID_PLAYER', 'Every player needs an ID, name, and color');
  requireRule(typeof options.seed === 'string' && options.seed.length > 0,
    'INVALID_SEED', 'A server seed is required');
  requireRule(validDevelopmentDeck(options.developmentDeck, options.players.length),
    'INVALID_DEVELOPMENT_DECK', 'Server must provide a complete, independently shuffled development deck');
  const target = options.victoryPointsToWin ?? 10;
  requireRule(Number.isInteger(target) && target >= 3 && target <= 20,
    'INVALID_TARGET', 'Victory target must be between 3 and 20');
  const timer = options.turnTimerSeconds ?? null;
  requireRule(timer === null || [60, 90, 120, 180].includes(timer),
    'INVALID_TIMER', 'Choose a 60, 90, 120, or 180 second turn timer');
  const startedAt = options.startedAt ? Date.parse(options.startedAt) : Date.now();
  requireRule(Number.isFinite(startedAt), 'INVALID_TIMER', 'A valid server start time is required');
  const expanded = options.players.length >= 5;
  const board = expanded ? createLargeBoard(options.seed) : createBaseBoard(options.seed);
  const ids = options.players.map((player) => player.id);
  const desert = Object.values(board.hexes).find((hex) => hex.terrain === 'desert')!;
  return {
    version: 1,
    seed: options.seed,
    board,
    players: options.players.map((player) => ({ ...player, resources: emptyResources(), developmentCards: [], playedKnights: 0 })),
    bank: { wood: expanded ? 24 : 19, brick: expanded ? 24 : 19, wool: expanded ? 24 : 19,
      grain: expanded ? 24 : 19, ore: expanded ? 24 : 19 },
    developmentDeck: [...options.developmentDeck],
    buildings: {}, roads: {}, robberHexId: desert.id,
    phase: 'setup-settlement', activePlayerId: ids[0]!, firstPlayerId: ids[0]!,
    setupOrder: [...ids, ...ids.slice().reverse()], setupIndex: 0, setupVertexId: null,
    turn: 0, specialBuildRequested: [], specialBuildQueue: [], regularNextPlayerId: null,
    turnTimerSeconds: timer,
    turnDeadlineAt: timer === null ? null : new Date(startedAt + timer * 1000).toISOString(),
    lastTimeoutPlayerId: null,
    recentActions: [],
    lastRoll: null, pendingDiscards: {}, robberReturnPhase: 'action', robberVictimIds: [],
    roadBuildingRemaining: 0, roadBuildingReturnPhase: 'action',
    developmentPlayedThisTurn: false, pendingTrade: null, nextTradeNumber: 1,
    longestRoadHolderId: null, largestArmyHolderId: null, winnerId: null,
    victoryPointsToWin: target,
  };
}

/** The server uses this before applyGameCommand; browser input never supplies these results. */
export function randomOutcomeForCommand(state: GameState, command: GameCommand, source: RandomIntSource): RandomOutcome {
  if (command.type === 'roll') return { dice: [source.int(6) + 1, source.int(6) + 1] };
  if (command.type === 'choose-robber-victim') {
    const victim = getPlayer(state, command.victimId);
    const hand = RESOURCES.flatMap((resource) => Array<Resource>(victim.resources[resource]).fill(resource));
    return hand.length ? { stolenResource: hand[source.int(hand.length)]! } : {};
  }
  return {};
}

function requireDice(outcome: RandomOutcome): [number, number] {
  const dice = outcome.dice;
  requireRule(dice && dice.length === 2 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6),
    'RANDOM_OUTCOME_REQUIRED', 'Trusted dice outcome is required');
  return dice;
}

function requireTrade(state: GameState, tradeId: string) {
  const trade = state.pendingTrade;
  requireRule(trade?.id === tradeId, 'TRADE_UNAVAILABLE', 'Trade offer is no longer available');
  return trade;
}

function makeRoad(state: GameState, actorId: PlayerId, edgeId: EdgeId): void {
  requireRule(legalRoadEdges(state, actorId).includes(edgeId), 'ILLEGAL_ROAD', 'Road must extend your network along an empty edge');
  state.roads[edgeId] = actorId;
  refreshAwards(state);
}

export function applyGameCommand(input: GameState, command: GameCommand, outcome: RandomOutcome = {}, nowMs = Date.now()): GameState {
  requireRule(input.version === 1, 'STATE_VERSION', 'Unsupported game state version');
  requireRule(input.phase !== 'completed', 'GAME_COMPLETE', 'This match is complete');
  getPlayer(input, command.actorId);
  const state: GameState = structuredClone(input);
  state.specialBuildRequested ??= [];
  state.specialBuildQueue ??= [];
  state.regularNextPlayerId ??= null;
  state.lastTimeoutPlayerId = null;

  if (state.pendingTrade && !['accept-trade', 'reject-trade', 'cancel-trade', 'request-special-build'].includes(command.type)) {
    fail('TRADE_PENDING', 'Resolve the pending trade first');
  }

  switch (command.type) {
    case 'place-setup-settlement': {
      requirePhase(state, 'setup-settlement');
      requireActive(state, command.actorId);
      requireRule(legalSetupSettlementVertices(state).includes(command.vertexId),
        'ILLEGAL_SETTLEMENT', 'Setup settlement must obey the distance rule');
      state.buildings[command.vertexId] = { ownerId: command.actorId, level: 'settlement' };
      state.setupVertexId = command.vertexId;
      if (state.setupIndex >= state.players.length) {
        const gains = emptyResources();
        state.board.vertices[command.vertexId]!.hexIds.forEach((hexId) => {
          const terrain = state.board.hexes[hexId]!.terrain;
          if (terrain !== 'desert') gains[terrain] += 1;
        });
        fromBank(state, getPlayer(state, command.actorId), gains);
      }
      state.phase = 'setup-road';
      break;
    }
    case 'place-setup-road': {
      requirePhase(state, 'setup-road');
      requireActive(state, command.actorId);
      requireRule(legalSetupRoadEdges(state).includes(command.edgeId),
        'ILLEGAL_ROAD', 'Setup road must touch the settlement just placed');
      state.roads[command.edgeId] = command.actorId;
      state.setupVertexId = null;
      state.setupIndex += 1;
      if (state.setupIndex === state.setupOrder.length) {
        state.phase = 'pre-roll';
        state.activePlayerId = state.firstPlayerId;
        state.turn = 1;
      } else {
        state.phase = 'setup-settlement';
        state.activePlayerId = state.setupOrder[state.setupIndex]!;
      }
      break;
    }
    case 'roll': {
      requirePhase(state, 'pre-roll');
      requireActive(state, command.actorId);
      state.lastRoll = requireDice(outcome);
      const total = state.lastRoll[0] + state.lastRoll[1];
      if (total === 7) {
        state.pendingDiscards = {};
        state.players.forEach((player) => {
          const handSize = resourceTotal(player.resources);
          if (handSize > 7) state.pendingDiscards[player.id] = Math.floor(handSize / 2);
        });
        state.robberReturnPhase = 'action';
        state.phase = Object.keys(state.pendingDiscards).length ? 'discard' : 'robber-move';
      } else {
        produce(state, total);
        state.phase = 'action';
      }
      break;
    }
    case 'discard': {
      requirePhase(state, 'discard');
      const required = state.pendingDiscards[command.actorId];
      requireRule(required !== undefined, 'NOT_DISCARDING', 'This player does not need to discard');
      requireRule(validCounts(command.resources) && resourceTotal(command.resources) === required,
        'INVALID_DISCARD', `Discard exactly ${required} cards`);
      toBank(state, getPlayer(state, command.actorId), command.resources);
      delete state.pendingDiscards[command.actorId];
      if (!Object.keys(state.pendingDiscards).length) state.phase = 'robber-move';
      break;
    }
    case 'move-robber': {
      requirePhase(state, 'robber-move');
      requireActive(state, command.actorId);
      const hex = state.board.hexes[command.hexId];
      requireRule(hex && command.hexId !== state.robberHexId,
        'ILLEGAL_ROBBER_HEX', 'Move the robber to a different land hex');
      state.robberHexId = command.hexId;
      state.robberVictimIds = state.players
        .filter((player) => player.id !== command.actorId && resourceTotal(player.resources) > 0 &&
          hex.vertexIds.some((vertexId) => state.buildings[vertexId]?.ownerId === player.id))
        .map((player) => player.id);
      state.phase = state.robberVictimIds.length ? 'robber-steal' : state.robberReturnPhase;
      break;
    }
    case 'choose-robber-victim': {
      requirePhase(state, 'robber-steal');
      requireActive(state, command.actorId);
      requireRule(state.robberVictimIds.includes(command.victimId),
        'ILLEGAL_ROBBER_VICTIM', 'Victim must border the robber and hold a resource');
      const victim = getPlayer(state, command.victimId);
      requireRule(validResource(outcome.stolenResource) && victim.resources[outcome.stolenResource] > 0,
        'RANDOM_OUTCOME_REQUIRED', 'A trusted weighted resource draw is required');
      victim.resources[outcome.stolenResource] -= 1;
      getPlayer(state, command.actorId).resources[outcome.stolenResource] += 1;
      state.robberVictimIds = [];
      state.phase = state.robberReturnPhase;
      break;
    }
    case 'build-road': {
      requirePhase(state, 'action', 'road-building', 'special-build');
      const player = requireActive(state, command.actorId);
      if (state.phase === 'action' || state.phase === 'special-build') {
        toBank(state, player, COSTS.road);
      }
      makeRoad(state, command.actorId, command.edgeId);
      if (state.phase === 'road-building') {
        state.roadBuildingRemaining -= 1;
        if (state.roadBuildingRemaining === 0 || !legalRoadEdges(state, command.actorId).length) {
          state.phase = state.roadBuildingReturnPhase;
          state.roadBuildingRemaining = 0;
        }
      }
      break;
    }
    case 'build-settlement': {
      requirePhase(state, 'action', 'special-build');
      const player = requireActive(state, command.actorId);
      requireRule(legalSettlementVertices(state, command.actorId).includes(command.vertexId),
        'ILLEGAL_SETTLEMENT', 'Settlement must connect to your road and obey the distance rule');
      toBank(state, player, COSTS.settlement);
      state.buildings[command.vertexId] = { ownerId: command.actorId, level: 'settlement' };
      refreshAwards(state);
      break;
    }
    case 'build-city': {
      requirePhase(state, 'action', 'special-build');
      const player = requireActive(state, command.actorId);
      requireRule(legalCityVertices(state, command.actorId).includes(command.vertexId),
        'ILLEGAL_CITY', 'A city upgrades one of your settlements');
      toBank(state, player, COSTS.city);
      state.buildings[command.vertexId] = { ownerId: command.actorId, level: 'city' };
      break;
    }
    case 'buy-development': {
      requirePhase(state, 'action', 'special-build');
      const player = requireActive(state, command.actorId);
      requireRule(state.developmentDeck.length > 0, 'DECK_EMPTY', 'No development cards remain');
      toBank(state, player, COSTS.development);
      const number = (state.players.length >= 5 ? 34 : 25) - state.developmentDeck.length + 1;
      player.developmentCards.push({ id: `dev:${number}`, type: state.developmentDeck.pop()!, acquiredTurn: state.turn });
      break;
    }
    case 'play-knight': {
      validDevelopmentCard(state, command.actorId, command.cardId, 'knight');
      const returnPhase = state.phase as 'pre-roll' | 'action';
      consumeDevelopmentCard(state, command.actorId, command.cardId);
      getPlayer(state, command.actorId).playedKnights += 1;
      refreshAwards(state);
      state.robberReturnPhase = returnPhase;
      state.phase = 'robber-move';
      break;
    }
    case 'play-road-building': {
      validDevelopmentCard(state, command.actorId, command.cardId, 'road-building');
      state.roadBuildingReturnPhase = state.phase as 'pre-roll' | 'action';
      consumeDevelopmentCard(state, command.actorId, command.cardId);
      state.roadBuildingRemaining = Math.min(2, 15 - Object.values(state.roads)
        .filter((ownerId) => ownerId === command.actorId).length);
      state.phase = state.roadBuildingRemaining && legalRoadEdges(state, command.actorId).length
        ? 'road-building' : state.roadBuildingReturnPhase;
      break;
    }
    case 'play-year-of-plenty': {
      validDevelopmentCard(state, command.actorId, command.cardId, 'year-of-plenty');
      requireRule(Array.isArray(command.resources) && command.resources.length === 2 && command.resources.every(validResource),
        'INVALID_RESOURCES', 'Choose two resource cards');
      const requested = counts([command.resources[0], 1], [command.resources[1], 1]);
      const player = getPlayer(state, command.actorId);
      fromBank(state, player, requested);
      consumeDevelopmentCard(state, command.actorId, command.cardId);
      break;
    }
    case 'play-monopoly': {
      validDevelopmentCard(state, command.actorId, command.cardId, 'monopoly');
      requireRule(validResource(command.resource), 'INVALID_RESOURCE', 'Choose a resource');
      const player = getPlayer(state, command.actorId);
      state.players.forEach((other) => {
        if (other.id === player.id) return;
        player.resources[command.resource] += other.resources[command.resource];
        other.resources[command.resource] = 0;
      });
      consumeDevelopmentCard(state, command.actorId, command.cardId);
      break;
    }
    case 'bank-trade': {
      requirePhase(state, 'action');
      const player = requireActive(state, command.actorId);
      requireRule(validResource(command.give) && validResource(command.receive) && command.give !== command.receive,
        'INVALID_TRADE', 'Choose two different resources');
      const ratio = bankTradeRatio(state, command.actorId, command.give);
      requireAffordable(player, counts([command.give, ratio]));
      requireRule(state.bank[command.receive] > 0, 'BANK_EMPTY', 'Requested resource is unavailable');
      toBank(state, player, counts([command.give, ratio]));
      fromBank(state, player, counts([command.receive, 1]));
      break;
    }
    case 'offer-trade': {
      requirePhase(state, 'action');
      const player = requireActive(state, command.actorId);
      requireRule(command.toPlayerId !== command.actorId, 'INVALID_TRADE', 'Offer another player');
      getPlayer(state, command.toPlayerId);
      requireRule(validCounts(command.give) && validCounts(command.want) &&
        resourceTotal(command.give) > 0 && resourceTotal(command.want) > 0,
        'INVALID_TRADE', 'Offer and request at least one resource');
      requireAffordable(player, command.give);
      state.pendingTrade = {
        id: `trade:${state.nextTradeNumber++}`, fromPlayerId: command.actorId,
        toPlayerId: command.toPlayerId, give: structuredClone(command.give), want: structuredClone(command.want),
      };
      break;
    }
    case 'accept-trade': {
      requirePhase(state, 'action');
      const trade = requireTrade(state, command.tradeId);
      requireRule(command.actorId === trade.toPlayerId, 'NOT_TRADE_RECIPIENT', 'Only the recipient may accept');
      const from = getPlayer(state, trade.fromPlayerId);
      const to = getPlayer(state, trade.toPlayerId);
      requireAffordable(from, trade.give);
      requireAffordable(to, trade.want);
      RESOURCES.forEach((resource) => {
        from.resources[resource] += trade.want[resource] - trade.give[resource];
        to.resources[resource] += trade.give[resource] - trade.want[resource];
      });
      state.pendingTrade = null;
      break;
    }
    case 'reject-trade': {
      const trade = requireTrade(state, command.tradeId);
      requireRule(command.actorId === trade.toPlayerId, 'NOT_TRADE_RECIPIENT', 'Only the recipient may reject');
      state.pendingTrade = null;
      break;
    }
    case 'cancel-trade': {
      const trade = requireTrade(state, command.tradeId);
      requireRule(command.actorId === trade.fromPlayerId, 'NOT_TRADE_SENDER', 'Only the sender may cancel');
      state.pendingTrade = null;
      break;
    }
    case 'end-turn': {
      requirePhase(state, 'action');
      requireActive(state, command.actorId);
      const currentIndex = state.players.findIndex((player) => player.id === command.actorId);
      const nextId = state.players[(currentIndex + 1) % state.players.length]!.id;
      const clockwise = Array.from({ length: state.players.length - 1 }, (_, offset) =>
        state.players[(currentIndex + offset + 1) % state.players.length]!.id);
      state.specialBuildQueue = state.players.length >= 5
        ? clockwise.filter((id) => state.specialBuildRequested.includes(id)) : [];
      state.specialBuildRequested = [];
      if (state.specialBuildQueue.length) {
        state.regularNextPlayerId = nextId;
        state.activePlayerId = state.specialBuildQueue[0]!;
        state.phase = 'special-build';
      } else {
        state.activePlayerId = nextId;
        state.turn += 1;
        state.phase = 'pre-roll';
      }
      state.lastRoll = null;
      state.developmentPlayedThisTurn = false;
      break;
    }
    case 'request-special-build': {
      requireRule(state.players.length >= 5 && state.turn > 0 &&
        !['setup-settlement', 'setup-road', 'special-build'].includes(state.phase),
      'SPECIAL_BUILD_UNAVAILABLE', 'Special Build can be requested during another player’s regular turn');
      requireRule(command.actorId !== state.activePlayerId,
        'SPECIAL_BUILD_UNAVAILABLE', 'Request Special Build during another player’s turn');
      requireRule(typeof command.requested === 'boolean', 'INVALID_COMMAND', 'Choose whether to build');
      state.specialBuildRequested = state.specialBuildRequested.filter((id) => id !== command.actorId);
      if (command.requested) state.specialBuildRequested.push(command.actorId);
      break;
    }
    case 'pass-special-build': {
      requirePhase(state, 'special-build');
      requireActive(state, command.actorId);
      requireRule(state.specialBuildQueue[0] === command.actorId && state.regularNextPlayerId,
        'STATE_INVALID', 'Special Build order is invalid');
      state.specialBuildQueue.shift();
      if (state.specialBuildQueue.length) state.activePlayerId = state.specialBuildQueue[0]!;
      else {
        state.activePlayerId = state.regularNextPlayerId;
        state.regularNextPlayerId = null;
        state.phase = 'pre-roll';
        state.turn += 1;
      }
      break;
    }
    default: {
      const exhaustive: never = command;
      // HTTP input is untyped at runtime even though the TypeScript union is
      // exhaustive. Never let an unknown command become the next game state.
      return fail('UNKNOWN_COMMAND', `Unsupported command: ${String((exhaustive as GameCommand).type)}`);
    }
  }
  completeIfWon(state);
  if (state.phase === 'completed') state.turnDeadlineAt = null;
  else if (state.turnTimerSeconds !== null &&
    (command.type === 'end-turn' || command.type === 'place-setup-road' || command.type === 'pass-special-build')) {
    state.turnDeadlineAt = new Date(nowMs + state.turnTimerSeconds * 1000).toISOString();
  }
  state.recentActions.push({
    number: (state.recentActions.at(-1)?.number ?? 0) + 1,
    actorId: command.actorId,
    type: command.type,
    ...(command.type === 'roll' && state.lastRoll
      ? { rollTotal: state.lastRoll[0] + state.lastRoll[1] } : {}),
  });
  state.recentActions = state.recentActions.slice(-12);
  assertGameInvariants(state);
  return state;
}

/** Resolve a missed deadline using the same legal moves as a player. Only a trusted server may call this. */
export function expireTurn(input: GameState, nowMs: number, source: RandomIntSource): GameState {
  requireRule(input.turnTimerSeconds !== null && input.turnDeadlineAt !== null &&
    nowMs >= Date.parse(input.turnDeadlineAt), 'TIMER_NOT_EXPIRED', 'This turn is still active');
  requireRule(input.phase !== 'completed', 'GAME_COMPLETE', 'This match is complete');
  const timedOutPlayerId = input.activePlayerId;
  let state = structuredClone(input);
  const issue = (command: GameCommand) => {
    state = applyGameCommand(state, command, randomOutcomeForCommand(state, command, source), nowMs);
  };
  const wasSpecialBuild = state.phase === 'special-build';
  if (wasSpecialBuild) {
    issue({ type: 'pass-special-build', actorId: timedOutPlayerId });
  } else if (state.phase === 'setup-settlement') {
    issue({ type: 'place-setup-settlement', actorId: timedOutPlayerId,
      vertexId: legalSetupSettlementVertices(state)[0]! });
  }
  if (wasSpecialBuild) {
    // The pass already gave the next player a fresh deadline.
  } else if (state.phase === 'setup-road') {
    issue({ type: 'place-setup-road', actorId: timedOutPlayerId,
      edgeId: legalSetupRoadEdges(state)[0]! });
  } else {
    if (state.pendingTrade) state.pendingTrade = null;
    if (state.phase === 'road-building') {
      state.phase = state.roadBuildingReturnPhase;
      state.roadBuildingRemaining = 0;
    }
    for (let step = 0; step < 3 && state.phase !== 'action'; step++) {
      if (state.phase === 'pre-roll') issue({ type: 'roll', actorId: timedOutPlayerId });
      if (state.phase === 'discard') {
        for (const [actorId, count] of Object.entries(state.pendingDiscards)) {
          const resources = emptyResources();
          const hand = getPlayer(state, actorId).resources;
          let left = count;
          for (const resource of RESOURCES) {
            const taken = Math.min(left, hand[resource]);
            resources[resource] = taken;
            left -= taken;
          }
          issue({ type: 'discard', actorId, resources });
        }
      }
      if (state.phase === 'robber-move') issue({ type: 'move-robber', actorId: timedOutPlayerId,
        hexId: Object.keys(state.board.hexes).find((id) => id !== state.robberHexId)! });
      if (state.phase === 'robber-steal') issue({ type: 'choose-robber-victim', actorId: timedOutPlayerId,
        victimId: state.robberVictimIds[0]! });
    }
    if (state.phase === 'action') issue({ type: 'end-turn', actorId: timedOutPlayerId });
  }
  state.lastTimeoutPlayerId = timedOutPlayerId;
  state.recentActions.push({
    number: (state.recentActions.at(-1)?.number ?? 0) + 1,
    actorId: timedOutPlayerId,
    type: 'turn-expired',
  });
  state.recentActions = state.recentActions.slice(-12);
  assertGameInvariants(state);
  return state;
}

export function assertGameInvariants(state: GameState): void {
  requireRule(state.turnTimerSeconds === null || [60, 90, 120, 180].includes(state.turnTimerSeconds),
    'STATE_INVALID', 'Invalid turn timer');
  requireRule((state.turnTimerSeconds === null && state.turnDeadlineAt === null) ||
    (state.turnTimerSeconds !== null && (state.phase === 'completed' ? state.turnDeadlineAt === null :
      state.turnDeadlineAt !== null && Number.isFinite(Date.parse(state.turnDeadlineAt)))),
    'STATE_INVALID', 'Invalid turn deadline');
  requireRule(state.players.length >= 3 && state.players.length <= 6, 'STATE_INVALID', 'Invalid player count');
  const expanded = state.players.length >= 5;
  requireRule(Object.keys(state.board.hexes).length === (expanded ? 30 : 19),
    'STATE_INVALID', 'Board size does not match player count');
  requireRule((state.specialBuildRequested ?? []).every((id) => state.players.some((player) => player.id === id)) &&
    (state.specialBuildQueue ?? []).every((id) => state.players.some((player) => player.id === id)),
  'STATE_INVALID', 'Special Build includes an unknown player');
  RESOURCES.forEach((resource) => {
    const total = state.bank[resource] + state.players.reduce((sum, player) => sum + player.resources[resource], 0);
    requireRule(total === (expanded ? 24 : 19), 'STATE_INVALID', `Resource conservation failed for ${resource}`);
  });
  state.players.forEach((player) => {
    const roadCount = Object.values(state.roads).filter((owner) => owner === player.id).length;
    const settlementCount = Object.values(state.buildings).filter((item) => item.ownerId === player.id && item.level === 'settlement').length;
    const cityCount = Object.values(state.buildings).filter((item) => item.ownerId === player.id && item.level === 'city').length;
    requireRule(roadCount <= 15 && settlementCount <= 5 && cityCount <= 4,
      'STATE_INVALID', 'Player piece supply exceeded');
  });
  requireRule(Object.keys(state.buildings).every((id) => Boolean(state.board.vertices[id])) &&
    Object.keys(state.roads).every((id) => Boolean(state.board.edges[id])),
  'STATE_INVALID', 'A piece is outside the board');
}
