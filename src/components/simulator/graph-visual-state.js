import { WORKFLOW } from "@/simulation/simulation-workflow.js";
import { isEdgeVisuallyTraversable } from "@/simulation/graph.js";

export const EXPERIENCE_STAGE = {
  baseline: "baseline",
  selectDamage: "selectDamage",
  simulate: "simulate",
  result: "result",
};

export const EXPERIENCE_LABEL = {
  [EXPERIENCE_STAGE.baseline]: "1 · BASELINE",
  [EXPERIENCE_STAGE.selectDamage]: "2 · SELECT DAMAGE",
  [EXPERIENCE_STAGE.simulate]: "3 · SIMULATE",
  [EXPERIENCE_STAGE.result]: "4 · RESULT",
};

/** @param {number} tier 0–4 visual green intensity on the active recruited route */
export function adaptationGreenTier(iteration, maxIterations, { complete = false, onRoute = false } = {}) {
  if (!onRoute) return -1;
  if (complete) return 4;
  if (iteration <= 0) return 0;
  const progress = Math.min(1, iteration / Math.max(1, maxIterations));
  if (progress < 0.2) return 0;
  if (progress < 0.45) return 1;
  if (progress < 0.75) return 2;
  if (progress < 1) return 3;
  return 4;
}

export function edgeStrengthProgress(edge) {
  const room = Math.max(1e-6, 1 - edge.initialWeight);
  return Math.max(0, Math.min(1, (edge.weight - edge.initialWeight) / room));
}

export function resolveExperienceStage({
  workflowStep,
  damaged,
  isRunning,
  isPaused,
  iteration,
}) {
  if (workflowStep === WORKFLOW.evaluated) return EXPERIENCE_STAGE.result;
  if (isRunning || workflowStep === WORKFLOW.adapting) return EXPERIENCE_STAGE.simulate;
  if (damaged) return EXPERIENCE_STAGE.selectDamage;
  return EXPERIENCE_STAGE.baseline;
}

export function countDamage(graph) {
  let damagedEdges = 0;
  let damagedNodes = 0;
  for (const edge of graph.edges.values()) {
    if (edge.damageSeverity > 0 || !edge.active || edge.weight <= 0) damagedEdges += 1;
  }
  for (const node of graph.nodes.values()) {
    if (node.capacity < 1 || node.status !== "active") damagedNodes += 1;
  }
  return { damagedEdges, damagedNodes };
}

/**
 * Builds per-element visual roles consumed by GraphCanvas (engine-derived only).
 */
export function buildGraphVisualContext({
  graph,
  activeRouteEdgeIds = [],
  workflowStep,
  iteration,
  maxIterations,
  isRunning,
  animationEnabled,
}) {
  const activeSet = new Set(activeRouteEdgeIds);
  const adaptationComplete =
    workflowStep === WORKFLOW.evaluated || (!isRunning && iteration > 0);
  const adapting = isRunning || workflowStep === WORKFLOW.adapting;

  const edges = {};
  for (const edge of graph.edges.values()) {
    const onActiveRoute = activeSet.has(edge.id);
    const damaged =
      edge.damageSeverity > 0 ||
      !edge.active ||
      edge.weight <= 0 ||
      (edge.damageSeverity > 0 && edge.weight < edge.initialWeight);
    const disrupted = !isEdgeVisuallyTraversable(graph, edge);
    let role = "neutral";
    let recruitTier = -1;
    if (disrupted || (damaged && edge.damageSeverity >= 100) || edge.weight <= 0) {
      role = "damaged";
    } else if (edge.damageSeverity > 0) {
      role = "damaged";
    } else if (onActiveRoute && adapting) {
      role = "recruited";
      const strength = edgeStrengthProgress(edge);
      const iterTier = adaptationGreenTier(iteration, maxIterations, { onRoute: true });
      recruitTier = Math.min(4, Math.max(iterTier, Math.floor(strength * 4)));
    } else if (onActiveRoute && adaptationComplete) {
      role = "recruited";
      recruitTier = 4;
    }
    edges[edge.id] = {
      role,
      recruitTier,
      strength: edgeStrengthProgress(edge),
      animate: Boolean(animationEnabled && onActiveRoute && adapting),
    };
  }

  const nodes = {};
  for (const node of graph.nodes.values()) {
    const nodeDamaged = node.capacity < 1 || node.status !== "active";
    nodes[node.id] = { role: nodeDamaged ? "damaged" : "neutral" };
  }

  return { edges, nodes, activeRouteEdgeIds: [...activeSet], adaptationComplete, adapting };
}

export function recruitTierColor(tier) {
  const palette = ["#B7F7C5", "#65E98A", "#28D968", "#3AD976", "#16C75A"];
  const index = Math.max(0, Math.min(4, tier));
  return palette[index];
}