import { dijkstra } from "./graph.js";
import { hasValidAlternativePath, runDisruptionAnalysis } from "./simulation-workflow.js";

export const PLASTICITY_STOP_REASON = {
  unreachable: "unreachable",
  noAlternative: "no_alternative",
  converged: "converged",
  saturated: "saturated",
  iterationLimit: "iteration_limit",
};

const STOP_LABELS = {
  [PLASTICITY_STOP_REASON.unreachable]: "Target became unreachable; simulation halted.",
  [PLASTICITY_STOP_REASON.noAlternative]:
    "No qualifying alternative pathway; plasticity did not start.",
  [PLASTICITY_STOP_REASON.converged]:
    "Pathway weight updates fell below the convergence threshold (Δw < ε).",
  [PLASTICITY_STOP_REASON.saturated]: "All eligible pathway weights reached the upper bound.",
  [PLASTICITY_STOP_REASON.iterationLimit]:
    "Configured iteration limit reached (not equivalent to convergence).",
};

export function plasticityStopReason(step, iteration, maxIterations) {
  if (!step.reachable) {
    return {
      stopped: true,
      reason: PLASTICITY_STOP_REASON.unreachable,
      message: step.error ?? STOP_LABELS[PLASTICITY_STOP_REASON.unreachable],
    };
  }
  if (step.converged) {
    return {
      stopped: true,
      reason: PLASTICITY_STOP_REASON.converged,
      message: STOP_LABELS[PLASTICITY_STOP_REASON.converged],
    };
  }
  if (step.saturated) {
    return {
      stopped: true,
      reason: PLASTICITY_STOP_REASON.saturated,
      message: STOP_LABELS[PLASTICITY_STOP_REASON.saturated],
    };
  }
  if (iteration >= maxIterations) {
    return {
      stopped: true,
      reason: PLASTICITY_STOP_REASON.iterationLimit,
      message: STOP_LABELS[PLASTICITY_STOP_REASON.iterationLimit],
    };
  }
  return { stopped: false, reason: null, message: "" };
}

export function preparePlasticityRun(graph, referenceGraph, source, target) {
  const analysis = runDisruptionAnalysis(graph, referenceGraph, source, target);
  if (analysis.disconnected) {
    return {
      ready: false,
      analysis,
      reason: PLASTICITY_STOP_REASON.unreachable,
      message: analysis.headline,
    };
  }
  if (!hasValidAlternativePath(referenceGraph, graph, source, target)) {
    return {
      ready: false,
      analysis,
      reason: PLASTICITY_STOP_REASON.noAlternative,
      message: "No qualifying alternative minimum-cost pathway for plasticity.",
    };
  }
  const route = dijkstra(graph, source, target);
  return {
    ready: true,
    analysis,
    route,
    message: `Minimum-cost pathway: ${route.path.join(" → ")} · cost ${route.cost.toFixed(4)}`,
  };
}

export function formatPathwaySwitch(previousEdgeIds, nextEdgeIds, nextPath) {
  return `Pathway policy: Dijkstra reselected route · ${previousEdgeIds?.join(", ") ?? "—"} → ${nextEdgeIds.join(", ")} · ${nextPath.join(" → ")}`;
}

export function stopReasonLabel(reason) {
  return STOP_LABELS[reason] ?? reason;
}
