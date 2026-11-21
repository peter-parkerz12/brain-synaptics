# Neuroplasticity Simulator

An interactive, deterministic model of a synthetic neural network. The network is an undirected weighted graph. Damage, search, and activity-dependent plasticity all run locally in the browser.

The original 18-node A–F route stays `A → B → C → E → F`. On an undamaged network its cost is `1/0.9 + 1/0.85 + 1/0.8 + 1/0.9`.

Use the **Network size** control (10–60 nodes) to regenerate a connected synthetic graph. Source **A** and target **F** stay fixed. The 18-node preset is the published reference topology.

## Model

- Traversal cost of an edge is `1 / (weight × source capacity × target capacity)`. Capacity `1` leaves the cost at `1 / weight`.
- A node at capacity `0` is unavailable and blocks every route through it. Partial capacity makes routes through that node more expensive.
- Breadth-first search reports the fewest hops. Dijkstra reports the minimum traversal cost. Depth-first search lists simple paths.
- Plasticity updates an active edge with `weight + learningRate × activity × (1 − weight) − decayRate × weight`, clamped to `[0, 1]`. A weight that reaches `0` becomes inactive.
- Performance is the selected pair’s baseline cost divided by its current cost. It can rise above 100% when adaptation makes the route cheaper than the original network. It is a model proxy, not a clinical measure.
- Base activation is a fixed display value used to draw low-activity nodes. The simulation does not change it.

## Development

```sh
npm i
npm run dev
npm test
npm run lint
npm run build
```

The app is a single route. Source and target can be any nodes. Reset restores the published 18-node, 25-edge baseline.
