# Neuroplasticity Simulator — User Manual

**Version basis:** Application source as of repository inspection (TanStack Start single-page app, route `/`).  
**Accuracy note:** This manual is derived from source code review, automated audit scripts, and the Vitest/audit test suite. Interactive browser verification was performed during development; re-run `npm run dev` locally to confirm labels on your build.

---

## Verification and Coverage Report

### Files and components inspected

| Area | Primary files |
|------|----------------|
| UI shell & controls | `src/components/simulator/Simulator.jsx` |
| Graph rendering | `src/components/simulator/GraphCanvas.jsx`, `graph-visual-state.js` |
| Graph engine | `src/simulation/graph.js` |
| Workflow & analysis | `src/simulation/simulation-workflow.js`, `simulation-state.js` |
| Plasticity orchestration | `src/simulation/plasticity-simulation.js` |
| Network generation | `src/simulation/network-generator.js` |
| History charts | `src/components/simulator/HistoryCharts.jsx`, `chart-scales.js` |
| Entry route | `src/routes/index.tsx` |

### Workflows tested (automated / script)

| Workflow | Evidence |
|----------|----------|
| Baseline A→F cost & path | Audit experiment 1; Vitest |
| Partial B–C damage (no plasticity) | Audit experiment 2 |
| Complete B–C reroute | Audit experiment 3; Node script below |
| Plasticity after B–C cut | Audit experiment 8 |
| Pause / reset adaptation | Playwright `e2e/reset-adaptation-paused.spec.js` |
| Full Vitest suite | **66 passed** (run at manual authoring) |
| Audit experiments | **12/12 passed** (run at manual authoring) |

### Mathematical checks

| Item | Verified in |
|------|-------------|
| Traversal cost \(1/(w \cdot cap_i \cdot cap_j)\) | `graph.js` `traversalCost`, audit #11 |
| Plasticity update | `plasticityWeightUpdate`, audit #10 |
| Dijkstra baseline path A→B→C→E→F | Audit #1, independent Node check |
| Performance ratio | `simulatedPerformance`: `baselineCost / current.cost` |

### Known UI/engine nuances (documented, not bugs)

1. **Two stage indicators:** User-facing **1·BASELINE … 4·RESULT** (experience) plus internal **S0·BASELINE … S4·EVALUATED** (workflow chip).
2. **Green pathway** appears only while **adapting, running, or after at least one adaptation iteration / evaluated** — not immediately after damage alone.
3. **ANALYSE & SIMULATE** can run analysis automatically if you have not pressed **ANALYSE NETWORK** separately.
4. **Progress bar** tracks **iteration count (0–20)**, not “percent recovered” or biological convergence.
5. **Base activation** on nodes is a **display attribute**; it does not enter the traversal cost formula.
6. **Chart.js** history charts require a real browser canvas; unit tests mock charts.

### Unverified in this authoring pass

- Live browser click-through of every control on your machine (labels match `Simulator.jsx` at inspection time).
- Production `vite preview` serve (known project limitation; use `npm run dev` for local use).

---

## 1. Introduction

### What this application is

The **Neuroplasticity Simulator** is an interactive **synthetic graph model**. You load a weighted network, introduce damage to nodes or connections, analyse how routing changes, and optionally run a **toy activity-dependent plasticity** rule that strengthens connections on the **current minimum-cost path** each iteration.

### What it demonstrates

- How **damage** changes which route is cheapest between a chosen **source** and **target**.
- When a **qualifying alternative pathway** exists under the app’s rules (required before plasticity runs).
- How **edge weights** on the active route change over discrete **iterations**.
- Comparison of **baseline vs current path cost** and a simple **performance proxy**.

### What it does **not** demonstrate

- Real brain anatomy, timing, or recovery.
- Clinical outcomes, diagnosis, or treatment planning.
- A complete biological neuron or synapse model.

All on-screen disclaimers stating “synthetic model” / “not biological recovery” match the implementation intent.

---

## 2. Getting Started

### Opening the application

1. Run `npm run dev` and open the local URL (default Vite dev server).
2. The home page (`/`) renders the **Simulator** — there is no separate multi-page tour.

### First screen layout (three columns + footer record)

