import { describe, expect, it } from "vitest";
import {
  BASELINE_COST,
  SIMPLE_PATH_LIMIT,
  WeightedGraph,
  adaptationStep,
  analyzeConnectivity,
  applyEdgeDamage,
  applyNodeDamage,
  breadthFirstSearch,
  depthFirstPaths,
  dijkstra,
  networkHasDamage,
  restoreEdge,
  restoreNode,
  simulatedPerformance,
  traversalCost,
} from "./graph.js";

const closeTo = (value, expected) => expect(value).toBeCloseTo(expected, 4);

describe("deterministic neural graph model", () => {
  it("loads the 18-node network and preserves the baseline path and cost", () => {
    const graph = WeightedGraph.baseline();
    expect(graph.nodes.size).toBe(18);
    expect(graph.edges.size).toBe(25);
    expect(breadthFirstSearch(graph, "A", "F").reachable).toBe(true);
    expect(dijkstra(graph, "A", "F").path).toEqual(["A", "B", "C", "E", "F"]);
    closeTo(dijkstra(graph, "A", "F").cost, 4.6487);
    closeTo(dijkstra(graph, "A", "F").cost, BASELINE_COST);
    closeTo(1 / 0.3 + 1 / 0.35 + 1 / 0.9, 7.3016);
  });

  it("disrupts B-C without deleting its identity and selects the surviving route", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    expect(graph.getEdge("B-C").active).toBe(false);
    expect(graph.getEdge("B-C").initialWeight).toBe(0.85);
    expect(breadthFirstSearch(graph, "A", "F").path).toEqual(["A", "D", "E", "F"]);
    expect(dijkstra(graph, "A", "F").path).toEqual(["A", "D", "E", "F"]);
    closeTo(dijkstra(graph, "A", "F").cost, 7.3016);
    expect(graph.getNeighbors("B").some(({ edge }) => edge.id === "B-C")).toBe(false);
  });

  it("keeps F reachable through relay paths when B-C and D-E are disrupted", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    applyEdgeDamage(graph, "D-E", 100);
    expect(breadthFirstSearch(graph, "A", "F").path).toEqual(["A", "D", "I", "J", "E", "F"]);
    const route = dijkstra(graph, "A", "F");
    expect(route.reachable).toBe(true);
    expect(route.path).toEqual(["A", "B", "G", "H", "C", "E", "F"]);
    closeTo(route.cost, 13.1098);
    const metrics = analyzeConnectivity(graph, "A", "F", BASELINE_COST);
    expect(metrics.performance).toBeGreaterThan(0);
    expect(metrics.performance).toBeLessThan(1);
    closeTo(metrics.performance, BASELINE_COST / route.cost);
  });

  it("applies the activity-dependent learning formula over three iterations", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ id: "A-B", source: "A", target: "B", initialWeight: 0.3 }],
    });
    const values = [];
    for (let iteration = 1; iteration <= 3; iteration += 1) {
      adaptationStep(graph, "A", "B", 0.1, 0, iteration);
      values.push(graph.getEdge("A-B").weight);
    }
    expect(values[0]).toBeCloseTo(0.37, 10);
    expect(values[1]).toBeCloseTo(0.433, 10);
    expect(values[2]).toBeCloseTo(0.4897, 10);
  });

  it("gradually strengthens a partially damaged active edge along the selected route", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 40);
    const damagedWeight = graph.getEdge("B-C").weight;
    const firstStep = adaptationStep(graph, "A", "F", 0.1, 0, 1);
    const firstWeight = graph.getEdge("B-C").weight;
    const secondStep = adaptationStep(graph, "A", "F", 0.1, 0, 2);

    expect(firstStep.path).toEqual(["A", "B", "C", "E", "F"]);
    expect(secondStep.path).toEqual(firstStep.path);
    expect(firstWeight).toBeGreaterThan(damagedWeight);
    expect(graph.getEdge("B-C").weight).toBeGreaterThan(firstWeight);
    expect(graph.getEdge("B-C").weight).toBeLessThan(graph.getEdge("B-C").initialWeight);
    expect(graph.getEdge("B-C").active).toBe(true);
    expect(graph.getEdge("B-C").damageSeverity).toBe(40);
  });

  it("strengthens only active edges on the surviving route and keeps weights bounded", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    const before = graph.getEdge("A-B").weight;
    const step = adaptationStep(graph, "A", "F", 0.1, 0, 1);
    expect(step.path).toEqual(["A", "D", "E", "F"]);
    expect(graph.getEdge("A-D").weight).toBeCloseTo(0.37);
    expect(graph.getEdge("D-E").weight).toBeCloseTo(0.415);
    expect(graph.getEdge("E-F").weight).toBeCloseTo(0.91);
    expect(graph.getEdge("A-B").weight).toBe(before);
    expect(graph.getEdge("B-C").weight).toBe(0);
    expect(graph.getEdge("B-C").active).toBe(false);
    expect(graph.getEdge("B-C").initialWeight).toBe(0.85);
    for (const edge of graph.edges.values()) expect(edge.weight).toBeGreaterThanOrEqual(0);
    for (const edge of graph.edges.values()) expect(edge.weight).toBeLessThanOrEqual(1);
  });

  it("restores the original B-C edge record and route", () => {
    const graph = WeightedGraph.baseline();
    const original = graph.getEdge("B-C");
    applyEdgeDamage(graph, "B-C", 100);
    restoreEdge(graph, "B-C");
    expect(graph.getEdge("B-C")).toBe(original);
    expect(graph.getEdge("B-C").weight).toBe(0.85);
    expect(dijkstra(graph, "A", "F").path).toEqual(["A", "B", "C", "E", "F"]);
  });

  it("blocks traversal through unavailable nodes and restores their connections", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "E", 100);
    expect(graph.getNode("E").status).toBe("unavailable");
    expect(breadthFirstSearch(graph, "A", "F").reachable).toBe(false);
    expect(dijkstra(graph, "A", "F").reachable).toBe(false);
    expect(analyzeConnectivity(graph, "A", "F", BASELINE_COST).performance).toBe(0);
    expect(graph.edges.size).toBe(25);
    restoreNode(graph, "E");
    expect(graph.edges.size).toBe(25);
    expect(dijkstra(graph, "A", "F").reachable).toBe(true);
  });

  it("finds simple routes with a limit and calculates bridges separately from articulation points", () => {
    const graph = WeightedGraph.baseline();
    expect(depthFirstPaths(graph, "A", "F", 1)).toHaveLength(1);
    const result = analyzeConnectivity(graph, "A", "F", BASELINE_COST);
    expect(result.bridges).toEqual([]);
    expect(result.articulationPoints).toEqual(["E"]);
    expect(result.alternativePathCount).toBe(56);
    expect(result.simplePathsLimited).toBe(false);
    expect(result.alternativePathCount).toBeLessThan(SIMPLE_PATH_LIMIT);
  });

  it("rejects invalid weights, damage settings, paths, and missing nodes", () => {
    const graph = WeightedGraph.baseline();
    expect(() => graph.updateEdgeWeight("A-B", -0.1)).toThrow();
    expect(() => applyEdgeDamage(graph, "A-B", 101)).toThrow();
    expect(() => applyEdgeDamage(graph, "A-B", 0)).toThrow(/greater than 0%/i);
    expect(() => applyNodeDamage(graph, "C", 0)).toThrow(/greater than 0%/i);
    expect(() => depthFirstPaths(graph, "A", "F", 0)).toThrow();
    expect(dijkstra(graph, "Z", "F").error).toMatch(/not found/i);
  });

  it("produces reproducible states and valid adjacency records", () => {
    const run = () => {
      const graph = WeightedGraph.baseline();
      applyEdgeDamage(graph, "B-C", 100);
      adaptationStep(graph, "A", "F", 0.1, 0, 1);
      return graph.toJSON();
    };
    expect(run()).toEqual(run());
    expect(WeightedGraph.baseline().validate().valid).toBe(true);
  });

  it("treats partial edge and node damage as network damage without removing records", () => {
    const graph = WeightedGraph.baseline();
    expect(networkHasDamage(graph)).toBe(false);
    applyEdgeDamage(graph, "B-C", 40);
    expect(networkHasDamage(graph)).toBe(true);
    expect(graph.edges.size).toBe(25);
    expect(graph.getEdge("B-C").active).toBe(true);
    const nodes = WeightedGraph.baseline();
    applyNodeDamage(nodes, "C", 40);
    expect(networkHasDamage(nodes)).toBe(true);
    expect(nodes.getNode("C").status).toBe("active");
  });

  it("keeps healthy traversal cost identical to 1 / weight and raises it with partial node damage", () => {
    expect(traversalCost({ weight: 0.9 }, { capacity: 1 }, { capacity: 1 })).toBeCloseTo(
      1 / 0.9,
      10,
    );
    expect(traversalCost({ weight: 0.9 }, { capacity: 1 }, { capacity: 0.5 })).toBeCloseTo(
      1 / 0.45,
      10,
    );
    const graph = WeightedGraph.baseline();
    const healthy = dijkstra(graph, "A", "F");
    closeTo(healthy.cost, BASELINE_COST);
    applyNodeDamage(graph, "M", 40);
    const peripheral = dijkstra(graph, "A", "F");
    expect(peripheral.path).toEqual(healthy.path);
    closeTo(peripheral.cost, healthy.cost);
    applyNodeDamage(graph, "C", 40);
    const damaged = dijkstra(graph, "A", "F");
    expect(damaged.reachable).toBe(true);
    expect(damaged.cost).toBeGreaterThan(healthy.cost);
    expect(graph.getNode("C").capacity).toBeCloseTo(0.6, 10);
  });

  it("routes around a severely impaired node while a full-capacity baseline stays on A-B-C-E-F", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "C", 90);
    expect(dijkstra(graph, "A", "F").path).toEqual(["A", "D", "E", "F"]);
    expect(breadthFirstSearch(graph, "A", "F").path).toEqual(["A", "D", "E", "F"]);
  });

  it("scores each source and target against that pair's own baseline", () => {
    const graph = WeightedGraph.baseline();
    const sameNode = dijkstra(graph, "A", "A");
    expect(sameNode.path).toEqual(["A"]);
    expect(sameNode.cost).toBe(0);
    expect(simulatedPerformance(0, sameNode)).toBe(1);
    const sideRoute = dijkstra(graph, "A", "M");
    closeTo(sideRoute.cost, 1 / 0.3);
    expect(analyzeConnectivity(graph, "A", "M", sideRoute.cost).performance).toBeCloseTo(1, 10);
    expect(analyzeConnectivity(graph, "A", "F", BASELINE_COST).performance).toBeCloseTo(1, 10);
  });

  it("lets adaptation improve on the baseline instead of clamping performance at 1", () => {
    const graph = WeightedGraph.baseline();
    adaptationStep(graph, "A", "F", 0.1, 0, 1);
    const metrics = analyzeConnectivity(graph, "A", "F", BASELINE_COST);
    expect(metrics.current.cost).toBeLessThan(BASELINE_COST);
    expect(metrics.performance).toBeGreaterThan(1);
    closeTo(metrics.performance, BASELINE_COST / metrics.current.cost);
  });

  it("marks an edge inactive when decay removes its weight and records full disruption as zero", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ id: "A-B", source: "A", target: "B", initialWeight: 0.5 }],
    });
    adaptationStep(graph, "A", "B", 0, 1, 1);
    expect(graph.getEdge("A-B").weight).toBe(0);
    expect(graph.getEdge("A-B").active).toBe(false);
    const baseline = WeightedGraph.baseline();
    baseline.removeEdge("B-C");
    expect(baseline.getEdge("B-C").weight).toBe(0);
    expect(baseline.getEdge("B-C").active).toBe(false);
    expect(baseline.getEdge("B-C").initialWeight).toBe(0.85);
  });
});
