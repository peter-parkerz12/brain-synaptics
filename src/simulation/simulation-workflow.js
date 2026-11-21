import {
  SIMPLE_PATH_LIMIT,
  breadthFirstSearch,
  depthFirstPaths,
  dijkstra,
  isEdgeTraversable,
  networkHasDamage,
  pathToEdgeIds,
} from "./graph.js";
import { buildSimulationView } from "./simulation-state.js";

export const WORKFLOW = {
  baseline: "baseline",
  damaged: "damaged",
  analysed: "analysed",
  adapting: "adapting",
  evaluated: "evaluated",
};

export const WORKFLOW_LABEL = {
  [WORKFLOW.baseline]: "S0 · BASELINE",
  [WORKFLOW.damaged]: "S1 · DAMAGED",
  [WORKFLOW.analysed]: "S2 · ANALYSED",
  [WORKFLOW.adapting]: "S3 · ADAPTING",
  [WORKFLOW.evaluated]: "S4 · EVALUATED",
};

export function isBaselineRouteIntact(graph, referenceGraph, baselinePath) {
  if (!baselinePath?.length) return false;
  for (const nodeId of baselinePath) {
    const node = graph.getNode(nodeId);
    if (!node || node.capacity <= 0 || node.status !== "active") return false;
  }
  const edgeIds = pathToEdgeIds(referenceGraph, baselinePath);
  if (edgeIds.length !== baselinePath.length - 1) return false;
  for (const id of edgeIds) {
    const edge = graph.getEdge(id);
    if (!edge || !isEdgeTraversable(graph, edge, edge.source)) return false;
  }
  return true;
}

export function hasValidAlternativePath(referenceGraph, graph, source, target) {
  const baseline = dijkstra(referenceGraph, source, target);
  if (!baseline.reachable) return false;
  const current = dijkstra(graph, source, target);
  if (!current.reachable) return false;
  if (!networkHasDamage(graph)) return false;
  const pathsDiffer = JSON.stringify(baseline.path) !== JSON.stringify(current.path);
  const baselineBroken = !isBaselineRouteIntact(graph, referenceGraph, baseline.path);
  const baselineEdgeIds = pathToEdgeIds(referenceGraph, baseline.path);
  const currentEdgeIds = current.edgeIds ?? [];
  const edgesDiffer = JSON.stringify(baselineEdgeIds) !== JSON.stringify(currentEdgeIds);
  return pathsDiffer || baselineBroken || edgesDiffer;
}

function pickPreviewAlternative(graph, referenceGraph, source, target) {
  const baselinePath = dijkstra(referenceGraph, source, target).path ?? [];
  const dfsPaths = depthFirstPaths(graph, source, target, 12);
  const altPath = dfsPaths.find((path) => JSON.stringify(path) !== JSON.stringify(baselinePath));
  if (altPath) {
    return { path: altPath, edgeIds: pathToEdgeIds(graph, altPath), kind: "ALT" };
  }
  const bfs = breadthFirstSearch(graph, source, target);
  if (bfs.reachable && JSON.stringify(bfs.path) !== JSON.stringify(baselinePath)) {
    return { path: bfs.path, edgeIds: bfs.edgeIds, kind: "BFS" };
  }
  return null;
}

export function runDisruptionAnalysis(graph, referenceGraph, source, target) {
  const view = buildSimulationView(graph, referenceGraph, source, target);
  const bfs = breadthFirstSearch(graph, source, target);
  const dfsPaths = depthFirstPaths(graph, source, target, SIMPLE_PATH_LIMIT);
  const alternativeOk = hasValidAlternativePath(referenceGraph, graph, source, target);
  const preview = pickPreviewAlternative(graph, referenceGraph, source, target);
  const baselinePath = view.paths.baseline.path;
  const currentPath = view.paths.current.path;
  const disconnected = !view.metrics.reachable;

  let headline;
  if (disconnected) {
    headline = "Network disconnected: target is not reachable under current damage.";
  } else if (!networkHasDamage(graph)) {
    headline = "No damage recorded on the active graph.";
  } else if (alternativeOk) {
    headline = `Alternative routing available · ${view.metrics.alternativePathCount} simple path${
      view.metrics.simplePathsLimited ? "+" : ""
    } surveyed (limit ${SIMPLE_PATH_LIMIT})`;
  } else {
    headline =
      "Target remains reachable, but no distinct alternative minimum-cost pathway qualifies for plasticity under this model.";
  }

  const detail = disconnected
    ? (view.metrics.current.error ?? "Restore capacity or reset the baseline network.")
    : currentPath.length
      ? `Minimum-cost route: ${currentPath.join(" → ")} · cost ${view.metrics.current.cost.toFixed(4)}`
      : "No traversable route computed.";

  return {
    view,
    bfs,
    dfsPaths,
    alternativeOk,
    preview,
    disconnected,
    headline,
    detail,
    baselinePath,
    currentPath,
    cost: view.metrics.current.cost,
  };
}

