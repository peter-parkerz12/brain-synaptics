import { describe, expect, it } from "vitest";
import { WeightedGraph, applyEdgeDamage, applyNodeDamage, restoreNode } from "./graph.js";
import {
  WORKFLOW,
  canAdapt,
  canAnalyse,
  hasValidAlternativePath,
  resolveWorkflowAfterRestore,
  runDisruptionAnalysis,
} from "./simulation-workflow.js";

describe("simulation workflow", () => {
  it("requires analysis before adaptation is permitted", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    expect(canAdapt(WORKFLOW.damaged, graph, reference, "A", "F", 0, 20)).toBe(false);
    expect(canAdapt(WORKFLOW.analysed, graph, reference, "A", "F", 0, 20)).toBe(true);
  });

  it("blocks adaptation when the target is unreachable", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "F", 100);
    const analysis = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(analysis.disconnected).toBe(true);
    expect(canAdapt(WORKFLOW.analysed, graph, reference, "A", "F", 0, 20)).toBe(false);
  });

  it("detects a valid alternative after baseline edge disruption", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyEdgeDamage(graph, "B-C", 100);
    expect(hasValidAlternativePath(reference, graph, "A", "F")).toBe(true);
    const analysis = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(analysis.alternativeOk).toBe(true);
    expect(analysis.currentPath.length).toBeGreaterThan(0);
    expect(analysis.preview?.path?.length).toBeGreaterThan(0);
  });

  it("reports disconnection without fabricating alternate routes", () => {
    const reference = WeightedGraph.baseline();
    const graph = reference.clone();
    applyNodeDamage(graph, "D", 100);
    applyNodeDamage(graph, "E", 100);
    const analysis = runDisruptionAnalysis(graph, reference, "A", "F");
    expect(analysis.disconnected).toBe(true);
    expect(analysis.currentPath).toEqual([]);
    expect(analysis.preview).toBeNull();
  });

  it("returns to damaged workflow after partial restoration", () => {
    const graph = WeightedGraph.baseline();
    applyNodeDamage(graph, "C", 50);
    expect(resolveWorkflowAfterRestore(graph, 0)).toBe(WORKFLOW.damaged);
    restoreNode(graph, "C");
    expect(resolveWorkflowAfterRestore(graph, 0)).toBe(WORKFLOW.baseline);
  });

  it("only allows analysis immediately after damage", () => {
    const graph = WeightedGraph.baseline();
    expect(canAnalyse(WORKFLOW.baseline, graph, false)).toBe(false);
    applyEdgeDamage(graph, "B-C", 40);
    expect(canAnalyse(WORKFLOW.damaged, graph, false)).toBe(true);
    expect(canAnalyse(WORKFLOW.analysed, graph, false)).toBe(false);
  });
});