| Region | Purpose |
|--------|---------|
| **Top bar** | Title, run status (IDLE / PLASTICITY RUN / PAUSED), experience stage chip, internal workflow chip, **RESET SIMULATION** |
| **Left rail** | Mission control, network settings, damage, advanced simulation |
| **Centre** | Graph workspace, legend, selection inspector, scientific note |
| **Right rail** | Network status, path analysis, performance, state comparison |
| **Bottom** | Simulation record (charts, event log, undo) |
| **Footer** | Synthetic model reminder |

Default network: **18 nodes**, **25 connections** (classic A–F reference topology when size = 18). Default **source A**, **target F**.

---

## 3. Complete Interface Reference

### 3.1 Top bar

| Element | Label / text | Behaviour |
|---------|----------------|-----------|
| Status dot | Glows when plasticity is **running and not paused** | Visual only |
| Status text | `IDLE`, `PLASTICITY RUN`, `PAUSED`, `ADAPTING` | Derived from `isRunning`, `isPaused`, `workflowStep` |
| Experience chip | `1 · BASELINE` … `4 · RESULT` | See §3.2 |
| Technical chip | `S0 · BASELINE` … `S4 · EVALUATED` | Internal workflow; used by tests and event names |
| **RESET SIMULATION** | Resets graph, history, workflow to baseline for current **NETWORK SIZE** | Available unless blocked by active unpaused run (`busy`) for some other controls |

### 3.2 Mission control (left rail, top)

Primary guided workflow. Shows:

- **Stage title & detail** from `getWorkflowGuidance`.
- **Damaged** counts: nodes/edges counted as damaged if capacity &lt; 1, inactive node, or edge with `damageSeverity > 0`, inactive, or `weight ≤ 0`.
- **Active route**: current Dijkstra minimum-cost path string (or `—` if unreachable).
- **Status** line: baseline / damage ready / adapting / complete.
- **One primary button** depending on experience stage:

| Experience stage | Primary button | Enabled when |
|------------------|----------------|--------------|
| `1 · BASELINE` | **SELECT DAMAGE** | Not `busy` |
| `2 · SELECT DAMAGE` | **ANALYSE & SIMULATE** | `damaged` and not `busy` |
| `3 · SIMULATE` | **PAUSE** or **RESUME** | `isRunning` (`aria-label`: Pause/Resume plasticity simulation) |
| `4 · RESULT` | **COMPARE RESULTS** | `canEvaluate` (not `busy`; workflow analysed, adapting, or evaluated) |

Mission copy explains green pathways as **modelled edge weights**, not biology.

### 3.3 NETWORK (section 01)

| Control | Function | When disabled |
|---------|----------|----------------|
| **SOURCE NODE** | Sets routing source ID | `busy` or not baseline (`canConfigureNetwork`) |
| **TARGET NODE** | Sets routing target ID | Same |
| **NETWORK SIZE** slider | **10–60** nodes; regenerates graph | Same; also disabled after damage until full reset |
| **LOAD / RESET BASELINE** | Same family as top reset for current size | Not disabled by `busy` alone |
| **SIMULATE TRAUMA: B-C** | Applies **100%** edge damage to **B–C** on the 18-node baseline | Disabled if B–C missing/inactive, `busy`, or damage not allowed |

Changing source/target/size clears analysis and adaptation checkpoint.

### 3.4 DAMAGE / RESTORE (section 02)

| Control | Function |
|---------|----------|
| **ELEMENT TYPE** | `CONNECTION / EDGE` or `NODE / REGION` |
| **SELECT …** dropdown | Picks node or edge by ID; syncs with graph selection |
| **SEVERITY** slider | **1–100%** (0% rejected on apply) |
| **DAMAGE SELECTED** | Applies damage; moves workflow to **S1 · DAMAGED** |
| **CANCEL** | Leaves selection mode banner; clears notice |
| **RESTORE SELECTED** | Restores selected node/edge toward baseline weights/capacity |

**Graph interaction:** Click a node or edge in the graph to select it (also sets element type). Arrow keys move selection on the graph (`role="application"`).

**While plasticity is running unpaused (`busy`):** damage, restore, undo, network config, and some other controls are disabled.

### 3.5 ADVANCED SIMULATION (collapsible section 03)

