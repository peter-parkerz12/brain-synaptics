import { describe, expect, it } from "vitest";
import {
  WeightedGraph,
  adaptationStep,
  applyEdgeDamage,
  applyNodeDamage,
  dijkstra,
  edgeHasAppliedDamage,
  nodeHasAppliedDamage,
} from "./graph.js";
import { hasValidAlternativePath } from "./simulation-workflow.js";
import {
  NO_DAMAGE_FREE_ROUTE_MESSAGE,
  PLASTICITY_STOP_REASON,
  preparePlasticityRun,
} from "./plasticity-simulation.js";

function pathCrossesDamage(graph, path, edgeIds) {
  for (const nodeId of path) {
    if (nodeHasAppliedDamage(graph.getNode(nodeId))) return true;
  }
  for (const id of edgeIds) {
    if (edgeHasAppliedDamage(graph.getEdge(id))) return true;
  }
  return false;
}

describe("RUN ANYWAY damage-free routing", () => {
  it("A: partial same-path damage blocks normal plasticity", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 40);
    expect(hasValidAlternativePath(reference, graph, "A", "F")).toBe(false);
    const prep = preparePlasticityRun(graph, reference, "A", "F");
    expect(prep.ready).toBe(false);
    expect(prep.reason).toBe(PLASTICITY_STOP_REASON.noAlternative);
  });

  it("B: forced run uses lowest-cost route avoiding damaged elements", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 40);
    const prep = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(prep.ready).toBe(true);
    expect(prep.damageFreeRouting).toBe(true);
    expect(prep.route.path).not.toEqual(["A", "B", "C", "E", "F"]);
    expect(pathCrossesDamage(graph, prep.route.path, prep.route.edgeIds)).toBe(false);
    const baselineAlt = dijkstra(graph, "A", "F", { damageFreeOnly: true });
    expect(prep.route.cost).toBe(baselineAlt.cost);
  });

  it("C: fully damaged edge never appears on forced route or updates", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    const before = graph.getEdge("B-C").weight;
    const prep = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(prep.route.edgeIds).not.toContain("B-C");
    adaptationStep(graph, "A", "F", 0.1, 0, 1, { damageFreeRouting: true });
    expect(graph.getEdge("B-C").weight).toBe(before);
    expect(graph.getEdge("B-C").damageSeverity).toBe(100);
  });

  it("D: partially damaged edge excluded and never updated", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 40);
    const before = graph.getEdge("B-C").weight;
    const prep = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(prep.route.edgeIds).not.toContain("B-C");
    adaptationStep(graph, "A", "F", 0.1, 0, 1, { damageFreeRouting: true });
    expect(graph.getEdge("B-C").weight).toBe(before);
  });

  it("E: damaged node excluded from route", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "C", 50);
    const prep = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(prep.ready).toBe(true);
    expect(prep.route.path).not.toContain("C");
    expect(pathCrossesDamage(graph, prep.route.path, prep.route.edgeIds)).toBe(false);
  });

  it("F: refuses when no damage-free route exists", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "D", 100);
    applyNodeDamage(graph, "E", 100);
    const prep = preparePlasticityRun(graph, reference, "A", "F", { forceMinimumCostPath: true });
    expect(prep.ready).toBe(false);
    expect(prep.message).toBe(NO_DAMAGE_FREE_ROUTE_MESSAGE);
    expect(prep.reason).toBe(PLASTICITY_STOP_REASON.noDamageFreeRoute);
  });

  it("G: each adaptation tick reselects a damage-free route", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    let prev = null;
    for (let i = 1; i <= 3; i += 1) {
      const step = adaptationStep(graph, "A", "F", 0.15, 0, i, {
        previousEdgeIds: prev,
        damageFreeRouting: true,
      });
      expect(step.reachable).toBe(true);
      expect(pathCrossesDamage(graph, step.path, step.edgeIds)).toBe(false);
      prev = step.edgeIds;
    }
  });

  it("I: ordinary qualified plasticity unchanged", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    const prep = preparePlasticityRun(graph, reference, "A", "F");
    expect(prep.ready).toBe(true);
    expect(prep.damageFreeRouting).toBeFalsy();
    expect(prep.route.path).toEqual(["A", "D", "E", "F"]);
  });
});