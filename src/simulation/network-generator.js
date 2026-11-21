import { BASE_EDGES, BASE_NODES, WeightedGraph } from "./graph.js";

export const MIN_NETWORK_NODES = 10;
export const MAX_NETWORK_NODES = 60;
export const BASELINE_NETWORK_NODES = 18;
export const DEFAULT_SOURCE_ID = "A";
export const DEFAULT_TARGET_ID = "F";

export function nodeIdForIndex(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return `N${index}`;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roleFor(id, source, target) {
  if (id === source) return "Source";
  if (id === target) return "Target";
  return "Intermediate";
}

function activationFor(index, random) {
  return Number((0.22 + random() * 0.63).toFixed(2));
}

function nameFor(id, role) {
  if (role === "Source") return "Sensory Input";
  if (role === "Target") return "Target Function";
  return `Region ${id}`;
}

function canonicalPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function weightFor(random, strong = false) {
  const min = strong ? 0.72 : 0.28;
  const max = strong ? 0.92 : 0.55;
  return Number((min + random() * (max - min)).toFixed(2));
}

export function generateSyntheticNetwork(nodeCount) {
  if (
    !Number.isInteger(nodeCount) ||
    nodeCount < MIN_NETWORK_NODES ||
    nodeCount > MAX_NETWORK_NODES
  ) {
    throw new Error(
      `Network size must be an integer between ${MIN_NETWORK_NODES} and ${MAX_NETWORK_NODES}.`,
    );
  }
  if (nodeCount === BASELINE_NETWORK_NODES) {
    return WeightedGraph.baseline();
  }

  const random = mulberry32(nodeCount * 92821);
  const ids = Array.from({ length: nodeCount }, (_, index) => nodeIdForIndex(index));
  const source = DEFAULT_SOURCE_ID;
  const target = DEFAULT_TARGET_ID;
  if (!ids.includes(source) || !ids.includes(target)) {
    throw new Error("Generated networks must include nodes A and F.");
  }

  const nodes = ids.map((id, index) => ({
    id,
    name: nameFor(id, roleFor(id, source, target)),
    role: roleFor(id, source, target),
    activation: activationFor(index, random),
    capacity: 1,
  }));

  const edges = [];
  const pairCounts = new Map();

  const addEdge = (from, to, initialWeight, forceId) => {
    if (from === to) return;
    const pair = canonicalPair(from, to);
    const next = (pairCounts.get(pair) ?? 0) + 1;
    pairCounts.set(pair, next);
    const id = forceId ?? (next === 1 ? `${from}-${to}` : `${from}-${to}#${next}`);
    if (edges.some((edge) => edge.id === id)) return;
    edges.push({ id, source: from, target: to, initialWeight });
  };

  for (let index = 0; index < ids.length - 1; index += 1) {
    addEdge(ids[index], ids[index + 1], weightFor(random, index < 3));
  }

  const sourceIndex = ids.indexOf(source);
  const targetIndex = ids.indexOf(target);
  for (let index = sourceIndex; index < targetIndex; index += 1) {
    addEdge(ids[index], ids[index + 1], weightFor(random, true));
  }

  const extraTarget = Math.max(4, Math.floor(nodeCount / 3));
  let attempts = 0;
  while (edges.length < nodeCount + extraTarget && attempts < nodeCount * 20) {
    attempts += 1;
    const from = ids[Math.floor(random() * ids.length)];
    const to = ids[Math.floor(random() * ids.length)];
    if (from === to) continue;
    addEdge(from, to, weightFor(random, random() > 0.55));
  }

  if ((pairCounts.get(canonicalPair(source, ids[1])) ?? 0) < 2 && ids.length > 2) {
    addEdge(source, ids[2], weightFor(random, false));
  }
  if (targetIndex > 1) {
    addEdge(ids[targetIndex - 1], target, weightFor(random, true));
    if (random() > 0.35) addEdge(ids[targetIndex - 2], target, weightFor(random, false));
  }

  const graph = new WeightedGraph({ nodes, edges });
  const validation = graph.validate();
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return graph;
}

export function baselineReferenceGraph(nodeCount = BASELINE_NETWORK_NODES) {
  return generateSyntheticNetwork(nodeCount);
}

export const BASELINE_NODE_COUNT = BASE_NODES.length;
export const BASELINE_EDGE_COUNT = BASE_EDGES.length;
