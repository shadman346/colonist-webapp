import type { Board, Edge, EdgeId, Hex, HexId, Port, Resource, Terrain, Vertex, VertexId } from './types.ts';

const TERRAIN: Terrain[] = [
  'wood', 'wood', 'wood', 'wood',
  'wool', 'wool', 'wool', 'wool',
  'grain', 'grain', 'grain', 'grain',
  'brick', 'brick', 'brick',
  'ore', 'ore', 'ore',
  'desert',
];
const NON_RED_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12];
const RED_NUMBERS = [6, 6, 8, 8];
const CORNERS: Array<[number, number]> = [
  [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1],
];
const PORT_RESOURCES: Array<Resource | null> = [
  null, null, null, null, 'wood', 'brick', 'wool', 'grain', 'ore',
];

export function seededRandom(seed: string): () => number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function hexId(q: number, r: number): HexId {
  return `h:${q},${r}`;
}

function vertexId(x: number, y: number): VertexId {
  return `v:${x},${y}`;
}

function edgeId(a: VertexId, b: VertexId): EdgeId {
  return `e:${[a, b].sort().join('|')}`;
}

function addUnique<T>(items: T[], item: T): void {
  if (!items.includes(item)) items.push(item);
}

function coordinates(radius: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let r = -radius; r <= radius; r += 1) {
    for (let q = -radius; q <= radius; q += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius) {
        result.push([q, r]);
      }
    }
  }
  return result;
}

/** Stable IDs and adjacency do not depend on the terrain shuffle. */
export function createBaseBoard(seed: string): Board {
  const random = seededRandom(`${seed}:board`);
  const locations = coordinates(2);
  const terrains = shuffled(TERRAIN, random);
  const vertices: Record<VertexId, Vertex> = {};
  const edges: Record<EdgeId, Edge> = {};
  const hexes: Record<HexId, Hex> = {};

  locations.forEach(([q, r], index) => {
    const id = hexId(q, r);
    const centerX = 2 * q + r;
    const centerY = 3 * r;
    const vertexIds = CORNERS.map(([dx, dy]) => vertexId(centerX + dx, centerY + dy));
    const edgeIds: EdgeId[] = [];
    vertexIds.forEach((vid, corner) => {
      if (!vertices[vid]) {
        const [dx, dy] = CORNERS[corner]!;
        vertices[vid] = { id: vid, x: centerX + dx, y: centerY + dy, hexIds: [], edgeIds: [], neighborIds: [] };
      }
      addUnique(vertices[vid]!.hexIds, id);
      const nextVid = vertexIds[(corner + 1) % 6]!;
      const eid = edgeId(vid, nextVid);
      edgeIds.push(eid);
      if (!edges[eid]) edges[eid] = { id: eid, vertexIds: [vid, nextVid], hexIds: [] };
      addUnique(edges[eid]!.hexIds, id);
    });
    hexes[id] = {
      id, q, r, terrain: terrains[index]!, number: null, vertexIds, edgeIds,
    };
  });

  Object.values(edges).forEach((edge) => {
    const [a, b] = edge.vertexIds;
    addUnique(vertices[a]!.edgeIds, edge.id);
    addUnique(vertices[b]!.edgeIds, edge.id);
    addUnique(vertices[a]!.neighborIds, b);
    addUnique(vertices[b]!.neighborIds, a);
  });

  // Choose four non-adjacent land hexes for the 6 and 8 tokens.
  const land = Object.values(hexes).filter((hex) => hex.terrain !== 'desert');
  let redHexes: Hex[] = [];
  for (let attempt = 0; attempt < 100 && redHexes.length !== 4; attempt += 1) {
    const choice: Hex[] = [];
    for (const hex of shuffled(land, random)) {
      if (choice.every((other) =>
        Math.max(Math.abs(hex.q - other.q), Math.abs(hex.r - other.r), Math.abs(hex.q + hex.r - other.q - other.r)) > 1
      )) choice.push(hex);
      if (choice.length === 4) break;
    }
    redHexes = choice;
  }
  if (redHexes.length !== 4) throw new Error('Could not place Base red number tokens');
  const redNumbers = shuffled(RED_NUMBERS, random);
  redHexes.forEach((hex, index) => { hex.number = redNumbers[index]!; });
  const ordinaryNumbers = shuffled(NON_RED_NUMBERS, random);
  let numberIndex = 0;
  land.forEach((hex) => {
    if (hex.number === null) hex.number = ordinaryNumbers[numberIndex++]!;
  });

  const coastalEdges = Object.values(edges)
    .filter((edge) => edge.hexIds.length === 1)
    .sort((left, right) => {
      const midpoint = (edge: Edge) => {
        const [a, b] = edge.vertexIds.map((id) => vertices[id]!);
        return Math.atan2(a.y + b.y, Math.sqrt(3) * (a.x + b.x));
      };
      return midpoint(left) - midpoint(right);
    });
  if (coastalEdges.length !== 30) throw new Error('Unexpected Base coastline');
  const offset = Math.floor(random() * coastalEdges.length);
  const portTypes = shuffled(PORT_RESOURCES, random);
  const ports: Port[] = [];
  for (let i = 0; i < 9; i += 1) {
    const selected = coastalEdges[(Math.floor(i * coastalEdges.length / 9) + offset) % coastalEdges.length]!;
    const resource = portTypes[i]!;
    ports.push({ edgeId: selected.id, vertexIds: selected.vertexIds, ratio: resource === null ? 3 : 2, resource });
  }
  if (new Set(ports.flatMap((port) => port.vertexIds)).size !== 18) {
    throw new Error('Ports must occupy distinct coastline vertices');
  }
  if (Object.keys(hexes).length !== 19 || Object.keys(vertices).length !== 54 || Object.keys(edges).length !== 72) {
    throw new Error('Invalid Base board geometry');
  }
  return { hexes, vertices, edges, ports };
}
