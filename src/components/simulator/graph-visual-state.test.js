import { describe, expect, it } from "vitest";
import { WeightedGraph, applyEdgeDamage } from "@/simulation/graph.js";
import { WORKFLOW } from "@/simulation/simulation-workflow.js";
import {
  adaptationGreenTier,
  buildGraphVisualContext,
  edgeStrengthProgress,
  resolveExperienceStage,
  EXPERIENCE_STAGE,
} from "./graph-visual-state.js";

describe("graph visual state", () => {
  it("maps workflow to four experience stages", () => {
    expect(
      resolveExperienceStage({
        workflowStep: WORKFLOW.baseline,
        damaged: false,
        isRunning: false,
        isPaused: false,
        iteration: 0,
      }),
    ).toBe(EXPERIENCE_STAGE.baseline);
    expect(
      resolveExperienceStage({
        workflowStep: WORKFLOW.damaged,
        damaged: true,
        isRunning: false,
        isPaused: false,
        iteration: 0,
      }),
    ).toBe(EXPERIENCE_STAGE.selectDamage);
    expect(
      resolveExperienceStage({
        workflowStep: WORKFLOW.adapting,
        damaged: true,
        isRunning: true,
        isPaused: false,
        iteration: 2,
      }),
    ).toBe(EXPERIENCE_STAGE.simulate);
    expect(
      resolveExperienceStage({
        workflowStep: WORKFLOW.evaluated,
        damaged: true,
        isRunning: false,
        isPaused: false,
        iteration: 5,
      }),
    ).toBe(EXPERIENCE_STAGE.result);
  });

  it("keeps damaged edges red and does not green unrelated edges", () => {
    const graph = WeightedGraph.baseline();
    applyEdgeDamage(graph, "B-C", 100);
    const ctx = buildGraphVisualContext({
      graph,
      activeRouteEdgeIds: ["A-D", "D-E", "E-F"],
      workflowStep: WORKFLOW.adapting,
      iteration: 3,
      maxIterations: 20,
      isRunning: true,
      animationEnabled: true,
    });
    expect(ctx.edges["B-C"].role).toBe("damaged");
    expect(ctx.edges["A-B"].role).toBe("neutral");
    expect(ctx.edges["A-D"].role).toBe("recruited");
    expect(ctx.edges["A-D"].recruitTier).toBeGreaterThanOrEqual(0);
  });

  it("progresses green tiers with iteration on active route", () => {
    expect(adaptationGreenTier(0, 20, { onRoute: true })).toBe(0);
    expect(adaptationGreenTier(8, 20, { onRoute: true })).toBeGreaterThanOrEqual(1);
    expect(adaptationGreenTier(20, 20, { complete: true, onRoute: true })).toBe(4);
    expect(adaptationGreenTier(5, 20, { onRoute: false })).toBe(-1);
  });

  it("derives strength progress from weights only", () => {
    expect(edgeStrengthProgress({ initialWeight: 0.3, weight: 0.3 })).toBe(0);
    expect(edgeStrengthProgress({ initialWeight: 0.3, weight: 0.65 })).toBeCloseTo(0.5, 5);
  });
});