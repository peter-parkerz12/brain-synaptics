export const BASE_NODES = Object.freeze([
  { id: "A", name: "Sensory Input", role: "Source", activation: 0.85, capacity: 1 },
  { id: "B", name: "Primary Region 1", role: "Intermediate", activation: 0.8, capacity: 1 },
  { id: "C", name: "Primary Region 2", role: "Intermediate", activation: 0.85, capacity: 1 },
  { id: "D", name: "Alternative Region 1", role: "Intermediate", activation: 0.35, capacity: 1 },
  { id: "E", name: "Downstream Region", role: "Intermediate", activation: 0.7, capacity: 1 },
  { id: "F", name: "Target Function", role: "Target", activation: 0.9, capacity: 1 },
]);

export const BASE_EDGES = Object.freeze([
  { id: "A-B", source: "A", target: "B", initialWeight: 0.9 },
  { id: "A-D", source: "A", target: "D", initialWeight: 0.3 },
  { id: "B-C", source: "B", target: "C", initialWeight: 0.85 },
  { id: "B-D", source: "B", target: "D", initialWeight: 0.25 },
  { id: "C-E", source: "C", target: "E", initialWeight: 0.8 },
  { id: "D-E", source: "D", target: "E", initialWeight: 0.35 },
  { id: "E-F", source: "E", target: "F", initialWeight: 0.9 },
]);

export class WeightedGraph {
  constructor({ nodes = [], edges = [] } = {}) {
    this.nodes = new Map();
    this.edges = new Map();
    this.adjacency = new Map();
    nodes.forEach((node) => this.addNode(node));
    edges.forEach((edge) => this.addEdge(edge));
  }

  addNode(node) {
    if (!node?.id || this.nodes.has(node.id)) throw new Error(`Invalid or duplicate node ID: ${node?.id ?? "(empty)"}`);
    const record = { ...node, capacity: node.capacity ?? 1, status: node.status ?? "active" };
    if (!Number.isFinite(record.capacity) || record.capacity < 0 || record.capacity > 1) throw new Error(`Invalid capacity for node ${record.id}.`);
    this.nodes.set(record.id, record);
    this.adjacency.set(record.id, new Set());
    return record;
  }