| Control | Function |
|---------|----------|
| **ANALYSE NETWORK** | Runs `runDisruptionAnalysis`; sets **S2 · ANALYSED** | Enabled only in **S1 · DAMAGED** with damage present, not `busy` |
| Analysis report block | Shows headline, current min-cost path, optional preview alt path, BFS/DFS counts |
| **LEARNING RATE** | 0–0.50, step 0.01; used in plasticity update | Enabled when adaptation allowed or run active |
| **DECAY RATE** | 0–0.20, step 0.01 | Same |
| Plasticity policy text | Explains qualifying alternative pathway rule |
| Blocker text | Shown in **S2** if unreachable or no qualifying alternative |
| **SIMULATE NEUROPLASTICITY** | Starts/advances plasticity (same core as **ANALYSE & SIMULATE** after auto-analysis) | `plasticityStartAllowed`: damaged & not baseline & not already running |
| **RESET ADAPTATION** | Restores graph to checkpoint saved at simulation start | Enabled when checkpoint exists and **(paused or not running)** |
| Progress bar | `aria-valuenow` = iteration; max **20** | **Iteration count**, not convergence % |

`MAX_ITERATIONS = 20` is fixed in code (`ADAPTATION_TICK_MS = 280` per tick while running).

### 3.6 Graph workspace (centre)

| Element | Meaning |
|---------|---------|
| Header | Node/edge counts for **visually traversable** elements |
| Cytoscape graph | Interactive layout; zoom/pan |
| Legend | Grey / red / green meanings (see §4) |
| **Notice** (`role="alert"`) | Errors and plasticity stop messages |
| **SELECTION INSPECTOR** | Live fields for selected node or edge |
| **Scientific note** | Traversal cost formula and non-biological disclaimer |

### 3.7 Right rail

**NETWORK STATUS (05):** Reachability banner; active node/edge counts; disrupted edges; damaged nodes.

**PATH ANALYSIS (06):**

| Block | Content |
|-------|---------|
| **BASELINE SHORTEST PATH** | Dijkstra on **reference** (undamaged) graph for source→target |
| **CURRENT MINIMUM-COST PATH** | Dijkstra on **current** damaged/adapted graph |
| **Network structure** (details) | Simple path count (cap 200), components, bridges, articulation points |

**SIMULATED PERFORMANCE (07):**

| Item | Meaning |
|------|---------|
| Large **%** value | `100 × (baseline path cost / current path cost)` |
| Subtext | States ratio definition |
| Caveat | Model-specific proxy; not clinical |
| Secondary metrics | Avg active weight, strengthened edge count, learning/decay sliders |

**STATE COMPARISON (08):** Opens when evaluated; **COMPARE RESULTS** button records evaluation event; baseline vs current cost; S0–S4 milestone badges.

### 3.8 Simulation record (bottom)

| Element | Function |
|---------|----------|
| **ACTIVE ROUTE CONNECTION STRENGTHS** | Chart.js line chart: weights for edge IDs that appeared on route in history |
| **PATH COST / SIMULATED PERFORMANCE** | Cost and performance vs snapshot index |
| **Chart values** (toggle) | Accessible table of chart data when enabled |
| **EVENT HISTORY** | Up to **12** recent events (title, detail, tone) |
| **Undo** | Reverts last saved undo point (**disabled when `busy`**) |
| Footnote | Current workflow label, iteration, performance snapshot |

---

## 4. Understanding the Graph

### 4.1 Nodes

- **ID** (letter) and **name** (e.g. “Sensory Input” for A).
- **Role** Source / Target / Intermediate — organisational labels.
- **Capacity** `0–1`; reduces with node damage. At **100%** severity, capacity `0`, status `unavailable`.
- **Base activation** — shown in inspector; **not used** in traversal cost (stated in scientific note).

### 4.2 Edges (connections)

- **Weight** `0–1` strength; shown on edge when label enabled.
- **Initial weight** stored at generation; damage scales current weight:  
  `weight = initialWeight × (1 − severity/100)`; **100%** sets weight 0 and inactive.
- **Parallel edges** between same pair: Dijkstra picks lowest traversal cost step via `lowestCostEdgeBetween`.

### 4.3 Colours and roles (implemented)

Colours come from `graph-visual-state.js` and `GraphCanvas.jsx`.

