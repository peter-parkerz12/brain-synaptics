import { describe, expect, it } from "vitest";
import {
  WeightedGraph,
  adaptationStep,
  applyEdgeDamage,
  dijkstra,
  plasticityWeightUpdate,
} from "./graph.js";
import {
  plasticityStopReason,
  preparePlasticityRun,
  PLASTICITY_STOP_REASON,
} from "./plasticity-simulation.js";

describe("plasticity simulation", () => {
  it("applies the activity-dependent clamped update", () => {
    expect(plasticityWeightUpdate(0.3, 1, 0.1, 0)).toBeCloseTo(0.37, 10);
    expect(plasticityWeightUpdate(0.3, 0, 0.1, 0.1)).toBeCloseTo(0.27, 10);
  });

  it("can force plasticity on the current minimum-cost path without a qualifying alternative", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 40);
    const blocked = preparePlasticityRun(graph, reference, "A", "F");
    expect(blocked.ready).toBe(false);
    expect(blocked.reason).toBe(PLASTICITY_STOP_REASON.noAlternative);
    const forced = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(forced.ready).toBe(true);
    expect(forced.forced).toBe(true);
    expect(forced.route.path).not.toContain("B-C");
    expect(forced.route.edgeIds).not.toContain("B-C");
    expect(forced.route.path).toEqual(dijkstra(graph, "A", "F", { damageFreeOnly: true }).path);
  });

  it("prepares a run after B-C disruption with a live Dijkstra path", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    const prep = preparePlasticityRun(graph, reference, "A", "F");
    expect(prep.ready).toBe(true);
    expect(prep.route.path.length).toBeGreaterThan(2);
    expect(prep.route.path).not.toEqual(["A", "B", "C", "E", "F"]);
  });

  it("stops with convergence only when pathway delta is below epsilon", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ id: "A-B", source: "A", target: "B", initialWeight: 1 }],
    });
    const step = adaptationStep(graph, "A", "B", 0.1, 0, 1);
    expect(step.saturated).toBe(true);
    expect(plasticityStopReason(step, 1, 20).reason).toBe(PLASTICITY_STOP_REASON.saturated);
  });

  it("flags iteration limit separately from convergence", () => {
    const step = {
      reachable: true,
      converged: false,
      saturated: false,
    };
    const stop = plasticityStopReason(step, 20, 20);
    expect(stop.reason).toBe(PLASTICITY_STOP_REASON.iterationLimit);
    expect(stop.message).toMatch(/not equivalent to convergence/i);
  });

  it("skips non-traversable edges during updates", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    const before = graph.getEdge("B-C").weight;
    adaptationStep(graph, "A", "F", 0.1, 0, 1);
    expect(graph.getEdge("B-C").weight).toBe(before);
    expect(graph.getEdge("A-D").weight).toBeGreaterThan(0.3);
  });
});