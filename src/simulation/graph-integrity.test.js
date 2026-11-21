import { describe, expect, it } from "vitest";
import {
  WeightedGraph,
  adaptationStep,
  applyEdgeDamage,
  applyNodeDamage,
  breadthFirstSearch,
  dijkstra,
  isEdgeTraversable,
  isEdgeVisuallyTraversable,
  pathToEdgeIds,
  restoreNode,
  validateGraphIntegrity,
} from "./graph.js";
import { assertHighlightConsistent, buildSimulationView } from "./simulation-state.js";
import { generateSyntheticNetwork } from "./network-generator.js";

describe("graph integrity and path highlighting", () => {
  it("blocks edges when either endpoint is unavailable while preserving edge records", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "E", 100);
    const disrupted = [...graph.edges.values()].filter(
      (edge) => edge.source === "E" || edge.target === "E",
    );
    expect(disrupted.length).toBeGreaterThan(0);
    disrupted.forEach((edge) => {
      expect(isEdgeTraversable(graph, edge, edge.source)).toBe(false);
      expect(isEdgeVisuallyTraversable(graph, edge)).toBe(false);
      expect(graph.edges.has(edge.id)).toBe(true);
    });
    expect(dijkstra(graph, "A", "F").reachable).toBe(false);
    expect(validateGraphIntegrity(graph).valid).toBe(true);
  });

  it("reconnects traversal after node restoration", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "E", 100);
    restoreNode(graph, "E");
    expect(dijkstra(graph, "A", "F").reachable).toBe(true);
    expect(validateGraphIntegrity(graph).valid).toBe(true);
  });

  it("recomputes the highlight path after adaptation", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    const step = adaptationStep(graph, "A", "F", 0.1, 0, 1);
    const view = buildSimulationView(graph, WeightedGraph.baseline(), "A", "F");
    expect(step.reachable).toBe(true);
    expect(view.paths.current.path).toEqual(dijkstra(graph, "A", "F").path);
    expect(
      assertHighlightConsistent(graph, view.paths.current.path, view.paths.current.edgeIds),
    ).toBe(true);
  });

  it("clears highlight edges when the target is unreachable", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "F", 100);
    const view = buildSimulationView(graph, WeightedGraph.baseline(), "A", "F");
    expect(view.paths.current.path).toEqual([]);
    expect(view.paths.current.edgeIds).toEqual([]);
    expect(breadthFirstSearch(graph, "A", "F").reachable).toBe(false);
  });

  it("reconnects routing and highlights after unreachable damage is cleared", () => {
    const reference = WeightedGraph.baseline();
    const graph = new WeightedGraph(reference.toJSON());
    applyNodeDamage(graph, "F", 100);
    expect(buildSimulationView(graph, reference, "A", "F").paths.current.edgeIds).toEqual([]);
    restoreNode(graph, "F");
    const view = buildSimulationView(graph, reference, "A", "F");
    expect(view.paths.current.path).toEqual(dijkstra(graph, "A", "F").path);
    expect(
      assertHighlightConsistent(graph, view.paths.current.path, view.paths.current.edgeIds),
    ).toBe(true);
  });

  it("undo-style snapshot restore reverts damage and adaptation side effects", () => {
    const reference = WeightedGraph.baseline();
    const snapshot = reference.toJSON();
    const working = new WeightedGraph(snapshot);
    applyEdgeDamage(working, "B-C", 100);
    adaptationStep(working, "A", "F", 0.12, 0, 1);
    adaptationStep(working, "A", "F", 0.12, 0, 2);
    const restored = new WeightedGraph(snapshot);
    expect(validateGraphIntegrity(restored).valid).toBe(true);
    const baselineRoute = dijkstra(reference, "A", "F");
    const restoredRoute = dijkstra(restored, "A", "F");
    expect(restoredRoute.path).toEqual(baselineRoute.path);
    expect(restoredRoute.cost).toBeCloseTo(baselineRoute.cost, 5);
    expect(buildSimulationView(restored, reference, "A", "F").paths.current.edgeIds).toEqual(
      baselineRoute.edgeIds,
    );
  });

  it("repeated reset from snapshot keeps paths and highlights aligned", () => {
    const reference = WeightedGraph.baseline();
    const snapshot = reference.toJSON();
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const graph = new WeightedGraph(snapshot);
      applyNodeDamage(graph, "D", 80);
      applyEdgeDamage(graph, "E-F", 100);
      const rerouted = buildSimulationView(graph, reference, "A", "F");
      expect(rerouted.paths.current.path.length).toBeGreaterThan(0);
      const reset = new WeightedGraph(snapshot);
      const view = buildSimulationView(reset, reference, "A", "F");
      expect(view.paths.current.path).toEqual(dijkstra(reference, "A", "F").path);
      expect(
        assertHighlightConsistent(reset, view.paths.current.path, view.paths.current.edgeIds),
      ).toBe(true);
    }
  });

  it("keeps calculated edge ids aligned with the minimum-cost path", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    const route = dijkstra(graph, "A", "F");
    expect(assertHighlightConsistent(graph, route.path, route.edgeIds)).toBe(true);
    expect(route.edgeIds.every((id) => graph.getEdge(id))).toBe(true);
  });
});

describe("parallel edges", () => {
  it("selects the lowest-cost parallel edge in Dijkstra and path reconstruction", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
      edges: [
        { id: "A-B", source: "A", target: "B", initialWeight: 0.2 },
        { id: "A-B#2", source: "A", target: "B", initialWeight: 0.9 },
        { id: "B-C", source: "B", target: "C", initialWeight: 0.8 },
      ],
    });
    const route = dijkstra(graph, "A", "C");
    expect(route.edgeIds).toEqual(["A-B#2", "B-C"]);
    expect(pathToEdgeIds(graph, route.path)).toEqual(["A-B#2", "B-C"]);
  });

  it("damages and restores a single parallel edge without affecting its sibling", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [
        { id: "A-B", source: "A", target: "B", initialWeight: 0.25 },
        { id: "A-B#2", source: "A", target: "B", initialWeight: 0.8 },
      ],
    });
    applyEdgeDamage(graph, "A-B", 100);
    expect(isEdgeTraversable(graph, graph.getEdge("A-B"), "A")).toBe(false);
    expect(isEdgeTraversable(graph, graph.getEdge("A-B#2"), "A")).toBe(true);
    expect(dijkstra(graph, "A", "B").edgeIds).toEqual(["A-B#2"]);
    applyEdgeDamage(graph, "A-B#2", 100);
    expect(dijkstra(graph, "A", "B").reachable).toBe(false);
  });
});

describe("generated networks", () => {
  it("uses the unchanged A–F baseline when size is 18", () => {
    const generated = generateSyntheticNetwork(18);
    const baseline = WeightedGraph.baseline();
    const genRoute = dijkstra(generated, "A", "F");
    const baseRoute = dijkstra(baseline, "A", "F");
    expect(genRoute.path).toEqual(baseRoute.path);
    expect(genRoute.cost).toBeCloseTo(baseRoute.cost, 5);
    expect(genRoute.edgeIds).toEqual(baseRoute.edgeIds);
  });

  it.each([10, 30, 60])(
    "builds a connected %i-node network with designated source and target",
    (size) => {
      const graph = generateSyntheticNetwork(size);
      expect(graph.nodes.size).toBe(size);
      expect(validateGraphIntegrity(graph).valid).toBe(true);
      const route = dijkstra(graph, "A", "F");
      expect(route.reachable).toBe(true);
      expect(route.path[0]).toBe("A");
      expect(route.path.at(-1)).toBe("F");
    },
  );
});