| Appearance | Meaning | Tied to simulation state? |
|------------|---------|---------------------------|
| **Grey** nodes (`#626B70`) | Undamaged node | Yes |
| **Grey** edges (`#41494D`) | Undamaged, not on active recruited route | Yes |
| **Red** node border/fill | Node damaged (`capacity < 1` or unavailable) | Yes |
| **Red** edge (`#FF4545`) | Damaged/disrupted edge (`damageSeverity > 0`, inactive, or weight 0) | Yes |
| **Green** edge (tiers `#B7F7C5` → `#16C75A`) | Edge on **current Dijkstra path** while/after adaptation | Yes — only edges in `currentEdgeIds` passed to canvas when adapting, running, or evaluated |
| **Thicker edge** | Maps from **weight** (`1.5–6.5` range) plus extra width on recruited route | Yes — reflects `edge.weight`, not a separate fake metric |
| **Green source/target border** | Marks default source **A** and target **F** | Endpoint markers |
| **Selection outline** | Currently selected element for damage inspector | UI selection only |

**Important:** Before you start plasticity, the graph stays largely **grey** even if analysis shows a new cheapest route. Green recruitment highlighting turns on when `isRunning`, workflow is **adapting**, or **evaluated** (or after iterations &gt; 0 when complete).

**Animation:** On recruited edges, ~**420 ms** Cytoscape transitions between ticks if `prefers-reduced-motion` is not set. Animation does **not** change weights — ticks do.

### 4.4 Legend (under graph)

Matches §4.3: grey original, red damaged, light/bold green recruited/strengthened pathway; click-to-select hint.

---

## 5. Understanding the Simulation

### 5.1 Routing (shortest / minimum cost)

Each step cost on edge from node \(i\) to \(j\):

\[
c_{ij} = \frac{1}{w_{ij} \cdot cap_i \cdot cap_j}
\]

- \(w_{ij}\): edge weight (after damage).
- \(cap_i, cap_j\): node capacities.

**Dijkstra’s algorithm** on the current graph finds the **minimum total cost** path from source to target. That path is what the UI calls **CURRENT MINIMUM-COST PATH**.

**BFS** and **DFS** (bounded) are used in **analysis reporting** (hop count, counting simple paths up to limit **200**). You do not run them with separate buttons; **ANALYSE NETWORK** includes them.

### 5.2 Baseline vs current

- **Reference graph** (`referenceGraphJson`): frozen copy from last pristine load/reset at current size — used for baseline path and plasticity qualification.
- **Current graph**: after damage and plasticity updates.

**Baseline shortest path** always computed on reference graph with your chosen source/target.

### 5.3 When plasticity is allowed

Plasticity runs only if `hasValidAlternativePath` is true:

1. Reference and current graphs both reach target from source.
2. Network has damage.
3. At least one of:
   - Current min-cost **node path** ≠ baseline min-cost path, or
   - **Baseline corridor** is broken (nodes/edges on baseline path not traversable), or
   - **Edge set** on current min-cost path ≠ edge set on baseline path.

**If damage only makes the same path more expensive** (e.g. partial B–C damage still on A–B–C–E–F), plasticity **does not qualify** — cost rises but adaptation is blocked (audit experiment 2).

### 5.4 One plasticity iteration

Every **280 ms** while running and not paused:

1. **Dijkstra** selects route on current graph.
2. Edges on that route get **activity = 1**; other traversable edges **activity = 0**.
3. Each traversed edge updates:

\[
w_{t+1} = \mathrm{clamp}\big(w_t + \eta \cdot a \cdot (1 - w_t) - \lambda \cdot w_t,\ 0,\ 1\big)
\]

- \(\eta\) = **LEARNING RATE**
- \(\lambda\) = **DECAY RATE**
- \(a \in \{0,1\}\)

4. **Off-path** edges still get decay if \(\lambda > 0\).
5. If route **edge IDs** change vs previous tick, event **PLASTICITY · PATHWAY RESELECTED** is logged.

### 5.5 When adaptation stops

After each tick, `plasticityStopReason` may set **S4 · EVALUATED** and stop the timer:

| Reason | Condition |
|--------|-----------|
| Unreachable | Target not reachable mid-run |
| Converged | All path edge weight changes &lt; \(10^{-6}\) |
| Saturated | All path edges weight ≥ \(1 - 10^{-6}\) |
| **Iteration limit** | Iteration ≥ **20** |

The UI explicitly states iteration limit ≠ convergence.

### 5.6 Performance metric

\[
\text{performance} = \frac{\text{baseline path cost}}{\text{current path cost}}
\]

Displayed as **percent** in the right rail. **Higher** means current path cost is **lower** than baseline cost (cost ratio &gt; 1). It is **not** clinical recovery.

