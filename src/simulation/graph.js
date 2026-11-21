export const BASE_NODES = Object.freeze([
  { id: "A", name: "Sensory Input", role: "Source", activation: 0.85, capacity: 1 },
  { id: "B", name: "Primary Region 1", role: "Intermediate", activation: 0.8, capacity: 1 },
  { id: "C", name: "Primary Region 2", role: "Intermediate", activation: 0.85, capacity: 1 },
  { id: "D", name: "Alternative Region 1", role: "Intermediate", activation: 0.35, capacity: 1 },
  { id: "E", name: "Downstream Region", role: "Intermediate", activation: 0.7, capacity: 1 },
  { id: "F", name: "Target Function", role: "Target", activation: 0.9, capacity: 1 },
  { id: "G", name: "Relay Region 1", role: "Intermediate", activation: 0.32, capacity: 1 },
  { id: "H", name: "Relay Region 2", role: "Intermediate", activation: 0.38, capacity: 1 },
  { id: "I", name: "Alternative Relay 1", role: "Intermediate", activation: 0.28, capacity: 1 },
  { id: "J", name: "Alternative Relay 2", role: "Intermediate", activation: 0.42, capacity: 1 },
  { id: "K", name: "Secondary Relay 1", role: "Intermediate", activation: 0.34, capacity: 1 },
  { id: "L", name: "Secondary Relay 2", role: "Intermediate", activation: 0.3, capacity: 1 },
  { id: "M", name: "Peripheral Relay 1", role: "Intermediate", activation: 0.25, capacity: 1 },
  { id: "N", name: "Peripheral Relay 2", role: "Intermediate", activation: 0.39, capacity: 1 },
  { id: "O", name: "Downstream Relay 1", role: "Intermediate", activation: 0.33, capacity: 1 },
  { id: "P", name: "Downstream Relay 2", role: "Intermediate", activation: 0.27, capacity: 1 },
  { id: "Q", name: "Crosslink Relay 1", role: "Intermediate", activation: 0.36, capacity: 1 },
  { id: "R", name: "Crosslink Relay 2", role: "Intermediate", activation: 0.31, capacity: 1 },
]);

