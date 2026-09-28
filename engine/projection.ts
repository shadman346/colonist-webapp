import { bankTradeRatio, legalCityVertices, legalRoadEdges, legalSettlementVertices, legalSetupRoadEdges, legalSetupSettlementVertices, longestRoadLength, resourceTotal, scoreFor, COSTS, GameRuleError } from './game.ts';
import { RESOURCES, type Board, type Building, type DevelopmentCard, type EdgeId, type GameActionSummary, type GamePhase, type GameState, type HexId, type PendingTrade, type PlayerId, type Resource, type ResourceCounts, type VertexId } from './types.ts';

export interface LegalMoves {
  setupSettlementVertices: VertexId[];
  setupRoadEdges: EdgeId[];
  roadEdges: EdgeId[];
  settlementVertices: VertexId[];
  cityVertices: VertexId[];
  robberHexes: HexId[];
  robberVictimIds: PlayerId[];
  playableDevelopmentCardIds: string[];
  bankTradeGive: Resource[];
  canRoll: boolean;
  canBuyDevelopment: boolean;
  canOfferTrade: boolean;
  canEndTurn: boolean;
  canRequestSpecialBuild: boolean;
  specialBuildRequested: boolean;
  canPassSpecialBuild: boolean;
  discardCount: number;
  canAcceptTrade: boolean;
  canRejectTrade: boolean;
  canCancelTrade: boolean;
}

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  color: string;
  resourceCount: number;
  developmentCardCount: number;
  playedKnights: number;
  publicPoints: number;
  longestRoadLength: number;
}

export interface GameView {
  version: 1;
  board: Board;
  players: PublicPlayerView[];
  self: {
    id: PlayerId;
    resources: ResourceCounts;
    developmentCards: DevelopmentCard[];
    totalPoints: number;
  };
  bank: ResourceCounts;
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, PlayerId>;
  robberHexId: HexId;
  phase: GamePhase;
  activePlayerId: PlayerId;
  turn: number;
  specialBuildRequested: PlayerId[];
  turnTimerSeconds: number | null;
  turnDeadlineAt: string | null;
  lastTimeoutPlayerId: PlayerId | null;
  recentActions: GameActionSummary[];
  lastRoll: [number, number] | null;
  longestRoadHolderId: PlayerId | null;
  largestArmyHolderId: PlayerId | null;
  winnerId: PlayerId | null;
  victoryPointsToWin: number;
  tradePending: boolean;
  visibleTrade: PendingTrade | null;
  legal: LegalMoves;
}

function has(player: ResourceCounts, cost: ResourceCounts): boolean {
  return RESOURCES.every((resource) => player[resource] >= cost[resource]);
}

