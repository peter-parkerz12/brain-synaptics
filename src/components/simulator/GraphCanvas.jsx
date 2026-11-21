import { useEffect, useMemo, useRef } from "react";
import { isEdgeVisuallyTraversable } from "@/simulation/graph.js";
import { computeLayoutPositions } from "@/components/simulator/layout.js";
import { buildGraphVisualContext, recruitTierColor } from "@/components/simulator/graph-visual-state.js";

const BASELINE_POSITIONS = {
  A: { x: 70, y: 215 },
  B: { x: 250, y: 115 },
  C: { x: 450, y: 115 },
  D: { x: 250, y: 320 },
  E: { x: 450, y: 320 },
  F: { x: 650, y: 215 },
  G: { x: 180, y: 42 },
  H: { x: 330, y: 42 },
  I: { x: 165, y: 393 },
  J: { x: 330, y: 393 },
  K: { x: 535, y: 48 },
  L: { x: 665, y: 100 },
  M: { x: 65, y: 95 },
  N: { x: 145, y: 165 },
  O: { x: 535, y: 390 },
  P: { x: 665, y: 340 },
  Q: { x: 360, y: 178 },
  R: { x: 360, y: 260 },
};

const ANIM_MS = 420;

function weightToWidth(weight) {
  return 1.5 + Math.max(0, Math.min(1, weight)) * 5;
}