export const BASE_EDGES = Object.freeze([
  { id: "A-B", source: "A", target: "B", initialWeight: 0.9 },
  { id: "A-D", source: "A", target: "D", initialWeight: 0.3 },
  { id: "B-C", source: "B", target: "C", initialWeight: 0.85 },
  { id: "B-D", source: "B", target: "D", initialWeight: 0.25 },
  { id: "C-E", source: "C", target: "E", initialWeight: 0.8 },
  { id: "D-E", source: "D", target: "E", initialWeight: 0.35 },
  { id: "E-F", source: "E", target: "F", initialWeight: 0.9 },
  { id: "B-G", source: "B", target: "G", initialWeight: 0.34 },
  { id: "G-H", source: "G", target: "H", initialWeight: 0.28 },
  { id: "H-C", source: "H", target: "C", initialWeight: 0.32 },
  { id: "D-I", source: "D", target: "I", initialWeight: 0.3 },
  { id: "I-J", source: "I", target: "J", initialWeight: 0.28 },
  { id: "J-E", source: "J", target: "E", initialWeight: 0.3 },
  { id: "C-K", source: "C", target: "K", initialWeight: 0.32 },
  { id: "K-L", source: "K", target: "L", initialWeight: 0.28 },
  { id: "L-E", source: "L", target: "E", initialWeight: 0.32 },
  { id: "A-M", source: "A", target: "M", initialWeight: 0.3 },
  { id: "M-N", source: "M", target: "N", initialWeight: 0.26 },
  { id: "N-D", source: "N", target: "D", initialWeight: 0.3 },
  { id: "E-O", source: "E", target: "O", initialWeight: 0.3 },
  { id: "O-P", source: "O", target: "P", initialWeight: 0.28 },
  { id: "P-F", source: "P", target: "F", initialWeight: 0.3 },
  { id: "B-Q", source: "B", target: "Q", initialWeight: 0.32 },
  { id: "Q-R", source: "Q", target: "R", initialWeight: 0.28 },
  { id: "R-D", source: "R", target: "D", initialWeight: 0.32 },
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
    if (!node?.id || this.nodes.has(node.id))
      throw new Error(`Invalid or duplicate node ID: ${node?.id ?? "(empty)"}`);
    const record = { ...node, capacity: node.capacity ?? 1, status: node.status ?? "active" };
    if (!Number.isFinite(record.capacity) || record.capacity < 0 || record.capacity > 1)
      throw new Error(`Invalid capacity for node ${record.id}.`);
    this.nodes.set(record.id, record);
    this.adjacency.set(record.id, new Set());
    return record;
  }

  addEdge(edge) {
    if (!edge?.id || this.edges.has(edge.id))
      throw new Error(`Invalid or duplicate edge ID: ${edge?.id ?? "(empty)"}`);
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target) || edge.source === edge.target)
      throw new Error(`Invalid node reference for edge ${edge.id}.`);
    const initialWeight = edge.initialWeight ?? edge.weight;
    const weight = edge.weight ?? initialWeight;
    if (
      !Number.isFinite(initialWeight) ||
      initialWeight < 0 ||
      initialWeight > 1 ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1
    )
      throw new Error(`Invalid weight for edge ${edge.id}.`);
    const record = {
      ...edge,
      initialWeight,
      weight,
      active: edge.active ?? true,
      damageSeverity: edge.damageSeverity ?? 0,
      usageCount: edge.usageCount ?? 0,
    };
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
    edge.weight = 0;
  }

  updateEdgeWeight(id, weight) {
    const edge = this.getEdge(id);
    if (!edge) throw new Error(`Edge ${id} was not found.`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw new Error(`Weight for ${id} must be between 0 and 1.`);
    edge.weight = weight;
    if (weight === 0) edge.active = false;
    return edge;
  }

  getNode(id) {
    return this.nodes.get(id);
  }
  getEdge(id) {
    return this.edges.get(id);
  }

  getNeighbors(id) {
    const node = this.getNode(id);
    if (!node || node.capacity <= 0 || node.status !== "active") return [];
    const neighbors = [];
    for (const edgeId of this.adjacency.get(id) ?? []) {
      const edge = this.getEdge(edgeId);
      if (!isEdgeTraversable(this, edge, id)) continue;
      const neighborId = edge.source === id ? edge.target : edge.source;
      const neighbor = this.getNode(neighborId);
      neighbors.push({ node: neighbor, edge });
    }
    return neighbors;
  }

  rebuildActiveGraph() {
    this.adjacency = new Map([...this.nodes.keys()].map((id) => [id, new Set()]));
    for (const edge of this.edges.values()) {
      if (!this.adjacency.has(edge.source) || !this.adjacency.has(edge.target))
        throw new Error(`Edge ${edge.id} references a missing node.`);
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
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target))
        errors.push(`Edge ${id} references a missing node.`);
      if (!Number.isFinite(edge.weight) || edge.weight < 0 || edge.weight > 1)
        errors.push(`Edge ${id} has an invalid weight.`);
      if (!this.adjacency.get(edge.source)?.has(id) || !this.adjacency.get(edge.target)?.has(id))
        errors.push(`Edge ${id} is missing from an adjacency list.`);
    }
    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      nodes: [...this.nodes.values()].map((node) => ({ ...node })),
      edges: [...this.edges.values()].map((edge) => ({ ...edge })),
    };
  }
  clone() {
    return new WeightedGraph(this.toJSON());
  }
  static baseline() {
    return new WeightedGraph({ nodes: BASE_NODES, edges: BASE_EDGES });
  }

  static fromJSON(json) {
    return new WeightedGraph(json);
  }
}

export function nodeIsActive(node) {
  return Boolean(node && node.capacity > 0 && node.status === "active");
}

export function isEdgeTraversable(graph, edge, fromId) {
  if (!edge?.active || !Number.isFinite(edge.weight) || edge.weight <= 0) return false;
  const fromNode = graph.getNode(fromId ?? edge.source);
  const toId = fromId ? (edge.source === fromId ? edge.target : edge.source) : edge.target;
  const toNode = graph.getNode(toId);
  if (!nodeIsActive(fromNode) || !nodeIsActive(toNode)) return false;
  return Number.isFinite(traversalCost(edge, fromNode, toNode));
}

