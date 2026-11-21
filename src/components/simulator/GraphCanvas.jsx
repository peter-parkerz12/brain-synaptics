import { useEffect, useRef } from "react";
import { pathToEdgeIds } from "@/simulation/graph.js";
import { resolveCssColor } from "@/lib/css-color.js";

const positions = {
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

export function GraphCanvas({ graph, source, target, path = [], selected, onSelect }) {
  const hostRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const propsRef = useRef({ graph, source, target, path, selected });
  onSelectRef.current = onSelect;
  propsRef.current = { graph, source, target, path, selected };
  const pathKey = path.join("|");

  useEffect(() => {
    let disposed = false;
    let cy;
    let fitting = false;
    let observer;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !hostRef.current) return;
      const colors = getComputedStyle(document.documentElement);
      const token = (name) => resolveCssColor(colors.getPropertyValue(name).trim());
      cy = cytoscape({
        container: hostRef.current,
        elements: [],
        layout: { name: "preset" },
        minZoom: 0.45,
        maxZoom: 2.2,
        wheelSensitivity: 0.18,
        boxSelectionEnabled: false,
        style: graphStyle(token),
      });
      cy.on("tap", "node", (event) => onSelectRef.current({ type: "node", id: event.target.id() }));
      cy.on("tap", "edge", (event) => onSelectRef.current({ type: "edge", id: event.target.id() }));
      cy.on("zoom pan", () => {
        if (!fitting) cy.scratch("userAdjusted", true);
      });
      cyRef.current = cy;
      fitting = true;
      syncGraph(cy, propsRef.current);
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
      observer?.disconnect();
      cy?.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cyRef.current) return;
    syncGraph(cyRef.current, { graph, source, target, path, selected });
  }, [graph, source, target, pathKey, selected, path]);

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
        aria-label={`Weighted network with ${graph.nodes.size} nodes and ${graph.edges.size} connections.${selectionLabel} Arrow keys move the selection.`}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function syncGraph(cy, { graph, source, target, path, selected }) {
  const routeEdges = new Set(pathToEdgeIds(graph, path));
  cy.batch(() => {
    for (const node of graph.nodes.values()) {
      const classes = nodeClassNames(node, source, target, selected);
      const existing = cy.getElementById(node.id);
      if (existing.empty()) {
        cy.add({
          data: { id: node.id, label: node.id, name: node.name },
          position: positions[node.id] ?? { x: 100, y: 100 },
          classes,
        });
      } else {
        existing.classes(classes);
      }
    }
    for (const edge of graph.edges.values()) {
      const label = edge.active && edge.weight > 0 ? edge.weight.toFixed(2) : "×";
      const classes = edgeClassNames(edge, routeEdges, selected);
      const existing = cy.getElementById(edge.id);
      if (existing.empty()) {
        cy.add({ data: { id: edge.id, source: edge.source, target: edge.target, label }, classes });
      } else {
        existing.data("label", label);
        existing.classes(classes);
      }
    }
  });
}

function nodeClassNames(node, source, target, selected) {
  return [
    node.id === source ? "source" : "",
    node.id === target ? "target" : "",
    node.capacity < 1 ? "damaged" : "",
    node.activation < 0.45 && node.capacity === 1 ? "silent" : "",
    selected?.type === "node" && selected.id === node.id ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function edgeClassNames(edge, routeEdges, selected) {
  const recovery = edgeRecoveryProgress(edge);
  return [
    !edge.active || edge.weight <= 0 ? "disrupted" : "",
    edge.weight < 0.4 && edge.active ? "weak" : "",
    edge.weight > edge.initialWeight + 1e-9 ? "strengthened" : "",
    edge.damageSeverity > 0 ? "damaged" : "",
    recovery >= 0.7 ? "recovery-strong" : "",
    recovery >= 0.3 && recovery < 0.7 ? "recovery-mid" : "",
    recovery > 0 && recovery < 0.3 ? "recovery-light" : "",
    routeEdges.has(edge.id) ? "route" : "",
    selected?.type === "edge" && selected.id === edge.id ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function edgeRecoveryProgress(edge) {
  if (!edge.active || edge.damageSeverity <= 0 || edge.damageSeverity >= 100) return 0;
  const damagedWeight = edge.initialWeight * (1 - edge.damageSeverity / 100);
  const recoveryRange = edge.initialWeight - damagedWeight;
  return recoveryRange > 0
    ? Math.max(0, Math.min(1, (edge.weight - damagedWeight) / recoveryRange))
    : 0;
}

function graphStyle(token) {
  return [
    {
      selector: "node",
      style: {
        "background-color": token("--panel-raised"),
        "border-color": token("--muted"),
        "border-width": 2,
        label: "data(label)",
        color: token("--foreground"),
        "font-family": "monospace",
        "font-size": 15,
        "font-weight": 700,
        width: 48,
        height: 48,
        "text-valign": "center",
        "text-halign": "center",
        "overlay-opacity": 0,
      },
    },
    {
      selector: "node.silent",
      style: {
        "background-color": token("--silent-node"),
        "border-color": token("--muted-line"),
        color: token("--foreground"),
      },
    },
    { selector: "node.source", style: { "border-color": token("--primary"), "border-width": 3 } },
    {
      selector: "node.target",
      style: {
        "border-color": token("--primary"),
        "border-width": 3,
        "background-color": token("--primary-dim"),
      },
    },
    {
      selector: "node.damaged",
      style: {
        "border-color": token("--damage"),
        "border-width": 3,
        "background-color": token("--damage-dim"),
      },
    },
    { selector: "node.selected", style: { "border-color": token("--warning"), "border-width": 4 } },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": token("--muted-line"),
        "curve-style": "straight",
        label: "",
        color: token("--muted-foreground"),
        "font-family": "monospace",
        "font-size": 10,
        "text-background-color": token("--background"),
        "text-background-opacity": 1,
        "text-background-padding": 2,
        "overlay-opacity": 0,
      },
    },
    { selector: "edge.weak", style: { width: 1 } },
    {
      selector: "edge.strengthened",
      style: {
        width: 3,
        "line-color": token("--secondary-green"),
        color: token("--secondary-green"),
      },
    },
    {
      selector: "edge.route",
      style: {
        width: 4,
        "line-color": token("--primary"),
        color: token("--primary"),
        label: "data(label)",
      },
    },
    {
      selector: "edge.damaged",
      style: { "line-color": token("--damage"), color: token("--damage"), label: "data(label)" },
    },
    {
      selector: "edge.recovery-light",
      style: {
        width: 3,
        "line-color": token("--recovery-light"),
        color: token("--recovery-light"),
      },
    },
    {
      selector: "edge.recovery-mid",
      style: { width: 4, "line-color": token("--recovery-mid"), color: token("--recovery-mid") },
    },
    {
      selector: "edge.recovery-strong",
      style: {
        width: 5,
        "line-color": token("--recovery-strong"),
        color: token("--recovery-strong"),
      },
    },
    {
      selector: "edge.disrupted",
      style: {
        width: 2,
        "line-color": token("--damage"),
        "line-style": "dashed",
        color: token("--damage"),
      },
    },
    { selector: "edge.selected", style: { width: 6, label: "data(label)" } },
  ];
}