export function canConfigureNetwork(workflowStep, busy) {
  return !busy && workflowStep === WORKFLOW.baseline;
}

export function canApplyDamage(_workflowStep, busy) {
  return !busy;
}

export function canRestore(workflowStep, busy) {
  return canApplyDamage(workflowStep, busy) && workflowStep !== WORKFLOW.baseline;
}

export function canAnalyse(workflowStep, graph, busy) {
  if (busy) return false;
  return workflowStep === WORKFLOW.damaged && networkHasDamage(graph);
}

export function canAdapt(
  workflowStep,
  graph,
  referenceGraph,
  source,
  target,
  iteration,
  maxIterations,
) {
  if (iteration >= maxIterations) return false;
  if (workflowStep !== WORKFLOW.analysed && workflowStep !== WORKFLOW.adapting) return false;
  return hasValidAlternativePath(referenceGraph, graph, source, target);
}

export function canEvaluate(workflowStep, busy) {
  if (busy) return false;
  return (
    workflowStep === WORKFLOW.analysed ||
    workflowStep === WORKFLOW.adapting ||
    workflowStep === WORKFLOW.evaluated
  );
}

export function resolveWorkflowAfterRestore(graph, iteration) {
  if (!networkHasDamage(graph)) {
    return iteration > 0 ? WORKFLOW.evaluated : WORKFLOW.baseline;
  }
  return WORKFLOW.damaged;
}

export function getWorkflowGuidance(
  workflowStep,
  { reachable, alternativeOk, damaged, iteration, maxIterations },
) {
  switch (workflowStep) {
    case WORKFLOW.baseline:
      return {
        step: 1,
        title: "Baseline network ready",
        detail: damaged
          ? "Reset or load a clean baseline before changing network size."
          : "Select a node or connection, set severity, and apply damage.",
        next: "Apply damage",
      };
    case WORKFLOW.damaged:
      return {
        step: 2,
        title: "Damage introduced",
        detail: "Connectivity and paths are provisional until you run formal analysis.",
        next: "Analyse network",
      };
    case WORKFLOW.analysed:
      if (!reachable) {
        return {
          step: 3,
          title: "Disruption analysis · disconnected",
          detail: "The target is unreachable. Adaptation is not valid. Restore elements or reset.",
          next: "Restore or reset",
        };
      }
      if (!alternativeOk) {
        return {
          step: 3,
          title: "Disruption analysis complete",
          detail:
            "No qualifying alternative pathway for plasticity. Compare results or adjust damage.",
          next: "Compare results",
        };
      }
      return {
        step: 4,
        title: "Alternative pathway identified",
        detail: "Run controlled adaptation iterations on the active minimum-cost route.",
        next: "Run adaptation",
      };
    case WORKFLOW.adapting:
      return {
        step: 4,
        title: "Neuroplasticity simulation",
        detail:
          iteration >= maxIterations
            ? "Iteration limit reached. Evaluate outcomes against baseline."
            : "Weights update on the current minimum-cost path each iteration.",
        next: iteration >= maxIterations ? "Compare results" : "Continue or evaluate",
      };
    case WORKFLOW.evaluated:
      return {
        step: 5,
        title: "Evaluation",
        detail:
          "Review path costs, edge weights, and adaptation history against the saved baseline.",
        next: "Reset for a new run",
      };
    default:
      return { step: 0, title: "Simulator", detail: "", next: "" };
  }
}
