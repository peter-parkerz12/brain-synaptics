import { describe, expect, it } from "vitest";
import {
  WeightedGraph,
  adaptationStep,
  applyEdgeDamage,
  applyNodeDamage,
  restoreNode,
} from "./graph.js";
import { generateSyntheticNetwork } from "./network-generator.js";
import {
  WORKFLOW,
  canAdapt,
  resolveWorkflowAfterRestore,
  runDisruptionAnalysis,
} from "./simulation-workflow.js";
import { assertHighlightConsistent, buildSimulationView } from "./simulation-state.js";

function simulateWorkflow(graph, reference) {
  const source = "A";
  const target = "F";
  let step = WORKFLOW.baseline;
  applyEdgeDamage(graph, [...graph.edges.values()][2]?.id ?? "B-C", 100);
  step = WORKFLOW.damaged;
  const analysis = runDisruptionAnalysis(graph, reference, source, target);
  step = WORKFLOW.analysed;
  const view = buildSimulationView(graph, reference, source, target);
  if (analysis.alternativeOk) {
    expect(canAdapt(step, graph, reference, source, target, 0, 20)).toBe(true);
    adaptationStep(graph, source, target, 0.1, 0, 1);
    step = WORKFLOW.adapting;
  }
  expect(
    assertHighlightConsistent(graph, view.paths.current.path, view.paths.current.edgeIds),
  ).toBe(true);
  return { step, analysis, view };
}

describe("end-to-end workflow scenarios", () => {
  it.each([10, 30, 60])(
    "runs damage → analyse → adapt on %i-node networks when rerouting exists",
    (size) => {
      const reference = generateSyntheticNetwork(size);
      const graph = reference.clone();
      const edge = [...graph.edges.values()].find((item) => item.active);
      if (!edge) throw new Error("No active edge");
      applyEdgeDamage(graph, edge.id, 100);
      const analysis = runDisruptionAnalysis(graph, reference, "A", "F");
      expect(analysis.view.integrity.valid).toBe(true);
      if (analysis.alternativeOk) {
        const result = adaptationStep(graph, "A", "F", 0.08, 0, 1);
        expect(result.reachable).toBe(true);
      }
    },
  );

  it("handles complete disconnection without adaptation", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "F", 100);
    const analysis = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(analysis.disconnected).toBe(true);
    expect(canAdapt(WORKFLOW.analysed, graph, reference, "A", "F", 0, 20)).toBe(false);
  });

  it("restores reachability and returns to baseline when damage is cleared", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "E", 100);
    expect(runDisruptionAnalysis(graph, reference, "A", "F").disconnected).toBe(true);
    restoreNode(graph, "E");
    expect(resolveWorkflowAfterRestore(graph, 0)).toBe(WORKFLOW.baseline);
    const after = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(after.disconnected).toBe(false);
  });

  it("supports parallel-edge damage with correct rerouting", () => {
    const graph = new WeightedGraph({
      nodes: [{ id: "A" }, { id: "B" }, { id: "F" }],
      edges: [
        { id: "A-B", source: "A", target: "B", initialWeight: 0.2 },
        { id: "A-B#2", source: "A", target: "B", initialWeight: 0.85 },
        { id: "B-F", source: "B", target: "F", initialWeight: 0.8 },
      ],
    });
    const reference = graph.clone();
    applyEdgeDamage(graph, "A-B#2", 100);
    const rerouted = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(rerouted.disconnected).toBe(false);
    expect(rerouted.alternativeOk).toBe(true);
    applyEdgeDamage(graph, "A-B", 100);
    expect(runDisruptionAnalysis(graph, reference, "A", "F").disconnected).toBe(true);
  });

  it("reproduces baseline metrics after snapshot undo semantics", () => {
    const reference = WeightedGraph.baseline();
    const snapshot = reference.toJSON();
    const graph = new WeightedGraph(snapshot);
    applyEdgeDamage(graph, "B-C", 100);
    runDisruptionAnalysis(graph, reference, "A", "F");
    adaptationStep(graph, "A", "F", 0.1, 0, 1);
    const restored = new WeightedGraph(snapshot);
    const view = buildSimulationView(restored, reference, "A", "F");
    expect(view.paths.current.path).toEqual(
      buildSimulationView(reference, reference, "A", "F").paths.current.path,
    );
  });
});