export function GraphCanvas({
  graph,
  source,
  target,
  selected,
  onSelect,
  layoutKey,
  currentEdgeIds = [],
  visualOptions = {},
}) {
  const hostRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const prevWeightsRef = useRef(new Map());
  const animatingRef = useRef(false);
  onSelectRef.current = onSelect;

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const visualContext = useMemo(
    () =>
      buildGraphVisualContext({
        graph,
        activeRouteEdgeIds: currentEdgeIds,
        workflowStep: visualOptions.workflowStep,
        iteration: visualOptions.iteration ?? 0,
        maxIterations: visualOptions.maxIterations ?? 20,
        isRunning: Boolean(visualOptions.isRunning),
        animationEnabled: !reducedMotion && Boolean(visualOptions.isRunning),
      }),
    [graph, currentEdgeIds, visualOptions, reducedMotion],
  );

  const autoLayout = useMemo(
    () => computeLayoutPositions(graph, source, target),
    [graph, source, target, layoutKey],
  );

  const syncKey = [
    graph,
    source,
    target,
    layoutKey,
    currentEdgeIds.join("|"),
    selected?.type,
    selected?.id,
    visualOptions.iteration,
    visualOptions.workflowStep,
    visualOptions.isRunning,
  ].join(";");

  useEffect(() => {
    let disposed = false;
    let cy;
    let fitting = false;
    let observer;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !hostRef.current) return;
      cy = cytoscape({
        container: hostRef.current,
        elements: [],
        layout: { name: "preset" },
        minZoom: 0.45,
        maxZoom: 2.2,
        wheelSensitivity: reducedMotion ? 0.2 : 0.18,
        boxSelectionEnabled: false,
        style: graphStyle(),
      });
      cy.on("tap", "node", (event) => onSelectRef.current({ type: "node", id: event.target.id() }));
      cy.on("tap", "edge", (event) => onSelectRef.current({ type: "edge", id: event.target.id() }));
      cy.on("zoom pan", () => {
        if (!fitting) cy.scratch("userAdjusted", true);
      });
      cyRef.current = cy;
      fitting = true;
      syncGraph(cy, {
        graph,
        source,
        target,
        selected,
        autoLayout,
        visualContext,
        prevWeightsRef,
        animatingRef,
        reducedMotion,
      });
      cy.fit(undefined, 24);
      fitting = false;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          if (!cyRef.current) return;
          cyRef.current.resize();
          if (!cyRef.current.scratch("userAdjusted")) {
            fitting = true;
            cyRef.current.fit(undefined, 24);
            fitting = false;
          }
        });
        observer.observe(hostRef.current);
      }
    });
    return () => {
      disposed = true;
      animatingRef.current = false;
      observer?.disconnect();
      if (typeof cy?.elements === "function") cy.elements().stop(true, true);
      cy?.destroy?.();
      cyRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!cyRef.current) return;
    syncGraph(cyRef.current, {
      graph,
      source,
      target,
      selected,
      autoLayout,
      visualContext,
      prevWeightsRef,
      animatingRef,
      reducedMotion,
    });
  }, [syncKey, autoLayout, visualContext, graph, selected, source, target, reducedMotion]);

  const onKeyDown = (event) => {
    const items = [
      ...[...graph.nodes.keys()].map((id) => ({ type: "node", id })),
      ...[...graph.edges.keys()].map((id) => ({ type: "edge", id })),
    ];
    if (!items.length) return;
    const index = items.findIndex(
      (item) => item.type === selected?.type && item.id === selected?.id,
    );
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onSelect(items[(index + 1 + items.length) % items.length]);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onSelect(items[(index - 1 + items.length) % items.length]);
    } else if (event.key === "Home") {
      event.preventDefault();
      onSelect(items[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      onSelect(items[items.length - 1]);
    }
  };

  const selectionLabel = selected ? ` Selected ${selected.type} ${selected.id}.` : "";
  return (
    <div className="graph-scroll">
      <div
        className="graph-canvas"
        ref={hostRef}
        tabIndex={0}
        role="application"
        aria-roledescription="network graph"
        aria-label={`Weighted network with ${graph.nodes.size} nodes and ${graph.edges.size} connections.${selectionLabel} Click or use arrow keys to select.`}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function nodePosition(graph, nodeId, autoLayout) {
  if (graph.nodes.size === 18 && BASELINE_POSITIONS[nodeId]) return BASELINE_POSITIONS[nodeId];
  return autoLayout[nodeId] ?? { x: 100, y: 100 };
}

function syncGraph(
  cy,
  {
    graph,
    source,
    target,
    selected,
    autoLayout,
    visualContext,
    prevWeightsRef,
    animatingRef,
    reducedMotion,
  },
) {
  const nodeIds = new Set(graph.nodes.keys());
  const edgeIds = new Set(graph.edges.keys());
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (!nodeIds.has(node.id())) node.remove();
    });
    cy.edges().forEach((edge) => {
      if (!edgeIds.has(edge.id())) edge.remove();
    });
    for (const node of graph.nodes.values()) {
      const viz = visualContext.nodes[node.id] ?? { role: "neutral" };
      const classes = nodeClassNames(node, source, target, selected, viz);
      const position = nodePosition(graph, node.id, autoLayout);
      const existing = cy.getElementById(node.id);
      if (existing.empty()) {
        cy.add({ data: { id: node.id, label: node.id, name: node.name }, position, classes });
      } else {
        existing.position(position);
        existing.classes(classes);
      }
    }
    for (const edge of graph.edges.values()) {
      const traversable = isEdgeVisuallyTraversable(graph, edge);
      const label = traversable ? edge.weight.toFixed(2) : "×";
      const viz = visualContext.edges[edge.id] ?? { role: "neutral", recruitTier: -1 };
      const classes = edgeClassNames(selected, viz, edge);
      const width = edgeVisualWidth(edge, viz);
      const color = edgeVisualColor(viz);
      const existing = cy.getElementById(edge.id);
      if (existing.empty()) {
        cy.add({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label,
            weight: edge.weight,
            vizWidth: width,
            vizColor: color,
          },
          classes,
        });
        prevWeightsRef.current.set(edge.id, edge.weight);
      } else {
        existing.data("label", label);
        existing.data("weight", edge.weight);
        existing.classes(classes);
        const prev = prevWeightsRef.current.get(edge.id);
        const shouldAnimate =
          !reducedMotion &&
          viz.animate &&
          prev !== undefined &&
          Math.abs(prev - edge.weight) > 1e-9 &&
          !animatingRef.current;
        if (shouldAnimate && typeof existing.animation === "function") {
          animatingRef.current = true;
          if (typeof existing.stop === "function") existing.stop(true, true);
          existing
            .animation(
              {
                style: {
                  width,
                  "line-color": color,
                  color,
                },
              },
              { duration: ANIM_MS, easing: "ease-out-cubic" },
            )
            .play();
          window.setTimeout(() => {
            animatingRef.current = false;
          }, ANIM_MS + 30);
        } else {
          existing.data({ vizWidth: width, vizColor: color });
          existing.style({
            width,
            "line-color": color,
            color,
          });
        }
        prevWeightsRef.current.set(edge.id, edge.weight);
      }
    }
  });
}