export function legalMoves(state: GameState, viewerId: PlayerId): LegalMoves {
  const player = state.players.find((candidate) => candidate.id === viewerId);
  if (!player) throw new GameRuleError('UNKNOWN_PLAYER', 'Player is not in this match');
  const active = state.activePlayerId === viewerId;
  const noTrade = !state.pendingTrade;
  const action = active && state.phase === 'action' && noTrade;
  const specialBuild = active && state.phase === 'special-build' && noTrade;
  const mayBuild = action || specialBuild;
  const roadBuilding = active && state.phase === 'road-building' && noTrade;
  const mayPlayDevelopment = active && noTrade && !state.developmentPlayedThisTurn &&
    (state.phase === 'pre-roll' || state.phase === 'action');
  const trade = state.pendingTrade;
  return {
    setupSettlementVertices: active && state.phase === 'setup-settlement' ? legalSetupSettlementVertices(state) : [],
    setupRoadEdges: active && state.phase === 'setup-road' ? legalSetupRoadEdges(state) : [],
    roadEdges: (roadBuilding || mayBuild && has(player.resources, COSTS.road)) ? legalRoadEdges(state, viewerId) : [],
    settlementVertices: mayBuild && has(player.resources, COSTS.settlement) ? legalSettlementVertices(state, viewerId) : [],
    cityVertices: mayBuild && has(player.resources, COSTS.city) ? legalCityVertices(state, viewerId) : [],
    robberHexes: active && state.phase === 'robber-move'
      ? Object.keys(state.board.hexes).filter((hexId) => hexId !== state.robberHexId) : [],
    robberVictimIds: active && state.phase === 'robber-steal' ? [...state.robberVictimIds] : [],
    playableDevelopmentCardIds: mayPlayDevelopment
      ? player.developmentCards.filter((card) => card.acquiredTurn < state.turn && card.type !== 'victory-point')
        .map((card) => card.id) : [],
    bankTradeGive: action ? RESOURCES.filter((resource) =>
      player.resources[resource] >= bankTradeRatio(state, viewerId, resource) &&
      RESOURCES.some((other) => other !== resource && state.bank[other] > 0)) : [],
    canRoll: active && state.phase === 'pre-roll' && noTrade,
    canBuyDevelopment: mayBuild && state.developmentDeck.length > 0 && has(player.resources, COSTS.development),
    canOfferTrade: action,
    canEndTurn: action,
    canRequestSpecialBuild: state.players.length >= 5 && state.turn > 0 && !active &&
      !['setup-settlement', 'setup-road', 'special-build', 'completed'].includes(state.phase),
    specialBuildRequested: (state.specialBuildRequested ?? []).includes(viewerId),
    canPassSpecialBuild: specialBuild,
    discardCount: state.phase === 'discard' ? state.pendingDiscards[viewerId] ?? 0 : 0,
    canAcceptTrade: trade?.toPlayerId === viewerId && has(player.resources, trade.want) &&
      has(state.players.find((candidate) => candidate.id === trade.fromPlayerId)!.resources, trade.give),
    canRejectTrade: trade?.toPlayerId === viewerId,
    canCancelTrade: trade?.fromPlayerId === viewerId,
  };
}

/**
 * The only object the backend may send to a game member. No server seed, deck,
 * opponent resources, opponent card identities, or pending private discard data.
 */
export function projectGame(state: GameState, viewerId: PlayerId): GameView {
  const player = state.players.find((candidate) => candidate.id === viewerId);
  if (!player) throw new GameRuleError('UNKNOWN_PLAYER', 'Player is not in this match');
  const trade = state.pendingTrade;
  return {
    version: 1,
    board: structuredClone(state.board),
    players: state.players.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      color: candidate.color,
      resourceCount: resourceTotal(candidate.resources),
      developmentCardCount: candidate.developmentCards.length,
      playedKnights: candidate.playedKnights,
      publicPoints: scoreFor(state, candidate.id, false),
      longestRoadLength: longestRoadLength(state, candidate.id),
    })),
    self: {
      id: player.id,
      resources: structuredClone(player.resources),
      developmentCards: structuredClone(player.developmentCards),
      totalPoints: scoreFor(state, viewerId),
    },
    bank: structuredClone(state.bank),
    buildings: structuredClone(state.buildings),
    roads: structuredClone(state.roads),
    robberHexId: state.robberHexId,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    turn: state.turn,
    specialBuildRequested: [...(state.specialBuildRequested ?? [])],
    turnTimerSeconds: state.turnTimerSeconds,
    turnDeadlineAt: state.turnDeadlineAt,
    lastTimeoutPlayerId: state.lastTimeoutPlayerId,
    recentActions: structuredClone(state.recentActions),
    lastRoll: state.lastRoll ? [...state.lastRoll] as [number, number] : null,
    longestRoadHolderId: state.longestRoadHolderId,
    largestArmyHolderId: state.largestArmyHolderId,
    winnerId: state.winnerId,
    victoryPointsToWin: state.victoryPointsToWin,
    tradePending: Boolean(trade),
    visibleTrade: trade && (trade.fromPlayerId === viewerId || trade.toPlayerId === viewerId)
      ? structuredClone(trade) : null,
    legal: legalMoves(state, viewerId),
  };
}
