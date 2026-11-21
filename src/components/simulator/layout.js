export function computeLayoutPositions(graph, source, target) {
  const ids = [...graph.nodes.keys()].sort();
  const count = ids.length;
  const columns = Math.max(3, Math.ceil(Math.sqrt(count * 1.45)));
  const rows = Math.ceil(count / columns);
  const width = 620;
  const height = 380;
  const positions = {};

  ids.forEach((id, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 50 + (columns <= 1 ? 0 : (column / (columns - 1)) * width);
    const y = 45 + (rows <= 1 ? 0 : (row / (rows - 1)) * height);
    positions[id] = { x, y };
  });

  if (source && positions[source]) positions[source] = { ...positions[source], x: 70 };
  if (target && positions[target]) positions[target] = { ...positions[target], x: 670 };

  return positions;
}