**Applying more damage during an active run:** if paused, you may apply damage and workflow returns to **S1 · DAMAGED** (tested in Vitest).

---

## 6. Step-by-Step User Guide

### Path A — Guided (mission control)

1. **Open app** — confirm `1 · BASELINE` and `S0 · BASELINE`.
2. **SELECT DAMAGE** — optional; click graph element, set **SEVERITY**, **DAMAGE SELECTED**  
   *Or* use **SIMULATE TRAUMA: B-C** for a full cut on the classic graph.
3. Confirm `2 · SELECT DAMAGE` / `S1 · DAMAGED`.
4. **ANALYSE & SIMULATE** — auto-runs analysis; if qualified, starts plasticity (`3 · SIMULATE`, `S3 · ADAPTING`).
5. Watch green edges on route **A→D→E→F** (after full B–C trauma) thicken/brighten over iterations.
6. **PAUSE** if needed; **RESET ADAPTATION** only while paused or stopped (restores pre-run damaged checkpoint).
7. When stopped (`4 · RESULT`, `S4 · EVALUATED`), **COMPARE RESULTS**.
8. **RESET SIMULATION** for a new scenario.

### Path B — Technical (advanced panel)

1. Damage as above.
2. Expand **ADVANCED SIMULATION** → **ANALYSE NETWORK** → read report.
3. **SIMULATE NEUROPLASTICITY** (equivalent to analyse+start if not yet analysed).

### What to expect after damage without plasticity

Partial damage on same route: path analysis works, **SIMULATE** shows notice: no qualifying alternative pathway.

---

## 7. Understanding Results

### 7.1 Path costs

| Metric | Source |
|--------|--------|
| Baseline cost | Dijkstra(reference graph) |
| Current cost | Dijkstra(current graph) |
| Cost delta in UI | `current − baseline` with arrow icon |

### 7.2 Counts

| Label | Definition |
|-------|------------|
| Active nodes | capacity &gt; 0, status active |
| Active edges | `isEdgeVisuallyTraversable` (endpoints active, active, weight &gt; 0) |
| Disrupted edges | inactive or weight 0 |
| Damaged nodes | capacity &lt; 1 |
| Strengthened edges | `weight > initialWeight` (tiny epsilon) |

### 7.3 History charts

Each history entry stores graph JSON, iteration, path cost, performance at that snapshot. Chart route series uses the **union** of path edge IDs seen across snapshots (so rerouted edges remain visible in the weight chart).

### 7.4 Events

Recorded operations (damage, analysis, plasticity ticks, stops, preset trauma, evaluation). Newest first; list capped at **12**.

---

## 8. Simulation Controls Summary

| Action | Effect | Restrictions |
|--------|--------|--------------|
| **PAUSE** / **RESUME** | Stops/starts 280 ms ticks | Only while `isRunning` |
| **RESET ADAPTATION** | Restores checkpoint graph + analysis report; clears checkpoint | Needs checkpoint; blocks while running **unless paused** |
| **RESET SIMULATION** | Full hydrate to pristine network at size | — |
| **Undo** | Pop undo stack (graph, history, events, workflow) | Disabled when `busy`; max 20 deep |
| **RESTORE SELECTED** | Repair one node/edge | Not in baseline-only without damage workflow nuances |
| **COMPARE RESULTS** | Marks evaluation, logs summary | Not while `busy` |

---

## 9. Troubleshooting

| Problem | Why | What to do |
|---------|-----|------------|
| **ANALYSE & SIMULATE** does nothing / notice appears | No qualifying alternative; or target unreachable | Change damage; restore cuts; pick different source/target at baseline |
| **SIMULATE NEUROPLASTICITY** disabled | No damage yet, or still on baseline workflow | Apply damage first |
| **ANALYSE NETWORK** disabled | Not in **S1**, or no damage flags, or busy | Apply damage; pause plasticity |
| Severity 0% message | Validation requires &gt; 0% | Move slider above 0 |
| **RESET ADAPTATION** disabled | No checkpoint or running unpaused | Pause first; start a run to create checkpoint |
| **NETWORK SIZE** locked | Damage applied | **RESET SIMULATION** |
| Graph not green after damage | Green only during/after adaptation | Start simulation |
| Performance &gt; 100% or &lt; 100% | Pure cost ratio | Read as “cheaper vs baseline route” only in this model |
| Charts empty early | Need history snapshots | Damage / analyse / simulate to add points |

