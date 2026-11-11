import { useEffect, useRef } from "react";

const positions = {
  A: { x: 70, y: 188 }, B: { x: 225, y: 92 }, C: { x: 390, y: 92 },
  D: { x: 225, y: 292 }, E: { x: 455, y: 246 }, F: { x: 625, y: 188 },
};

export function GraphCanvas({ graph, source, target, path = [], onSelect }) {
  const hostRef = useRef(null);
  const cyRef = useRef(null);
  const pathKey = path.join("-");

  useEffect(() => {
    let cy;
    let disposed = false;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !hostRef.current) return;
      const colors = getComputedStyle(document.documentElement);
      const token = (name) => colors.getPropertyValue(name).trim();
      const elements = [
        ...[...graph.nodes.values()].map((node) => ({ data: { id: node.id, label: node.id, name: node.name }, position: positions[node.id] ?? { x: 100, y: 100 }, classes: [node.id === source ? "source" : "", node.id === target ? "target" : "", node.capacity < 1 ? "damaged" : ""].filter(Boolean).join(" ") })),
        ...[...graph.edges.values()].map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, label: edge.active && edge.weight > 0 ? edge.weight.toFixed(2) : "×" }, classes: [!edge.active || edge.weight <= 0 ? "disrupted" : "", pathToEdges(graph, pathKey).includes(edge.id) ? "route" : ""].filter(Boolean).join(" ") })),
      ];
      cy = cytoscape({
        container: hostRef.current,
        elements,
        layout: { name: "preset", fit: true, padding: 24 },
        minZoom: 0.55,
        maxZoom: 1.8,
        wheelSensitivity: 0.18,
        boxSelectionEnabled: false,
        style: [
          { selector: "node", style: { "background-color": token("--panel"), "border-color": token("--muted"), "border-width": 2, label: "data(label)", color: token("--foreground"), "font-family": "JetBrains Mono, monospace", "font-size": 15, "font-weight": 700, width: 48, height: 48, "text-valign": "center", "text-halign": "center", "overlay-opacity": 0 } },
          { selector: "node.source", style: { "border-color": token("--primary"), "border-width": 3, "background-color": token("--panel-raised") } },
          { selector: "node.target", style: { "border-color": token("--primary"), "border-width": 3, "background-color": token("--primary-dim") } },
          { selector: "node.damaged", style: { "border-color": token("--damage"), "border-width": 3, "background-color": token("--damage-dim"), color: token("--foreground") } },
          { selector: "node:selected", style: { "border-color": token("--warning"), "border-width": 4 } },
          { selector: "edge", style: { width: 2, "line-color": token("--muted-line"), "curve-style": "straight", label: "data(label)", color: token("--muted-foreground"), "font-family": "JetBrains Mono, monospace", "font-size": 10, "text-background-color": token("--background"), "text-background-opacity": 1, "text-background-padding": 2, "overlay-opacity": 0 } },
          { selector: "edge.route", style: { width: 4, "line-color": token("--primary"), color: token("--primary") } },
          { selector: "edge.disrupted", style: { width: 2, "line-color": token("--damage"), "line-style": "dashed", color: token("--damage") } },
          { selector: "edge:selected", style: { width: 5, "line-color": token("--warning"), color: token("--warning") } },
        ],
      });
      cy.on("tap", "node", (event) => onSelect({ type: "node", id: event.target.id() }));
      cy.on("tap", "edge", (event) => onSelect({ type: "edge", id: event.target.id() }));
      cyRef.current = cy;
    });
    return () => { disposed = true; cy?.destroy(); cyRef.current = null; };
  }, [graph, source, target, pathKey, onSelect]);

  return <div className="graph-scroll"><div className="graph-canvas" ref={hostRef} role="img" aria-label="Interactive weighted network graph with six nodes and seven connections" /></div>;
}

function pathToEdges(graph, pathKey) {
  const path = pathKey ? pathKey.split("-") : [];
  const ids = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const edge = [...(graph.adjacency.get(path[i]) ?? [])].map((id) => graph.getEdge(id)).find((item) => item && ((item.source === path[i] && item.target === path[i + 1]) || (item.target === path[i] && item.source === path[i + 1])) && item.active && item.weight > 0);
    if (edge) ids.push(edge.id);
  }
  return ids;
}