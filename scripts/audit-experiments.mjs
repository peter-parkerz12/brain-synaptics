/**
 * Independent verification harness for audit experiments (Node; no UI).
 */
import {
  WeightedGraph,
  adaptationStep,
  applyEdgeDamage,
  applyNodeDamage,
  breadthFirstSearch,
  depthFirstPaths,
  dijkstra,
  networkHasDamage,
  pathToEdgeIds,
  plasticityWeightUpdate,
  restoreNode,
  restoreEdge,
  traversalCost,
  validateGraphIntegrity,
} from "../src/simulation/graph.js";
import { generateSyntheticNetwork } from "../src/simulation/network-generator.js";
import {
  hasValidAlternativePath,
  runDisruptionAnalysis,
} from "../src/simulation/simulation-workflow.js";
import { plasticityStopReason, preparePlasticityRun } from "../src/simulation/plasticity-simulation.js";

const results = [];

function experiment(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

experiment("1 baseline A→F route and cost", () => {
  const g = WeightedGraph.baseline();
  const r = dijkstra(g, "A", "F");
  expect(r.path).toEqual(["A", "B", "C", "E", "F"]);
  const manual = pathToEdgeIds(g, r.path).reduce((sum, id) => {
    const e = g.getEdge(id);
    const a = g.getNode(e.source);
    const b = g.getNode(e.target);
    return sum + traversalCost(e, a, b);
  }, 0);
  expect(Math.abs(manual - r.cost) < 1e-9);
  return `cost=${r.cost.toFixed(6)}`;
});

experiment("2 partial B-C damage increases cost same path", () => {
  const g = WeightedGraph.baseline();
  applyEdgeDamage(g, "B-C", 40);
  const r = dijkstra(g, "A", "F");
  const base = dijkstra(WeightedGraph.baseline(), "A", "F");
  expect(r.path).toEqual(base.path);
  expect(r.cost).toBeGreaterThan(base.cost);
  expect(hasValidAlternativePath(WeightedGraph.baseline(), g, "A", "F")).toBe(false);
  return `alt=false cost=${r.cost.toFixed(4)}`;
});

experiment("3 complete B-C disruption reroutes", () => {
  const ref = WeightedGraph.baseline();
  const g = ref.clone();
  applyEdgeDamage(g, "B-C", 100);
  const r = dijkstra(g, "A", "F");
  expect(r.reachable).toBe(true);
  if (JSON.stringify(r.path) === JSON.stringify(["A", "B", "C", "E", "F"]))
    throw new Error("expected reroute away from baseline corridor");
  expect(hasValidAlternativePath(ref, g, "A", "F")).toBe(true);
  return r.path.join("→");
});

experiment("4 multiple simple paths", () => {
  const g = WeightedGraph.baseline();
  const paths = depthFirstPaths(g, "A", "F", 12);
  expect(paths.length).toBeGreaterThan(1);
  return `${paths.length} paths (cap 12)`;
});

experiment("5 disconnect via F node", () => {
  const ref = WeightedGraph.baseline();
  const g = ref.clone();
  applyNodeDamage(g, "F", 100);
  expect(dijkstra(g, "A", "F").reachable).toBe(false);
  const a = runDisruptionAnalysis(g, ref, "A", "F");
  expect(a.disconnected).toBe(true);
  return a.headline;
});

experiment("6 restore node E", () => {
  const ref = WeightedGraph.baseline();
  const g = ref.clone();
  applyNodeDamage(g, "E", 100);
  restoreNode(g, "E");
  expect(dijkstra(g, "A", "F").reachable).toBe(true);
  expect(networkHasDamage(g)).toBe(false);
  return "reachable";
});

experiment("7 parallel edges", () => {
  const g = new WeightedGraph({
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [
      { id: "A-B", source: "A", target: "B", initialWeight: 0.2 },
      { id: "A-B#2", source: "A", target: "B", initialWeight: 0.9 },
      { id: "B-C", source: "B", target: "C", initialWeight: 0.8 },
    ],
  });
  const r = dijkstra(g, "A", "C");
  expect(r.edgeIds).toEqual(["A-B#2", "B-C"]);
  applyEdgeDamage(g, "A-B#2", 100);
  expect(dijkstra(g, "A", "C").edgeIds).toEqual(["A-B", "B-C"]);
  return "parallel select ok";
});

experiment("8 plasticity after B-C cut", () => {
  const ref = WeightedGraph.baseline();
  const g = ref.clone();
  applyEdgeDamage(g, "B-C", 100);
  const before = dijkstra(g, "A", "F").cost;
  adaptationStep(g, "A", "F", 0.1, 0, 1);
  const after = dijkstra(g, "A", "F").cost;
  expect(after).toBeLessThan(before);
  for (const e of g.edges.values()) {
    if (e.weight < 0 || e.weight > 1) throw new Error(`weight out of range on ${e.id}`);
  }
  return `cost ${before.toFixed(4)}→${after.toFixed(4)}`;
});

experiment("9 network sizes 10/30/60", () => {
  for (const n of [10, 30, 60]) {
    const g = generateSyntheticNetwork(n);
    expect(validateGraphIntegrity(g).valid).toBe(true);
    expect(dijkstra(g, "A", "F").reachable).toBe(true);
  }
  return "all reachable";
});

experiment("10 learning formula spot check", () => {
  expect(plasticityWeightUpdate(0.3, 1, 0.1, 0)).toBeCloseTo(0.37, 12);
  expect(plasticityWeightUpdate(0.5, 0, 0.1, 0.05)).toBeCloseTo(0.475, 12);
  return "formula ok";
});

experiment("11 traversal uses weight and capacity", () => {
  const e = { weight: 0.5 };
  const n = { capacity: 0.5 };
  const c = traversalCost(e, n, n);
  expect(c).toBeCloseTo(1 / (0.5 * 0.5 * 0.5), 9);
  return `c=${c}`;
});

experiment("12 pathway reselection tracking", () => {
  const g = WeightedGraph.baseline();
  applyEdgeDamage(g, "B-C", 100);
  const s1 = adaptationStep(g, "A", "F", 0.05, 0, 1, { previousEdgeIds: null });
  const s2 = adaptationStep(g, "A", "F", 0.05, 0, 2, {
    previousEdgeIds: s1.edgeIds,
  });
  expect(s2.reachable).toBe(true);
  return `pathChanged=${s2.pathChanged}`;
});

console.log(JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);

function expect(value) {
  return {
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected))
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toBe(expected) {
      if (value !== expected) throw new Error(`expected ${expected}, got ${value}`);
    },
    toBeGreaterThan(n) {
      if (!(value > n)) throw new Error(`expected > ${n}, got ${value}`);
    },
    toBeLessThan(n) {
      if (!(value < n)) throw new Error(`expected < ${n}, got ${value}`);
    },
    toBeCloseTo(n, d = 9) {
      if (Math.abs(value - n) > 10 ** -d)
        throw new Error(`expected ~${n}, got ${value}`);
    },
  };
}