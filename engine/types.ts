export const RESOURCES = ['wood', 'brick', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceCounts = Record<Resource, number>;

export const DEVELOPMENT_TYPES = [
  'knight',
  'road-building',
  'year-of-plenty',
  'monopoly',
  'victory-point',
] as const;
export type DevelopmentType = (typeof DEVELOPMENT_TYPES)[number];
export type Terrain = Resource | 'desert';
export type PlayerId = string;
export type HexId = string;
export type VertexId = string;
export type EdgeId = string;

export interface Hex {
  id: HexId;
  q: number;
  r: number;
  terrain: Terrain;
  number: number | null;
  vertexIds: VertexId[];
  edgeIds: EdgeId[];
}

export interface Vertex {
  id: VertexId;
  x: number;
  y: number;
  hexIds: HexId[];
  edgeIds: EdgeId[];
  neighborIds: VertexId[];
}

export interface Edge {
  id: EdgeId;
  vertexIds: [VertexId, VertexId];
  hexIds: HexId[];
}

export interface Port {
  edgeId: EdgeId;
  vertexIds: [VertexId, VertexId];
  ratio: 2 | 3;
  resource: Resource | null;
}

export interface Board {
  hexes: Record<HexId, Hex>;
  vertices: Record<VertexId, Vertex>;
  edges: Record<EdgeId, Edge>;
  ports: Port[];
}

export interface DevelopmentCard {
  id: string;
  type: DevelopmentType;
  acquiredTurn: number;
}

export interface GamePlayer {
  id: PlayerId;
  name: string;
  color: string;
  resources: ResourceCounts;
  developmentCards: DevelopmentCard[];
  playedKnights: number;
}

export interface Building {
  ownerId: PlayerId;
  level: 'settlement' | 'city';
}

export type GamePhase =
  | 'setup-settlement'
  | 'setup-road'
  | 'pre-roll'
  | 'action'
  | 'discard'
  | 'robber-move'
  | 'robber-steal'
  | 'road-building'
  | 'special-build'
  | 'completed';

export interface PendingTrade {
  id: string;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  give: ResourceCounts;
  want: ResourceCounts;
}

export interface GameActionSummary {
  number: number;
  actorId: PlayerId;
  type: GameCommand['type'] | 'turn-expired';
  rollTotal?: number;
}

export interface GameState {
  version: 1;
  seed: string;
  board: Board;
  players: GamePlayer[];
  bank: ResourceCounts;
  developmentDeck: DevelopmentType[];
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, PlayerId>;
  robberHexId: HexId;
  phase: GamePhase;
  activePlayerId: PlayerId;
  firstPlayerId: PlayerId;
  setupOrder: PlayerId[];
  setupIndex: number;
  setupVertexId: VertexId | null;
  turn: number;
  specialBuildRequested: PlayerId[];
  specialBuildQueue: PlayerId[];
  regularNextPlayerId: PlayerId | null;
  turnTimerSeconds: number | null;
  turnDeadlineAt: string | null;
  lastTimeoutPlayerId: PlayerId | null;
  recentActions: GameActionSummary[];
  lastRoll: [number, number] | null;
  pendingDiscards: Record<PlayerId, number>;
  robberReturnPhase: 'pre-roll' | 'action';
  robberVictimIds: PlayerId[];
  roadBuildingRemaining: number;
  roadBuildingReturnPhase: 'pre-roll' | 'action';
  developmentPlayedThisTurn: boolean;
  pendingTrade: PendingTrade | null;
  nextTradeNumber: number;
  longestRoadHolderId: PlayerId | null;
  largestArmyHolderId: PlayerId | null;
  winnerId: PlayerId | null;
  victoryPointsToWin: number;
}

export type GameCommand =
  | { type: 'place-setup-settlement'; actorId: PlayerId; vertexId: VertexId }
  | { type: 'place-setup-road'; actorId: PlayerId; edgeId: EdgeId }
  | { type: 'roll'; actorId: PlayerId }
  | { type: 'discard'; actorId: PlayerId; resources: ResourceCounts }
  | { type: 'move-robber'; actorId: PlayerId; hexId: HexId }
  | { type: 'choose-robber-victim'; actorId: PlayerId; victimId: PlayerId }
  | { type: 'build-road'; actorId: PlayerId; edgeId: EdgeId }
  | { type: 'build-settlement'; actorId: PlayerId; vertexId: VertexId }
  | { type: 'build-city'; actorId: PlayerId; vertexId: VertexId }
  | { type: 'buy-development'; actorId: PlayerId }
  | { type: 'play-knight'; actorId: PlayerId; cardId: string }
  | { type: 'play-road-building'; actorId: PlayerId; cardId: string }
  | { type: 'play-year-of-plenty'; actorId: PlayerId; cardId: string; resources: [Resource, Resource] }
  | { type: 'play-monopoly'; actorId: PlayerId; cardId: string; resource: Resource }
  | { type: 'bank-trade'; actorId: PlayerId; give: Resource; receive: Resource }
  | { type: 'offer-trade'; actorId: PlayerId; toPlayerId: PlayerId; give: ResourceCounts; want: ResourceCounts }
  | { type: 'accept-trade'; actorId: PlayerId; tradeId: string }
  | { type: 'reject-trade'; actorId: PlayerId; tradeId: string }
  | { type: 'cancel-trade'; actorId: PlayerId; tradeId: string }
  | { type: 'end-turn'; actorId: PlayerId }
  | { type: 'request-special-build'; actorId: PlayerId; requested: boolean }
  | { type: 'pass-special-build'; actorId: PlayerId };

/** Generated exclusively by a trusted server, never accepted from a browser command. */
export interface RandomOutcome {
  dice?: [number, number];
  stolenResource?: Resource;
}

export interface RandomIntSource {
  /** Cryptographically secure integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export interface CreateGameOptions {
  players: Array<{ id: PlayerId; name: string; color: string }>;
  /** Server-generated seed for the public board. Never reuse it for the hidden deck. */
  seed: string;
  /** Independently shuffled by the server with cryptographic randomness. */
  developmentDeck: DevelopmentType[];
  victoryPointsToWin?: number;
  turnTimerSeconds?: number | null;
  startedAt?: string;
}
