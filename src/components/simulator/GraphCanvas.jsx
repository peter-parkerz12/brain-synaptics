import { useEffect, useRef } from "react";

const positions = {
  A: { x: 70, y: 188 }, B: { x: 225, y: 92 }, C: { x: 390, y: 92 },
  D: { x: 225, y: 292 }, E: { x: 455, y: 246 }, F: { x: 625, y: 188 },
};

export function GraphCanvas({ graph, source, target, path = [], selected, onSelect }) {
  const hostRef = useRef(null);
  const pathKey = path.join("|");

  useEffect(() => {
    let cy;
    let disposed = false;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !hostRef.current) return;
      const colors = getComputedStyle(document.documentElement);
      const token = (name) => resolveCssColor(colors.getPropertyValue(name).trim());
      const pathEdges = pathToEdges(graph, path);
      const elements = [
        ...[...graph.nodes.values()].map((node) => ({
          data: { id: node.id, label: node.id, name: node.name },
          position: positions[node.id] ?? { x: 100, y: 100 },
          classes: [
            node.id === source ? "source" : "",
            node.id === target ? "target" : "",
            node.capacity < 1 ? "damaged" : "",
            selected?.type === "node" && selected.id === node.id ? "selected" : "",
          ].filter(Boolean).join(" "),
        })),
        ...[...graph.edges.values()].map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, label: edge.active && edge.weight > 0 ? edge.weight.toFixed(2) : "×" },
          classes: [
            !edge.active || edge.weight <= 0 ? "disrupted" : "",
            edge.weight < 0.4 && edge.active ? "weak" : "",
            edge.weight > edge.initialWeight + 1e-9 ? "strengthened" : "",
            pathEdges.includes(edge.id) ? "route" : "",
            selected?.type === "edge" && selected.id === edge.id ? "selected" : "",
          ].filter(Boolean).join(" "),
        })),
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
          { selector: "node", style: { "background-color": token("--panel-raised"), "border-color": token("--muted"), "border-width": 2, label: "data(label)", color: token("--foreground"), "font-family": "system-ui, sans-serif", "font-size": 15, "font-weight": 700, width: 48, height: 48, "text-valign": "center", "text-halign": "center", "overlay-opacity": 0 } },
          { selector: "node.source", style: { "border-color": token("--primary"), "border-width": 3 } },
          { selector: "node.target", style: { "border-color": token("--primary"), "border-width": 3, "background-color": token("--primary-dim") } },
          { selector: "node.damaged", style: { "border-color": token("--damage"), "border-width": 3, "background-color": token("--damage-dim") } },
          { selector: "node.selected", style: { "border-color": token("--warning"), "border-width": 4 } },
          { selector: "edge", style: { width: 2, "line-color": token("--muted-line"), "curve-style": "straight", label: "data(label)", color: token("--muted-foreground"), "font-family": "system-ui, sans-serif", "font-size": 10, "text-background-color": token("--background"), "text-background-opacity": 1, "text-background-padding": 2, "overlay-opacity": 0 } },
          { selector: "edge.weak", style: { width: 1 } },
          { selector: "edge.strengthened", style: { width: 3, "line-color": token("--secondary-green"), color: token("--secondary-green") } },
          { selector: "edge.route", style: { width: 4, "line-color": token("--primary"), color: token("--primary") } },
          { selector: "edge.disrupted", style: { width: 2, "line-color": token("--damage"), "line-style": "dashed", color: token("--damage") } },
          { selector: "edge.selected", style: { width: 5, "line-color": token("--warning"), color: token("--warning") } },
        ],
      });
      cy.on("tap", "node", (event) => onSelect({ type: "node", id: event.target.id() }));
      cy.on("tap", "edge", (event) => onSelect({ type: "edge", id: event.target.id() }));
    });
    return () => { disposed = true; cy?.destroy(); };
  }, [graph, source, target, pathKey, selected, onSelect]);

  return <div className="graph-scroll"><div className="graph-canvas" ref={hostRef} role="img" aria-label="Interactive weighted network graph with six nodes and seven connections" /></div>;
}

function resolveCssColor(value) {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;

  const oklch = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)/i);
  if (!oklch) return value;

  const lightness = Number.parseFloat(oklch[1]) / (oklch[1].endsWith("%") ? 100 : 1);
  const chroma = Number.parseFloat(oklch[2]) * (oklch[2].endsWith("%") ? 0.004 : 1);
  const hue = Number(oklch[3]) * Math.PI / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const srgb = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
  });
  return `rgb(${channels.join(", ")})`;
}

function pathToEdges(graph, path) {
  const ids = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const edgeId = [...(graph.adjacency.get(path[index]) ?? [])].find((id) => {
      const edge = graph.getEdge(id);
      return edge?.active && edge.weight > 0 && (edge.source === path[index + 1] || edge.target === path[index + 1]);
    });
    if (edgeId) ids.push(edgeId);
  }
  return ids;
}