export function isEdgeVisuallyTraversable(graph, edge) {
  if (!edge) return false;
  const source = graph.getNode(edge.source);
  const target = graph.getNode(edge.target);
  if (!nodeIsActive(source) || !nodeIsActive(target)) return false;
  return edge.active && edge.weight > 0;
}

export function edgesBetween(graph, from, to) {
  const matches = [];
  for (const edgeId of graph.adjacency.get(from) ?? []) {
    const edge = graph.getEdge(edgeId);
    if (!edge) continue;
    if (
      (edge.source === from && edge.target === to) ||
      (edge.source === to && edge.target === from)
    ) {
      matches.push(edge);
    }
  }
  return matches;
}

export function lowestCostEdgeBetween(graph, from, to) {
  const fromNode = graph.getNode(from);
  const toNode = graph.getNode(to);
  let best = null;
  let bestCost = Infinity;
  for (const edge of edgesBetween(graph, from, to)) {
    if (!isEdgeTraversable(graph, edge, from)) continue;
    const step = traversalCost(edge, fromNode, toNode);
    if (step < bestCost) {
      bestCost = step;
      best = edge;
    }
  }
  return best;
}

export class MinPriorityQueue {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
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
        const child =
          right < this.items.length && this.items[right].priority < this.items[left].priority
            ? right
            : left;
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
  if (!graph.getNode(source))
    return { reachable: false, path: [], error: `Source node ${source} was not found.` };
  if (!graph.getNode(target))
    return { reachable: false, path: [], error: `Target node ${target} was not found.` };
  const first = graph.getNode(source);
  if (first.capacity <= 0 || first.status !== "active")
    return { reachable: false, path: [], error: `Source node ${source} is unavailable.` };
  const queue = [source];
  let head = 0;
  const visited = new Set([source]);
  const parent = new Map();
  const parentEdge = new Map();
  while (head < queue.length) {
    const current = queue[head++];
    if (current === target) break;
    for (const { node, edge } of graph.getNeighbors(current)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      parent.set(node.id, current);
      parentEdge.set(node.id, edge.id);
      queue.push(node.id);
    }
  }
  if (!visited.has(target)) return { reachable: false, path: [], edgeIds: [], error: null };
  const path = [target];
  const edgeIds = [];
  while (path[0] !== source) {
    const step = path[0];
    edgeIds.unshift(parentEdge.get(step));
    path.unshift(parent.get(step));
  }
  return { reachable: true, path, edgeIds, edgeCount: path.length - 1, error: null };
}

export function depthFirstPaths(graph, source, target, maxPaths = 12) {
  if (!Number.isInteger(maxPaths) || maxPaths < 1)
    throw new Error("Path limit must be a positive integer.");
  if (!graph.getNode(source) || !graph.getNode(target)) return [];
  if (graph.getNode(source).capacity <= 0 || graph.getNode(source).status !== "active") return [];
  const paths = [];
  const visited = new Set([source]);
  const path = [source];
  function visit(current) {
    if (paths.length >= maxPaths) return;
    if (current === target) {
      paths.push([...path]);
      return;
    }
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
  if (!graph.getNode(source))
    return {
      reachable: false,
      path: [],
      cost: Infinity,
      error: `Source node ${source} was not found.`,
    };
  if (!graph.getNode(target))
    return {
      reachable: false,
      path: [],
      cost: Infinity,
      error: `Target node ${target} was not found.`,
    };
  const sourceNode = graph.getNode(source);
  if (sourceNode.capacity <= 0 || sourceNode.status !== "active")
    return {
      reachable: false,
      path: [],
      cost: Infinity,
      error: `Source node ${source} is unavailable.`,
    };
  const distances = new Map([...graph.nodes.keys()].map((id) => [id, Infinity]));
  const parent = new Map();
  const parentEdge = new Map();
  const queue = new MinPriorityQueue();
  distances.set(source, 0);
  queue.push(source, 0);
  while (queue.size) {
    const current = queue.pop();
    if (!current) break;
    const { value: id, priority } = current;
    if (priority !== distances.get(id)) continue;
    if (id === target) break;
    const fromNode = graph.getNode(id);
    for (const { node, edge } of graph.getNeighbors(id)) {
      const step = traversalCost(edge, fromNode, node);
      if (!Number.isFinite(step)) continue;
      const candidate = priority + step;
      if (candidate < distances.get(node.id)) {
        distances.set(node.id, candidate);
        parent.set(node.id, id);
        parentEdge.set(node.id, edge.id);
        queue.push(node.id, candidate);
      }
    }
  }
  const cost = distances.get(target);
  if (!Number.isFinite(cost))
    return { reachable: false, path: [], cost: Infinity, edgeIds: [], error: null };
  const path = [target];
  const edgeIds = [];
  while (path[0] !== source) {
    const nodeId = path[0];
    const previous = parent.get(nodeId);
    const traversed = parentEdge.get(nodeId);
    if (!previous || !traversed)
      return { reachable: false, path: [], cost: Infinity, edgeIds: [], error: null };
    edgeIds.unshift(traversed);
    path.unshift(previous);
  }
  return { reachable: true, path, cost, edgeIds, error: null };
}

export function pathToEdgeIds(graph, path) {
  const ids = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const edge = lowestCostEdgeBetween(graph, path[index], path[index + 1]);
    if (!edge) return [];
    ids.push(edge.id);
  }
  return ids;
}

