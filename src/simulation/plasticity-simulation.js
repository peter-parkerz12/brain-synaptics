import { dijkstra } from "./graph.js";
import { hasValidAlternativePath, runDisruptionAnalysis } from "./simulation-workflow.js";

export const NO_ALTERNATIVE_PLASTICITY_MESSAGE =
  "No qualifying alternative minimum-cost pathway for plasticity.";

export const NO_DAMAGE_FREE_ROUTE_MESSAGE =
  "No damage-free route connects the selected source and target; plasticity cannot run.";

export const PLASTICITY_STOP_REASON = {
  unreachable: "unreachable",
  noAlternative: "no_alternative",
  noDamageFreeRoute: "no_damage_free_route",
  converged: "converged",
  saturated: "saturated",
  iterationLimit: "iteration_limit",
};

const STOP_LABELS = {
  [PLASTICITY_STOP_REASON.unreachable]: "Target became unreachable; simulation halted.",
  [PLASTICITY_STOP_REASON.noAlternative]:
    "No qualifying alternative pathway; plasticity did not start.",
  [PLASTICITY_STOP_REASON.noDamageFreeRoute]:
    "No damage-free route; plasticity did not start.",
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

export function preparePlasticityRun(graph, referenceGraph, source, target, options = {}) {
  const forceMinimumCostPath = Boolean(options.forceMinimumCostPath);
  const analysis = runDisruptionAnalysis(graph, referenceGraph, source, target);
  if (forceMinimumCostPath) {
    const route = dijkstra(graph, source, target, { damageFreeOnly: true });
    if (!route.reachable) {
      return {
        ready: false,
        analysis,
        reason: PLASTICITY_STOP_REASON.noDamageFreeRoute,
        message: NO_DAMAGE_FREE_ROUTE_MESSAGE,
      };
    }
    return {
      ready: true,
      analysis,
      route,
      forced: true,
      damageFreeRouting: true,
      message: `Minimum-cost pathway (damage-free): ${route.path.join(" → ")} · cost ${route.cost.toFixed(4)}`,
    };
  }
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
      message: NO_ALTERNATIVE_PLASTICITY_MESSAGE,
    };
  }
  const route = dijkstra(graph, source, target);
  if (!route.reachable) {
    return {
      ready: false,
      analysis,
      reason: PLASTICITY_STOP_REASON.unreachable,
      message: route.error ?? analysis.headline,
    };
  }
  return {
    ready: true,
    analysis,
    route,
    forced: false,
    damageFreeRouting: false,
    message: `Minimum-cost pathway: ${route.path.join(" → ")} · cost ${route.cost.toFixed(4)}`,
  };
}

export function formatPathwaySwitch(previousEdgeIds, nextEdgeIds, nextPath) {
  return `Pathway policy: Dijkstra reselected route · ${previousEdgeIds?.join(", ") ?? "—"} → ${nextEdgeIds.join(", ")} · ${nextPath.join(" → ")}`;
}

export function stopReasonLabel(reason) {
  return STOP_LABELS[reason] ?? reason;
}
