import { describe, expect, it } from "vitest";
import {
  BASELINE_COST, WeightedGraph, adaptationStep, analyzeConnectivity,
  applyEdgeDamage, applyNodeDamage, breadthFirstSearch, depthFirstPaths,
  dijkstra, restoreEdge, restoreNode,
} from "./graph.js";

const closeTo = (value, expected) => expect(value).toBeCloseTo(expected, 4);

describe("deterministic neural graph model", () => {
  it("loads the exact six-node, seven-edge baseline and expected path costs", () => {
    const graph = WeightedGraph.baseline();
    expect(graph.nodes.size).toBe(6);
    expect(graph.edges.size).toBe(7);
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

  it("returns no path when B-C and D-E are disrupted", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    applyEdgeDamage(graph, "D-E", 100);
    expect(breadthFirstSearch(graph, "A", "F").path).toEqual([]);
    expect(dijkstra(graph, "A", "F").reachable).toBe(false);
    expect(analyzeConnectivity(graph, "A", "F", BASELINE_COST).performance).toBe(0);
  });

  it("applies the activity-dependent learning formula over three iterations", () => {
    const graph = new WeightedGraph({ nodes: [{ id: "A" }, { id: "B" }], edges: [{ id: "A-B", source: "A", target: "B", initialWeight: 0.3 }] });
    const values = [];
    for (let iteration = 1; iteration <= 3; iteration += 1) {
      adaptationStep(graph, "A", "B", 0.1, 0, iteration);
      values.push(graph.getEdge("A-B").weight);
    }
    expect(values[0]).toBeCloseTo(0.37, 10);
    expect(values[1]).toBeCloseTo(0.433, 10);
    expect(values[2]).toBeCloseTo(0.4897, 10);
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
    expect(graph.getEdge("B-C").weight).toBe(0.85);
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
    expect(graph.edges.size).toBe(7);
    restoreNode(graph, "E");
    expect(dijkstra(graph, "A", "F").reachable).toBe(true);
  });

  it("finds simple routes with a limit and calculates bridges separately from articulation points", () => {
    const graph = WeightedGraph.baseline();
    expect(depthFirstPaths(graph, "A", "F", 1)).toHaveLength(1);
    const result = analyzeConnectivity(graph, "A", "F", BASELINE_COST);
    expect(result.bridges).toContain("E-F");
    expect(result.articulationPoints).toContain("E");
    expect(result.bridges).not.toContain("E");
    expect(result.alternativePathCount).toBeGreaterThan(1);
  });

  it("rejects invalid weights, damage settings, paths, and missing nodes", () => {
    const graph = WeightedGraph.baseline();
    expect(() => graph.updateEdgeWeight("A-B", -0.1)).toThrow();
    expect(() => applyEdgeDamage(graph, "A-B", 101)).toThrow();
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
});