function nodeClassNames(node, source, target, selected, viz) {
  return [
    viz.role === "damaged" ? "damaged" : "neutral",
    node.id === source ? "source" : "",
    node.id === target ? "target" : "",
    selected?.type === "node" && selected.id === node.id ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function edgeClassNames(selected, viz, edge) {
  const tierClass = viz.recruitTier >= 0 ? `recruit-${viz.recruitTier}` : "";
  return [
    viz.role === "damaged" ? "damaged" : "",
    viz.role === "neutral" ? "neutral" : "",
    viz.role === "recruited" ? "recruited" : "",
    tierClass,
    !edge.active || edge.weight <= 0 ? "disrupted" : "",
    selected?.type === "edge" && selected.id === edge.id ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function edgeVisualWidth(edge, viz) {
  const base = weightToWidth(edge.weight);
  if (viz.role === "recruited" && viz.recruitTier >= 0) {
    return base + 0.35 * (viz.recruitTier + 1);
  }
  return base;
}

function edgeVisualColor(viz) {
  if (viz.role === "damaged") return "#FF4545";
  if (viz.role === "recruited" && viz.recruitTier >= 0) return recruitTierColor(viz.recruitTier);
  return "#41494D";
}

function graphStyle() {
  return [
    {
      selector: "node",
      style: {
        "background-color": "#626B70",
        "border-color": "#51585C",
        "border-width": 2,
        label: "data(label)",
        color: "#8A9399",
        "font-family": "JetBrains Mono, monospace",
        "font-size": 14,
        "font-weight": 700,
        width: 46,
        height: 46,
        "text-valign": "center",
        "text-halign": "center",
        "overlay-opacity": 0,
      },
    },
    {
      selector: "node.damaged",
      style: {
        "background-color": "#5A2E2E",
        "border-color": "#FF4545",
        "border-width": 3,
        color: "#FFB4B4",
        "overlay-color": "#FF4545",
        "overlay-opacity": 0.22,
      },
    },
    {
      selector: "node.source",
      style: {
        "border-color": "#65E98A",
        "border-width": 3,
        color: "#D8FFE3",
      },
    },
    {
      selector: "node.target",
      style: {
        "border-color": "#65E98A",
        "border-width": 3,
        "background-color": "#4A565C",
        color: "#D8FFE3",
      },
    },
    {
      selector: "node.selected",
      style: {
        "border-color": "#E8F4EA",
        "border-width": 4,
        "overlay-color": "#E8F4EA",
        "overlay-opacity": 0.12,
      },
    },
    {
      selector: "edge",
      style: {
        width: "data(vizWidth)",
        "line-color": "data(vizColor)",
        "curve-style": "straight",
        label: "data(label)",
        color: "data(vizColor)",
        "font-family": "JetBrains Mono, monospace",
        "font-size": 10,
        "text-background-color": "#0B1010",
        "text-background-opacity": 0.92,
        "text-background-padding": 2,
        "overlay-opacity": 0,
      },
    },
    {
      selector: "edge.neutral",
      style: {
        label: "",
        opacity: 0.88,
      },
    },
    {
      selector: "edge.damaged",
      style: {
        "line-color": "#FF4545",
        color: "#FF4545",
        "overlay-color": "#FF4545",
        "overlay-opacity": 0.28,
      },
    },
    {
      selector: "edge.disrupted",
      style: {
        "line-style": "dashed",
        opacity: 0.75,
      },
    },
    {
      selector: "edge.recruited",
      style: {
        label: "data(label)",
        opacity: 1,
        "overlay-opacity": 0.18,
        "overlay-color": "#65E98A",
      },
    },
    {
      selector: "edge.selected",
      style: {
        width: 7,
        "overlay-opacity": 0.2,
        "overlay-color": "#E8F4EA",
      },
    },
  ];
}