---

## 10. Limitations and Important Notes

- **Synthetic abstraction** only.
- **Undirected** visualisation; edges stored with source/target.
- **Plasticity** strengthens **current** Dijkstra path, not all “biologically plausible” detours.
- **20 iterations** hard cap.
- **Network size ≠ 18** uses procedural generator (seeded by size); trauma preset requires edge **B–C**.
- **No** persistence across browser refresh.
- **No** multi-user or server-side simulation state in the open-source UI code reviewed.

---

## 11. Glossary

| Term | Simple definition |
|------|-------------------|
| **Node** | A point in the network (region); has capacity. |
| **Edge / connection** | Link between two nodes with weight. |
| **Weight** | Model strength 0–1; higher = lower traversal cost. |
| **Capacity** | Node availability 0–1; lowers traversal through that node. |
| **Severity** | Percent damage applied to selected node or edge. |
| **Reference / baseline graph** | Undamaged snapshot for comparison. |
| **Dijkstra path** | Minimum total traversal-cost path used for routing display and plasticity activity. |
| **Alternative pathway (qualifying)** | Meets `hasValidAlternativePath` rules — required to start plasticity. |
| **Learning rate (η)** | How fast active edges grow toward weight 1. |
| **Decay (λ)** | Shrinks weights on all updated traversable edges each tick. |
| **Iteration** | One plasticity time step (max 20). |
| **Pathway reselection** | Dijkstra picked different edge set than previous tick. |
| **Performance %** | `100 × baselineCost/currentCost` proxy. |
| **busy** | Plasticity running and **not** paused — many edits blocked. |

---

## 12. Worked Example (18-node graph, verified numbers)

**Setup:** Default size **18**, source **A**, target **F**, learning rate **0.10**, decay **0**.

### Step 0 — Baseline

| Quantity | Value (computed) |
|----------|------------------|
| Baseline path | **A → B → C → E → F** |
| Baseline path cost | **4.6487** (full precision in engine: 4.648692810457517) |

### Step 1 — Complete trauma on B–C

Action: **SIMULATE TRAUMA: B–C** (100% edge damage).

| Quantity | Value |
|----------|-------|
| Workflow | **S1 · DAMAGED** |
| B–C | Inactive, weight 0 (red/disrupted in graph) |
| New min-cost path | **A → D → E → F** |
| Current cost (after damage, before manual analyse) | **7.3016** (7.301587301587302) |
| Qualifies for plasticity? | **Yes** (`alternativeOk: true`) |
| Analysis headline (if you analyse) | “Alternative routing available · 36 simple path surveyed (limit 200)” |

### Step 2 — Analyse & simulate

Action: **ANALYSE & SIMULATE** (or analyse then **SIMULATE NEUROPLASTICITY**).

- Analysis stored; plasticity starts if `preparePlasticityRun.ready`.
- Checkpoint saved — **RESET ADAPTATION** can return to this damaged pre-run state when paused.
- Edges **A–D**, **D–E**, **E–F** gain green recruitment styling over iterations.
- Edge **A–D** initial weight **0.30** increases on early ticks while on the active path.

### Step 3 — Pause and reset adaptation (regression-tested)

1. Let iteration reach **≥ 1**.
2. **Pause plasticity simulation**.
3. **RESET ADAPTATION** → workflow **S2 · ANALYSED**, iteration **0**, **A–D** weight back to **~0.30**, ticks stop.

### Performance after damage (before plasticity improves weights)

\[
\text{performance} \approx \frac{4.6487}{7.3016} \approx 0.637 \Rightarrow \textbf{63.7\%}
\]

(Lower ratio means the damaged routing is **more expensive** than the healthy baseline path — expected after trauma.)

### Partial damage contrast (no plasticity)

**40%** damage on **B–C** only: path stays **A → B → C → E → F**, cost rises above baseline, **`hasValidAlternativePath` = false** — plasticity blocked with policy message. Verified in audit experiment 2.

---

## Document history

| Field | Value |
|-------|--------|
| Created | From source audit of `brain-synaptics` simulator |
| Equations | Match `src/simulation/graph.js` |
| Example numeric values | From Node execution on baseline graph (same as audit #1 and #3) |
| Tests cited | Vitest 66/66, audit 12/12 at manual creation time |

If the UI labels or constants change in code, update this file to match — **do not** treat this PDF-style manual as overriding the implementation.