  addEdge(edge) {
    if (!edge?.id || this.edges.has(edge.id)) throw new Error(`Invalid or duplicate edge ID: ${edge?.id ?? "(empty)"}`);
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target) || edge.source === edge.target) throw new Error(`Invalid node reference for edge ${edge.id}.`);
    const initialWeight = edge.initialWeight ?? edge.weight;
    const weight = edge.weight ?? initialWeight;
    if (!Number.isFinite(initialWeight) || initialWeight < 0 || initialWeight > 1 || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Invalid weight for edge ${edge.id}.`);
    const record = { ...edge, initialWeight, weight, active: edge.active ?? true, damageSeverity: edge.damageSeverity ?? 0, usageCount: edge.usageCount ?? 0 };
    this.edges.set(record.id, record);
    this.adjacency.get(record.source).add(record.id);
    this.adjacency.get(record.target).add(record.id);
    return record;
  }

  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} was not found.`);
    node.capacity = 0;
    node.status = "unavailable";
    this.rebuildActiveGraph();
  }

  removeEdge(id) {
    const edge = this.getEdge(id);
    if (!edge) throw new Error(`Edge ${id} was not found.`);
    edge.active = false;
    edge.damageSeverity = 100;
  }

  updateEdgeWeight(id, weight) {
    const edge = this.getEdge(id);
    if (!edge) throw new Error(`Edge ${id} was not found.`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Weight for ${id} must be between 0 and 1.`);
    edge.weight = weight;
    if (weight === 0) edge.active = false;
    return edge;
  }

  getNode(id) { return this.nodes.get(id); }
  getEdge(id) { return this.edges.get(id); }

  getNeighbors(id) {
    const node = this.getNode(id);
    if (!node || node.capacity <= 0 || node.status !== "active") return [];
    const neighbors = [];
    for (const edgeId of this.adjacency.get(id) ?? []) {
      const edge = this.getEdge(edgeId);
      if (!edge?.active || !Number.isFinite(edge.weight) || edge.weight <= 0) continue;
      const neighborId = edge.source === id ? edge.target : edge.source;
      const neighbor = this.getNode(neighborId);
      if (neighbor?.capacity > 0 && neighbor.status === "active") neighbors.push({ node: neighbor, edge });
    }
    return neighbors;
  }

  rebuildActiveGraph() {
    this.adjacency = new Map([...this.nodes.keys()].map((id) => [id, new Set()]));
    for (const edge of this.edges.values()) {
      if (!this.adjacency.has(edge.source) || !this.adjacency.has(edge.target)) throw new Error(`Edge ${edge.id} references a missing node.`);
      this.adjacency.get(edge.source).add(edge.id);
      this.adjacency.get(edge.target).add(edge.id);
      if (edge.weight === 0) edge.active = false;
    }
    return this;
  }

  validate() {
    const errors = [];
    for (const [id, node] of this.nodes) {
      if (id !== node.id) errors.push(`Node map key mismatch: ${id}.`);
      if (!this.adjacency.has(id)) errors.push(`Missing adjacency list for ${id}.`);
    }
    for (const [id, edge] of this.edges) {
      if (id !== edge.id) errors.push(`Edge map key mismatch: ${id}.`);
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) errors.push(`Edge ${id} references a missing node.`);
      if (!Number.isFinite(edge.weight) || edge.weight < 0 || edge.weight > 1) errors.push(`Edge ${id} has an invalid weight.`);
      if (!this.adjacency.get(edge.source)?.has(id) || !this.adjacency.get(edge.target)?.has(id)) errors.push(`Edge ${id} is missing from an adjacency list.`);
    }
    return { valid: errors.length === 0, errors };
  }

  toJSON() { return { nodes: [...this.nodes.values()].map((node) => ({ ...node })), edges: [...this.edges.values()].map((edge) => ({ ...edge })) }; }
  clone() { return new WeightedGraph(this.toJSON()); }
  static baseline() { return new WeightedGraph({ nodes: BASE_NODES, edges: BASE_EDGES }); }
}

export class MinPriorityQueue {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value, priority) {
    const item = { value, priority };
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= item.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    if (!this.items.length) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].priority < this.items[left].priority ? right : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

export function breadthFirstSearch(graph, source, target) {
  if (!graph.getNode(source)) return { reachable: false, path: [], error: `Source node ${source} was not found.` };
  if (!graph.getNode(target)) return { reachable: false, path: [], error: `Target node ${target} was not found.` };
  const first = graph.getNode(source);
  if (first.capacity <= 0 || first.status !== "active") return { reachable: false, path: [], error: `Source node ${source} is unavailable.` };
  const queue = [source];
  let head = 0;
  const visited = new Set([source]);
  const parent = new Map();
  while (head < queue.length) {
    const current = queue[head++];
    if (current === target) break;
    for (const { node } of graph.getNeighbors(current)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      parent.set(node.id, current);
      queue.push(node.id);
    }
  }
  if (!visited.has(target)) return { reachable: false, path: [], error: null };
  const path = [target];
  while (path[0] !== source) path.unshift(parent.get(path[0]));
  return { reachable: true, path, edgeCount: path.length - 1, error: null };
}

export function depthFirstPaths(graph, source, target, maxPaths = 12) {
  if (!Number.isInteger(maxPaths) || maxPaths < 1) throw new Error("Path limit must be a positive integer.");
  if (!graph.getNode(source) || !graph.getNode(target)) return [];
  if (graph.getNode(source).capacity <= 0 || graph.getNode(source).status !== "active") return [];
  const paths = [];
  const visited = new Set([source]);
  const path = [source];
  function visit(current) {
    if (paths.length >= maxPaths) return;
    if (current === target) { paths.push([...path]); return; }
    for (const { node } of graph.getNeighbors(current)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      path.push(node.id);
      visit(node.id);
      path.pop();
      visited.delete(node.id);
      if (paths.length >= maxPaths) return;
    }
  }
  visit(source);
  return paths;
}

export function dijkstra(graph, source, target) {
  if (!graph.getNode(source)) return { reachable: false, path: [], cost: Infinity, error: `Source node ${source} was not found.` };
  if (!graph.getNode(target)) return { reachable: false, path: [], cost: Infinity, error: `Target node ${target} was not found.` };
  const sourceNode = graph.getNode(source);
  if (sourceNode.capacity <= 0 || sourceNode.status !== "active") return { reachable: false, path: [], cost: Infinity, error: `Source node ${source} is unavailable.` };
  const distances = new Map([...graph.nodes.keys()].map((id) => [id, Infinity]));
  const parent = new Map();
  const queue = new MinPriorityQueue();
  distances.set(source, 0);
  queue.push(source, 0);
  while (queue.size) {
    const current = queue.pop();
    if (!current) break;
    const { value: id, priority } = current;
    if (priority !== distances.get(id)) continue;
    if (id === target) break;
    for (const { node, edge } of graph.getNeighbors(id)) {
      if (!Number.isFinite(edge.weight) || edge.weight <= 0) continue;
      const candidate = priority + 1 / edge.weight;
      if (candidate < distances.get(node.id)) {
        distances.set(node.id, candidate);
        parent.set(node.id, id);
        queue.push(node.id, candidate);
      }
    }
  }
  const cost = distances.get(target);
  if (!Number.isFinite(cost)) return { reachable: false, path: [], cost: Infinity, error: null };
  const path = [target];
  while (path[0] !== source) {
    const previous = parent.get(path[0]);
    if (!previous) return { reachable: false, path: [], cost: Infinity, error: null };
    path.unshift(previous);
  }
  return { reachable: true, path, cost, edgeIds: pathToEdgeIds(graph, path), error: null };
}

export function pathToEdgeIds(graph, path) {
  const ids = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const edgeId = [...(graph.adjacency.get(path[index]) ?? [])].find((id) => {
      const edge = graph.getEdge(id);
      return edge?.active && edge.weight > 0 && (edge.source === path[index + 1] || edge.target === path[index + 1]);
    });
    if (edgeId) ids.push(edgeId);
  }
  return ids;
}

export function analyzeConnectivity(graph, source, target, baselineCost) {
  const current = dijkstra(graph, source, target);
  const paths = depthFirstPaths(graph, source, target, 24);
  const activeNodes = [...graph.nodes.values()].filter((node) => node.capacity > 0 && node.status === "active");
  const activeEdges = [...graph.edges.values()].filter((edge) => edge.active && edge.weight > 0 && graph.getNode(edge.source)?.capacity > 0 && graph.getNode(edge.target)?.capacity > 0);
  const components = connectedComponents(graph);
  const { bridges, articulationPoints } = findBridgesAndArticulationPoints(graph);
  return {
    reachable: current.reachable,
    current,
    activeNodeCount: activeNodes.length,
    activeEdgeCount: activeEdges.length,
    disruptedEdgeCount: [...graph.edges.values()].filter((edge) => !edge.active || edge.weight === 0).length,
    damagedNodeCount: [...graph.nodes.values()].filter((node) => node.capacity < 1).length,
    averageWeight: activeEdges.length ? activeEdges.reduce((total, edge) => total + edge.weight, 0) / activeEdges.length : 0,
    alternativePathCount: paths.length,
    performance: current.reachable && Number.isFinite(baselineCost) && current.cost > 0 ? Math.min(1, baselineCost / current.cost) : 0,
    components,
    bridges,
    articulationPoints,
  };
}

export function connectedComponents(graph) {
  const visited = new Set();
  const components = [];
  for (const node of graph.nodes.values()) {
    if (node.capacity <= 0 || node.status !== "active" || visited.has(node.id)) continue;
    const component = [];
    const stack = [node.id];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop();
      component.push(id);
      for (const { node: neighbor } of graph.getNeighbors(id)) {
        if (!visited.has(neighbor.id)) { visited.add(neighbor.id); stack.push(neighbor.id); }
      }
    }
    components.push(component.sort());
  }
  return components;
}

export function findBridgesAndArticulationPoints(graph) {
  let time = 0;
  const discovery = new Map();
  const low = new Map();
  const parent = new Map();
  const bridges = [];
  const articulationPoints = new Set();
  function visit(id) {
    discovery.set(id, ++time);
    low.set(id, time);
    let children = 0;
    for (const { node, edge } of graph.getNeighbors(id)) {
      const neighbor = node.id;
      if (!discovery.has(neighbor)) {
        parent.set(neighbor, id);
        children += 1;
        visit(neighbor);
        low.set(id, Math.min(low.get(id), low.get(neighbor)));
        if (low.get(neighbor) > discovery.get(id)) bridges.push(edge.id);
        if (!parent.has(id) && children > 1) articulationPoints.add(id);
        if (parent.has(id) && low.get(neighbor) >= discovery.get(id)) articulationPoints.add(id);
      } else if (neighbor !== parent.get(id)) low.set(id, Math.min(low.get(id), discovery.get(neighbor)));
    }
  }
  for (const node of graph.nodes.values()) if (node.capacity > 0 && node.status === "active" && !discovery.has(node.id)) visit(node.id);
  return { bridges: bridges.sort(), articulationPoints: [...articulationPoints].sort() };
}

export function applyEdgeDamage(graph, edgeId, severity) {
  const edge = graph.getEdge(edgeId);
  if (!edge) throw new Error(`Edge ${edgeId} was not found.`);
  if (!edge.active) throw new Error(`Edge ${edgeId} is already disrupted.`);
  validateSeverity(severity);
  edge.damageSeverity = severity;
  edge.weight = edge.initialWeight * (1 - severity / 100);
  edge.active = severity < 100 && edge.weight > 0;
  return edge;
}

export function restoreEdge(graph, edgeId) {
  const edge = graph.getEdge(edgeId);
  if (!edge) throw new Error(`Edge ${edgeId} was not found.`);
  if (edge.active && edge.damageSeverity === 0) throw new Error(`Edge ${edgeId} is already active.`);
  edge.weight = edge.initialWeight;
  edge.damageSeverity = 0;
  edge.active = true;
  return edge;
}

export function applyNodeDamage(graph, nodeId, severity) {
  const node = graph.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} was not found.`);
  validateSeverity(severity);
  node.capacity = 1 - severity / 100;
  node.status = severity === 100 ? "unavailable" : "active";
  graph.rebuildActiveGraph();
  return node;
}

