import { analyzeConnectivity, dijkstra, pathToEdgeIds, validateGraphIntegrity } from "./graph.js";

export function buildSimulationView(graph, referenceGraph, source, target) {
  const integrity = validateGraphIntegrity(graph);
  const baselineRoute = dijkstra(referenceGraph, source, target);
  const metrics = analyzeConnectivity(graph, source, target, baselineRoute.cost);
  const currentPath = metrics.current.reachable ? metrics.current.path : [];
  const currentEdgeIds = metrics.current.reachable ? metrics.current.edgeIds : [];
  const baselineEdgeIds = baselineRoute.reachable
    ? pathToEdgeIds(referenceGraph, baselineRoute.path)
    : [];

  return {
    integrity,
    baselineRoute,
    metrics,
    paths: {
      baseline: {
        path: baselineRoute.reachable ? baselineRoute.path : [],
        edgeIds: baselineEdgeIds,
      },
      current: {
        path: currentPath,
        edgeIds: currentEdgeIds,
      },
    },
    highlight: {
      path: currentPath,
      edgeIds: currentEdgeIds,
    },
  };
}

export function assertHighlightConsistent(graph, path, edgeIds) {
  if (!path?.length) return edgeIds?.length === 0;
  if (path.length === 1) return edgeIds?.length === 0;
  const rebuilt = pathToEdgeIds(graph, path);
  return JSON.stringify(rebuilt) === JSON.stringify(edgeIds ?? []);
}