export function validateGraphIntegrity(graph) {
  const errors = [];
  const structural = graph.validate();
  if (!structural.valid) errors.push(...structural.errors);
  for (const edge of graph.edges.values()) {
    const source = graph.getNode(edge.source);
    const target = graph.getNode(edge.target);
    const traversable =
      isEdgeTraversable(graph, edge, edge.source) || isEdgeTraversable(graph, edge, edge.target);
    const endpointsActive = nodeIsActive(source) && nodeIsActive(target);
    if (endpointsActive && edge.active && edge.weight > 0 && !traversable) {
      errors.push(`Edge ${edge.id} is marked active but cannot be traversed.`);
    }
    if ((!nodeIsActive(source) || !nodeIsActive(target)) && traversable) {
      errors.push(`Edge ${edge.id} is traversable while an endpoint is unavailable.`);
    }
    if (
      !graph.adjacency.get(edge.source)?.has(edge.id) ||
      !graph.adjacency.get(edge.target)?.has(edge.id)
    ) {
      errors.push(`Edge ${edge.id} is missing from an adjacency list.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export const SIMPLE_PATH_LIMIT = 200;

export function traversalCost(edge, fromNode, toNode) {
  const weight = edge?.weight;
  const fromCapacity = fromNode?.capacity;
  const toCapacity = toNode?.capacity;
  if (!Number.isFinite(weight) || weight <= 0) return Infinity;
  if (
    !Number.isFinite(fromCapacity) ||
    fromCapacity <= 0 ||
    !Number.isFinite(toCapacity) ||
    toCapacity <= 0
  )
    return Infinity;
  return 1 / (weight * fromCapacity * toCapacity);
}

export function networkHasDamage(graph) {
  for (const edge of graph.edges.values()) {
    if (edge.damageSeverity > 0 || !edge.active || edge.weight <= 0) return true;
  }
  for (const node of graph.nodes.values()) {
    if (node.capacity < 1 || node.status !== "active") return true;
  }
  return false;
}

export function simulatedPerformance(baselineCost, current) {
  if (!current?.reachable || !Number.isFinite(baselineCost)) return 0;
  if (current.cost === 0) return 1;
  return baselineCost / current.cost;
}

export function analyzeConnectivity(graph, source, target, baselineCost) {
  const current = dijkstra(graph, source, target);
  const paths = depthFirstPaths(graph, source, target, SIMPLE_PATH_LIMIT);
  const activeNodes = [...graph.nodes.values()].filter(
    (node) => node.capacity > 0 && node.status === "active",
  );
  const activeEdges = [...graph.edges.values()].filter((edge) =>
    isEdgeVisuallyTraversable(graph, edge),
  );
  const components = connectedComponents(graph);
  const { bridges, articulationPoints } = findBridgesAndArticulationPoints(graph);
  return {
    reachable: current.reachable,
    current,
    activeNodeCount: activeNodes.length,
    activeEdgeCount: activeEdges.length,
    disruptedEdgeCount: [...graph.edges.values()].filter(
      (edge) => !edge.active || edge.weight === 0,
    ).length,
    damagedNodeCount: [...graph.nodes.values()].filter((node) => node.capacity < 1).length,
    averageWeight: activeEdges.length
      ? activeEdges.reduce((total, edge) => total + edge.weight, 0) / activeEdges.length
      : 0,
    alternativePathCount: paths.length,
    simplePathsLimited: paths.length >= SIMPLE_PATH_LIMIT,
    performance: simulatedPerformance(baselineCost, current),
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
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          stack.push(neighbor.id);
        }
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
      } else if (neighbor !== parent.get(id))
        low.set(id, Math.min(low.get(id), discovery.get(neighbor)));
    }
  }
  for (const node of graph.nodes.values())
    if (node.capacity > 0 && node.status === "active" && !discovery.has(node.id)) visit(node.id);
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
  if (edge.active && edge.damageSeverity === 0)
    throw new Error(`Edge ${edgeId} is already active.`);
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
  if (node.capacity === 1 && node.status === "active")
    throw new Error(`Node ${nodeId} is already active.`);
  node.capacity = 1;
  node.status = "active";
  graph.rebuildActiveGraph();
  return node;
}

function validateSeverity(severity) {
  if (!Number.isFinite(severity) || severity <= 0 || severity > 100)
    throw new Error("Damage severity must be greater than 0% and at most 100%.");
}

export function plasticityWeightUpdate(weight, activity, learningRate, decayRate) {
  const w = weight ?? 0;
  const eta = learningRate;
  const lambda = decayRate;
  const a = activity ? 1 : 0;
  return Math.max(0, Math.min(1, w + eta * a * (1 - w) - lambda * w));
}

export function adaptationStep(
  graph,
  source,
  target,
  learningRate,
  decayRate,
  iteration,
  options = {},
) {
  if (!Number.isFinite(learningRate) || learningRate < 0 || learningRate > 1)
    throw new Error("Learning rate must be between 0 and 1.");
  if (!Number.isFinite(decayRate) || decayRate < 0 || decayRate > 1)
    throw new Error("Decay rate must be between 0 and 1.");
  const convergenceEpsilon = options.convergenceEpsilon ?? 1e-6;
  const previousEdgeIds = options.previousEdgeIds ?? null;
  const route = dijkstra(graph, source, target);
  if (!route.reachable)
    return {
      reachable: false,
      path: [],
      edgeIds: [],
      changes: [],
      error: route.error ?? "Target is unreachable; no pathway was adapted.",
      iteration,
      pathChanged: false,
      converged: false,
      saturated: false,
      cost: Infinity,
    };
  const selectedEdges = new Set(route.edgeIds);
  const changes = [];
  for (const edge of graph.edges.values()) {
    if (!isEdgeTraversable(graph, edge, edge.source)) continue;
    const activity = selectedEdges.has(edge.id) ? 1 : 0;
    const previous = edge.weight;
    const nextWeight = plasticityWeightUpdate(previous, activity, learningRate, decayRate);
    edge.weight = nextWeight;
    if (edge.weight === 0) edge.active = false;
    if (activity > 0) edge.usageCount += 1;
    if (Math.abs(edge.weight - previous) > Number.EPSILON)
      changes.push({ edgeId: edge.id, previous, weight: edge.weight, activity });
  }
  const pathChanged =
    Boolean(previousEdgeIds) && JSON.stringify(previousEdgeIds) !== JSON.stringify(route.edgeIds);
  const pathEdgeChanges = changes.filter((change) => selectedEdges.has(change.edgeId));
  const maxPathDelta = pathEdgeChanges.reduce(
    (max, change) => Math.max(max, Math.abs(change.weight - change.previous)),
    0,
  );
  const converged =
    route.reachable && pathEdgeChanges.length > 0 && maxPathDelta < convergenceEpsilon;
  const saturated = route.edgeIds.every((id) => {
    const edge = graph.getEdge(id);
    return (
      edge && isEdgeTraversable(graph, edge, edge.source) && edge.weight >= 1 - convergenceEpsilon
    );
  });
  const refreshed = dijkstra(graph, source, target);
  return {
    reachable: true,
    path: route.path,
    edgeIds: route.edgeIds,
    changes,
    iteration,
    pathChanged,
    converged,
    saturated,
    cost: refreshed.cost,
  };
}

export const BASELINE_COST = 1 / 0.9 + 1 / 0.85 + 1 / 0.8 + 1 / 0.9;