export function restoreNode(graph, nodeId) {
  const node = graph.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} was not found.`);
  if (node.capacity === 1 && node.status === "active") throw new Error(`Node ${nodeId} is already active.`);
  node.capacity = 1;
  node.status = "active";
  graph.rebuildActiveGraph();
  return node;
}

function validateSeverity(severity) {
  if (!Number.isFinite(severity) || severity < 0 || severity > 100) throw new Error("Damage severity must be between 0 and 100%.");
}

export function adaptationStep(graph, source, target, learningRate, decayRate, iteration) {
  if (!Number.isFinite(learningRate) || learningRate < 0 || learningRate > 1) throw new Error("Learning rate must be between 0 and 1.");
  if (!Number.isFinite(decayRate) || decayRate < 0 || decayRate > 1) throw new Error("Decay rate must be between 0 and 1.");
  const route = dijkstra(graph, source, target);
  if (!route.reachable) return { reachable: false, path: [], changes: [], error: route.error ?? "Target is unreachable; no pathway was adapted." };
  const selectedEdges = new Set(route.edgeIds);
  const changes = [];
  for (const edge of graph.edges.values()) {
    if (!edge.active || edge.weight <= 0) continue;
    const activity = selectedEdges.has(edge.id) ? 1 : 0;
    const previous = edge.weight;
    edge.weight = Math.max(0, Math.min(1, previous + learningRate * activity * (1 - previous) - decayRate * previous));
    if (activity > 0) edge.usageCount += 1;
    if (Math.abs(edge.weight - previous) > Number.EPSILON) changes.push({ edgeId: edge.id, previous, weight: edge.weight, activity });
  }
  return { reachable: true, path: route.path, edgeIds: route.edgeIds, changes, iteration };
}

export const BASELINE_COST = 1 / 0.9 + 1 / 0.85 + 1 / 0.8 + 1 / 0.9;
