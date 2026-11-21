import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  GitBranch,
  RotateCcw,
  ScanEye,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraphCanvas } from "@/components/simulator/GraphCanvas.jsx";
import { HistoryCharts } from "@/components/simulator/HistoryCharts.jsx";
import {
  SIMPLE_PATH_LIMIT,
  WeightedGraph,
  adaptationStep,
  analyzeConnectivity,
  applyEdgeDamage,
  applyNodeDamage,
  breadthFirstSearch,
  depthFirstPaths,
  dijkstra,
  networkHasDamage,
  restoreEdge,
  restoreNode,
} from "@/simulation/graph.js";

const MAX_ITERATIONS = 20;
const PHASE = {
  baseline: "S0 · BASELINE",
  damage: "S1 · AFTER DAMAGE",
  recruited: "S2 · PATHWAY RECRUITED",
  adapted: "S3 · AFTER ADAPTATION",
};

const initialHistory = () => {
  const graph = WeightedGraph.baseline();
  const base = dijkstra(graph, "A", "F");
  const metrics = analyzeConnectivity(graph, "A", "F", base.cost);
  return [
    {
      index: 0,
      iteration: 0,
      state: PHASE.baseline,
      graph: graph.toJSON(),
      cost: metrics.current.cost,
      performance: metrics.performance,
    },
  ];
};

export function Simulator() {
  const [graph, setGraph] = useState(() => WeightedGraph.baseline());
  const [source, setSource] = useState("A");
  const [target, setTarget] = useState("F");
  const [damageType, setDamageType] = useState("node");
  const [severity, setSeverity] = useState(40);
  const [learningRate, setLearningRate] = useState(0.1);
  const [decayRate, setDecayRate] = useState(0);
  const [iteration, setIteration] = useState(0);
  const [selected, setSelected] = useState({ type: "node", id: "A" });
  const [activePath, setActivePath] = useState([]);
  const [algorithm, setAlgorithm] = useState(null);
  const [history, setHistory] = useState(initialHistory);
  const [events, setEvents] = useState([
    {
      id: 0,
      title: "S0 · BASELINE NETWORK LOADED",
      detail: "18 nodes · 25 weighted connections",
      tone: "normal",
    },
  ]);
  const [undoStack, setUndoStack] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState(PHASE.baseline);
  const eventSeq = useRef(1);
  const baselineGraph = useMemo(() => WeightedGraph.baseline(), []);
  const baselineRoute = useMemo(
    () => dijkstra(baselineGraph, source, target),
    [baselineGraph, source, target],
  );
  const metrics = useMemo(
    () => analyzeConnectivity(graph, source, target, baselineRoute.cost),
    [graph, source, target, baselineRoute.cost],
  );
  const allNodes = [...graph.nodes.values()];
  const allEdges = [...graph.edges.values()];
  const selectedNode = selected.type === "node" ? graph.getNode(selected.id) : null;
  const selectedEdge = selected.type === "edge" ? graph.getEdge(selected.id) : null;
  const selectedId = selected?.id ?? (damageType === "node" ? allNodes[0]?.id : allEdges[0]?.id);
  const damaged = networkHasDamage(graph);
  const busy = isRunning && !isPaused;

  const pushEvent = useCallback((event) => {
    const id = eventSeq.current++;
    setEvents((previous) => [{ ...event, id }, ...previous].slice(0, 12));
  }, []);

  const record = useCallback(
    (nextGraph, nextIteration, stateName, title, detail, tone = "normal") => {
      const base = dijkstra(WeightedGraph.baseline(), source, target);
      const nextMetrics = analyzeConnectivity(nextGraph, source, target, base.cost);
      setHistory((previous) => [
        ...previous,
        {
          index: previous.length,
          iteration: nextIteration,
          state: stateName,
          graph: nextGraph.toJSON(),
          cost: nextMetrics.current.cost,
          performance: nextMetrics.performance,
        },
      ]);
      pushEvent({ title, detail, tone });
    },
    [pushEvent, source, target],
  );

  const saveUndo = useCallback(() => {
    setUndoStack((previous) =>
      [...previous, { graph: graph.toJSON(), iteration, activePath, history, events, phase }].slice(
        -20,
      ),
    );
  }, [activePath, events, graph, history, iteration, phase]);

  const reset = () => {
    setGraph(WeightedGraph.baseline());
    setSource("A");
    setTarget("F");
    setDamageType("node");
    setIteration(0);
    setSelected({ type: "node", id: "A" });
    setActivePath([]);
    setAlgorithm(null);
    setHistory(initialHistory());
    setEvents([
      {
        id: eventSeq.current++,
        title: "S0 · BASELINE NETWORK LOADED",
        detail: "Simulation reset to the original synthetic dataset",
        tone: "normal",
      },
    ]);
    setUndoStack([]);
    setIsRunning(false);
    setIsPaused(false);
    setNotice("");
    setPhase(PHASE.baseline);
  };

  const retarget = (which, value) => {
    if (which === "source") setSource(value);
    else setTarget(value);
    setAlgorithm(null);
    setActivePath([]);
    setPhase(iteration > 0 ? PHASE.adapted : damaged ? PHASE.damage : PHASE.baseline);
  };

  const runAlgorithm = (kind) => {
    try {
      let result;
      if (kind === "BFS") result = breadthFirstSearch(graph, source, target);
      else if (kind === "DFS") result = { paths: depthFirstPaths(graph, source, target, 12) };
      else result = dijkstra(graph, source, target);
      setAlgorithm({ kind, result });
      const found = kind === "DFS" ? result.paths.length > 0 : result.reachable;
      if (kind !== "DFS" && result.reachable) setActivePath(result.path);
      else if (kind === "DFS" && result.paths.length) setActivePath(result.paths[0]);
      else setActivePath([]);
      setNotice(result.error ?? "");
      if (found && damaged && iteration === 0) setPhase(PHASE.recruited);
      const detail =
        kind === "DFS"
          ? `${result.paths?.length ?? 0} simple path${result.paths?.length === 1 ? "" : "s"} found (limit 12)`
          : result.reachable
            ? `${result.path.join(" → ")}${kind === "DIJKSTRA" ? ` · cost ${result.cost.toFixed(4)}` : ` · ${result.edgeCount} edges`}`
            : (result.error ?? "Target unreachable in the current graph");
      pushEvent({
        title: `${kind} · ${found ? "EXECUTED" : "NO PATH"}`,
        detail,
        tone: found ? "normal" : "damage",
      });
    } catch (error) {
      setNotice(error.message);
    }
  };

  const applyDamage = () => {
    if (severity <= 0) {
      setNotice("Damage severity must be greater than 0%.");
      return;
    }
    try {
      const nextGraph = graph.clone();
      if (damageType === "edge") applyEdgeDamage(nextGraph, selectedId, severity);
      else applyNodeDamage(nextGraph, selectedId, severity);
      saveUndo();
      setGraph(nextGraph);
      setAlgorithm(null);
      setActivePath([]);
      setNotice("");
      setPhase(PHASE.damage);
      const subject = damageType === "edge" ? `EDGE ${selectedId}` : `NODE ${selectedId}`;
      record(
        nextGraph,
        iteration,
        PHASE.damage,
        `${subject} · ${severity}% DAMAGE APPLIED`,
        damageType === "edge"
          ? `Effective connection weight ${nextGraph.getEdge(selectedId).weight.toFixed(2)}`
          : `Remaining capacity ${nextGraph.getNode(selectedId).capacity.toFixed(2)}`,
        "damage",
      );
    } catch (error) {
      setNotice(error.message);
    }
  };

  const restoreSelected = () => {
    try {
      const nextGraph = graph.clone();
      if (damageType === "edge") restoreEdge(nextGraph, selectedId);
      else restoreNode(nextGraph, selectedId);
      saveUndo();
      setGraph(nextGraph);
      setAlgorithm(null);
      setActivePath([]);
      setNotice("");
      setPhase(
        networkHasDamage(nextGraph)
          ? iteration > 0
            ? PHASE.adapted
            : PHASE.damage
          : iteration > 0
            ? PHASE.adapted
            : PHASE.baseline,
      );
      record(
        nextGraph,
        iteration,
        "NETWORK RESTORED",
        `${damageType.toUpperCase()} ${selectedId} · RESTORED`,
        "Original synthetic connection and capacity preserved",
        "normal",
      );
    } catch (error) {
      setNotice(error.message);
    }
  };

  const traumaPreset = () => {
    const nextGraph = graph.clone();
    try {
      const edge = nextGraph.getEdge("B-C");
      if (!edge) throw new Error("Edge B-C was not found.");
      if (!edge.active) {
        setNotice("Edge B-C is already disrupted.");
        return;
      }
      applyEdgeDamage(nextGraph, "B-C", 100);
    } catch (error) {
      setNotice(error.message);
      return;
    }
    saveUndo();
    setGraph(nextGraph);
    setSelected({ type: "edge", id: "B-C" });
    setDamageType("edge");
    setAlgorithm(null);
    setNotice("");
    const route = dijkstra(nextGraph, source, target);
    const bfs = breadthFirstSearch(nextGraph, source, target);
    setActivePath(route.reachable ? route.path : []);
    setAlgorithm({ kind: "DIJKSTRA", result: route, alsoBfs: bfs });
    setPhase(route.reachable ? PHASE.recruited : PHASE.damage);
    record(
      nextGraph,
      iteration,
      PHASE.damage,
      "PRESET · B-C DISRUPTED",
      route.reachable
        ? `BFS: ${bfs.path.join(" → ")} · Dijkstra: ${route.path.join(" → ")}`
        : "The selected target is unreachable",
      "damage",
    );
    if (route.reachable) {
      pushEvent({
        title: "BFS + DIJKSTRA · EXECUTED",
        detail: `${route.path.join(" → ")} · cost ${route.cost.toFixed(4)}`,
        tone: "normal",
      });
    }
  };

  const runAdaptation = useCallback(
    (steps, fromTimer = false) => {
      if (iteration >= MAX_ITERATIONS || (isPaused && fromTimer)) {
        setIsRunning(false);
        return;
      }
      const nextGraph = graph.clone();
      let nextIteration = iteration;
      let last = null;
      for (let count = 0; count < steps && nextIteration < MAX_ITERATIONS; count += 1) {
        last = adaptationStep(
          nextGraph,
          source,
          target,
          learningRate,
          decayRate,
          nextIteration + 1,
        );
        if (!last.reachable) {
          setNotice(last.error);
          setAlgorithm({ kind: "DIJKSTRA", result: dijkstra(nextGraph, source, target) });
          setIsRunning(false);
          return;
        }
        nextIteration += 1;
      }
      if (!last) return;
      if (!fromTimer) saveUndo();
      setGraph(nextGraph);
      setIteration(nextIteration);
      setActivePath(last.path);
      setAlgorithm({ kind: "DIJKSTRA", result: dijkstra(nextGraph, source, target) });
      setNotice("");
      setPhase(PHASE.adapted);
      const changed = last.changes
        .map(
          (change) => `${change.edgeId} ${change.previous.toFixed(3)}→${change.weight.toFixed(3)}`,
        )
        .join(" · ");
      record(
        nextGraph,
        nextIteration,
        PHASE.adapted,
        `ADAPTATION · ITERATION ${nextIteration}/${MAX_ITERATIONS}`,
        changed || "No active pathway weights changed",
        "adapted",
      );
      if (nextIteration >= MAX_ITERATIONS) setIsRunning(false);
    },
    [decayRate, graph, isPaused, iteration, learningRate, record, saveUndo, source, target],
  );

  const runAll = () => {
    if (iteration >= MAX_ITERATIONS) return;
    if (isRunning) setIsPaused((previous) => !previous);
    else {
      saveUndo();
      setIsPaused(false);
      setIsRunning(true);
    }
  };

  useEffect(() => {
    if (!isRunning || isPaused) return undefined;
    const timer = window.setInterval(() => runAdaptation(1, true), 280);
    return () => window.clearInterval(timer);
  }, [isPaused, isRunning, runAdaptation]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setGraph(new WeightedGraph(previous.graph));
    setIteration(previous.iteration);
    setActivePath(previous.activePath);
    setHistory(previous.history);
    setEvents(previous.events);
    setPhase(previous.phase ?? PHASE.baseline);
    setUndoStack((stack) => stack.slice(0, -1));
    setAlgorithm(null);
    setNotice("");
    setIsRunning(false);
    setIsPaused(false);
  };

  const onSelect = useCallback((item) => {
    setSelected(item);
    setDamageType(item.type === "edge" ? "edge" : "node");
    setNotice("");
  }, []);

  const chartHistory = useMemo(
    () =>
      history.map((point) => {
        const snapshot = new WeightedGraph(point.graph);
        const current = analyzeConnectivity(snapshot, source, target, baselineRoute.cost);
        return {
          index: point.index,
          iteration: point.iteration,
          cost: current.current.reachable ? current.current.cost : null,
          performance: current.performance,
          edges: Object.fromEntries(
            [...snapshot.edges.values()].map((edge) => [edge.id, edge.weight]),
          ),
        };
      }),
    [baselineRoute.cost, history, source, target],
  );
  const routeEdgeIds = metrics.current.edgeIds?.length
    ? metrics.current.edgeIds
    : (baselineRoute.edgeIds ?? []);
  const performancePercent = metrics.performance * 100;
  const strengthenedEdges = allEdges.filter(
    (edge) => edge.weight > edge.initialWeight + 1e-9,
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Activity size={19} />
          </div>
          <div>
            <h1>
              NEUROPLASTICITY <span>[ GRAPH NETWORK SIMULATOR ]</span>
            </h1>
            <p>
              DYNAMIC WEIGHTED GRAPH MODEL <span className="header-separator">/</span> SYNTHETIC
              COMPUTATIONAL STUDY
            </p>
          </div>
        </div>
        <div className="top-actions">
          <div className="status-indicator">
            <span className={`status-dot ${isRunning && !isPaused ? "running" : ""}`} />
            {isRunning ? (isPaused ? "PAUSED" : "RUNNING") : "IDLE"}
          </div>
          <span className="state-chip">{phase}</span>
          <Button size="sm" variant="outline" onClick={reset} aria-label="Reset simulation">
            <RotateCcw size={14} /> RESET
          </Button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="left-rail">
          <section className="control-section">
            <SectionTitle icon={<GitBranch size={14} />} title="NETWORK" index="01" />
            <Field label="SOURCE NODE">
              <select
                value={source}
                disabled={busy}
                onChange={(event) => retarget("source", event.target.value)}
                aria-label="Source node"
              >
                {allNodes.map((node) => (
                  <option value={node.id} key={node.id}>
                    {node.id} · {node.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="TARGET NODE">
              <select
                value={target}
                disabled={busy}
                onChange={(event) => retarget("target", event.target.value)}
                aria-label="Target node"
              >
                {allNodes.map((node) => (
                  <option value={node.id} key={node.id}>
                    {node.id} · {node.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="button-stack">
              <Button variant="outline" className="action-button" onClick={reset}>
                <RotateCcw size={14} /> LOAD / RESET BASELINE
              </Button>
              <Button
                variant="warning"
                className="action-button"
                onClick={traumaPreset}
                disabled={busy}
              >
                <ShieldAlert size={14} /> SIMULATE TRAUMA: B-C
              </Button>
            </div>
          </section>

          <section className="control-section">
            <SectionTitle icon={<ShieldAlert size={14} />} title="DAMAGE / RESTORE" index="02" />
            <Field label="ELEMENT TYPE">
              <select
                value={damageType}
                disabled={busy}
                onChange={(event) => {
                  const type = event.target.value;
                  const id =
                    type === "edge"
                      ? (allEdges.find(
                          (edge) => edge.source === selected.id || edge.target === selected.id,
                        )?.id ??
                        selectedEdge?.id ??
                        allEdges[0].id)
                      : (selectedNode?.id ?? selectedEdge?.source ?? allNodes[0].id);
                  setDamageType(type);
                  setSelected({ type, id });
                  setNotice("");
                }}
                aria-label="Damage element type"
              >
                <option value="edge">CONNECTION / EDGE</option>
                <option value="node">NODE / REGION</option>
              </select>
            </Field>
            <Field label={damageType === "edge" ? "SELECT CONNECTION" : "SELECT NODE"}>
              <select
                value={selectedId}
                disabled={busy}
                onChange={(event) => setSelected({ type: damageType, id: event.target.value })}
                aria-label="Select element to damage"
              >
                {(damageType === "edge" ? allEdges : allNodes).map((item) => (
                  <option value={item.id} key={item.id}>
                    {damageType === "edge"
                      ? `${item.id} · ${item.active && item.weight > 0 ? item.weight.toFixed(2) : "DISRUPTED"}`
                      : `${item.id} · ${item.name}`}
                  </option>
                ))}
              </select>
            </Field>
            <div className="range-row">
              <label htmlFor="severity">SEVERITY</label>
              <output htmlFor="severity" className="range-value">
                {severity}%
              </output>
            </div>
            <input
              id="severity"
              className="range-control damage-range"
              type="range"
              min="0"
              max="100"
              step="1"
              value={severity}
              onChange={(event) => setSeverity(Number(event.target.value))}
            />
            <div className="button-stack damage-buttons">
              <Button
                variant="destructive"
                className="action-button"
                onClick={applyDamage}
                disabled={busy}
              >
                <ShieldAlert size={14} /> APPLY DAMAGE
              </Button>
              <Button
                variant="outline"
                className="action-button"
                onClick={restoreSelected}
                disabled={busy}
              >
                <RotateCcw size={14} /> RESTORE SELECTED
              </Button>
            </div>
          </section>

          <section className="control-section">
            <SectionTitle icon={<ScanEye size={14} />} title="ALGORITHMS" index="03" />
            <div className="algorithm-buttons">
              <Button variant="outline" onClick={() => runAlgorithm("BFS")} disabled={busy}>
                BFS
              </Button>
              <Button variant="outline" onClick={() => runAlgorithm("DFS")} disabled={busy}>
                DFS
              </Button>
              <Button variant="outline" onClick={() => runAlgorithm("DIJKSTRA")} disabled={busy}>
                DIJKSTRA
              </Button>
            </div>
            {algorithm && <AlgorithmResult algorithm={algorithm} />}
          </section>

          <section className="control-section plasticity-section">
            <SectionTitle icon={<Activity size={14} />} title="PLASTICITY" index="04" />
            <RangeControl
              id="learning-rate"
              label="LEARNING RATE"
              value={learningRate}
              onChange={setLearningRate}
              max={0.5}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
            />
            <RangeControl
              id="decay-rate"
              label="DECAY RATE"
              value={decayRate}
              onChange={setDecayRate}
              max={0.2}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
            />
            <div className="iteration-label">
              <span>ITERATION</span>
              <strong>
                {String(iteration).padStart(2, "0")} <small>/ {MAX_ITERATIONS}</small>
              </strong>
            </div>
            <div className="iteration-buttons">
              <Button
                size="sm"
                variant="outline"
                onClick={() => runAdaptation(1)}
                disabled={iteration >= MAX_ITERATIONS || isRunning}
              >
                + 1
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runAdaptation(5)}
                disabled={iteration >= MAX_ITERATIONS || isRunning}
              >
                + 5
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={runAll}
                disabled={iteration >= MAX_ITERATIONS}
              >
                {isRunning ? (
                  isPaused ? (
                    <>
                      <CirclePlay size={13} /> RESUME
                    </>
                  ) : (
                    "PAUSE"
                  )
                ) : (
                  "RUN ALL"
                )}
              </Button>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={MAX_ITERATIONS}
              aria-valuenow={iteration}
              aria-label={`Adaptation progress ${iteration} of ${MAX_ITERATIONS}`}
            >
              <span style={{ width: `${(iteration / MAX_ITERATIONS) * 100}%` }} />
            </div>
          </section>
        </aside>

        <section className="graph-workspace">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">
                NETWORK TOPOLOGY <span>·</span> UNDIRECTED
              </div>
              <h2>Graph workspace</h2>
            </div>
            <div className="workspace-heading-right">
              <span className="model-equation">G(t) = (V, E, W)</span>
              <span className="model-revision">REV. {String(iteration).padStart(2, "0")}</span>
            </div>
          </div>
          <div className="graph-frame">
            <div className="graph-frame-header">
              <span>ACTIVE NETWORK</span>
              <span>
                {metrics.activeNodeCount} NODES <i /> {metrics.activeEdgeCount} CONNECTIONS
              </span>
            </div>
            <GraphCanvas
              graph={graph}
              source={source}
              target={target}
              path={activePath}
              selected={selected}
              onSelect={onSelect}
            />
            <div className="graph-legend">
              <span>
                <i className="legend-node source-legend" /> SOURCE
              </span>
              <span>
                <i className="legend-node target-legend" /> TARGET
              </span>
              <span>
                <i className="legend-node silent-legend" /> LOW ACTIVITY
              </span>
              <span>
                <i className="legend-line" /> ACTIVE
              </span>
              <span>
                <i className="legend-line strengthened-legend" /> STRENGTHENED
              </span>
              <span>
                <i className="legend-line recovery-legend" /> RECOVERING
              </span>
              <span>
                <i className="legend-line disrupted-legend" /> DAMAGED
              </span>
              <span>
                <i className="legend-line route-legend" /> CURRENT PATH
              </span>
              <span className="legend-hint">ARROWS MOVE SELECTION</span>
            </div>
          </div>
          {notice && (
            <div className="notice" role="alert">
              <CircleHelp size={14} />
              {notice}
            </div>
          )}
          <section className="inspection-strip">
            <div className="inspection-title">
              <span>SELECTION INSPECTOR</span>
              <span className="selection-kind">
                {selected.type === "node" ? "NODE" : "CONNECTION"} · {selected.id}
              </span>
            </div>
            {selectedNode ? (
              <div className="inspection-grid">
                <InspectorValue label="NAME" value={selectedNode.name} />
                <InspectorValue label="ROLE" value={selectedNode.role} />
                <InspectorValue
                  label="BASE ACTIVATION"
                  value={selectedNode.activation.toFixed(2)}
                />
                <InspectorValue label="CAPACITY" value={selectedNode.capacity.toFixed(2)} />
                <InspectorValue
                  label="STATUS"
                  value={selectedNode.status.toUpperCase()}
                  tone={selectedNode.status === "active" ? "normal" : "damage"}
                />
              </div>
            ) : selectedEdge ? (
              <div className="inspection-grid">
                <InspectorValue
                  label="SOURCE → TARGET"
                  value={`${selectedEdge.source} → ${selectedEdge.target}`}
                />
                <InspectorValue label="CURRENT WEIGHT" value={selectedEdge.weight.toFixed(3)} />
                <InspectorValue
                  label="INITIAL WEIGHT"
                  value={selectedEdge.initialWeight.toFixed(2)}
                />
                <InspectorValue label="DAMAGE" value={`${selectedEdge.damageSeverity}%`} />
                <InspectorValue
                  label="USAGE / STATUS"
                  value={`${selectedEdge.usageCount} · ${selectedEdge.active && selectedEdge.weight > 0 ? "ACTIVE" : "DISRUPTED"}`}
                  tone={selectedEdge.active && selectedEdge.weight > 0 ? "normal" : "damage"}
                />
              </div>
            ) : (
              <p className="empty-inspection">
                Select a node or connection to inspect its current model values.
              </p>
            )}
          </section>
          <div className="scientific-note">
            <CircleHelp size={13} />
            <p>
              Connection weights are relative strengths in a synthetic graph model, not measured
              biological values. Traversal cost is 1 / (weight × source capacity × target capacity).
              Base activation is a fixed display attribute. This model is an abstraction, not a
              biologically complete neural simulator.
            </p>
          </div>
        </section>

        <aside className="right-rail">
          <section className="results-section">
            <SectionTitle icon={<Activity size={14} />} title="NETWORK STATUS" index="05" />
            <div className={`reachability ${metrics.reachable ? "reachable" : "unreachable"}`}>
              <span className="reach-dot" />
              {metrics.reachable ? "TARGET REACHABLE" : "TARGET UNREACHABLE"}
            </div>
            <div className="metric-pair-grid">
              <Metric
                label="ACTIVE NODES"
                value={`${metrics.activeNodeCount} / ${graph.nodes.size}`}
              />
              <Metric
                label="ACTIVE EDGES"
                value={`${metrics.activeEdgeCount} / ${graph.edges.size}`}
              />
              <Metric
                label="DISRUPTED EDGES"
                value={String(metrics.disruptedEdgeCount).padStart(2, "0")}
                tone={metrics.disruptedEdgeCount ? "damage" : ""}
              />
              <Metric
                label="DAMAGED NODES"
                value={String(metrics.damagedNodeCount).padStart(2, "0")}
                tone={metrics.damagedNodeCount ? "damage" : ""}
              />
            </div>
          </section>

          <section className="results-section path-section">
            <SectionTitle icon={<Cable size={14} />} title="PATH ANALYSIS" index="06" />
            <div className="path-info-block">
              <div className="data-label">
                BASELINE SHORTEST PATH{" "}
                <span>
                  {source} → {target}
                </span>
              </div>
              <div className="path-string">
                <PathNodes path={baselineRoute.reachable ? baselineRoute.path : []} />
              </div>
              <div className="data-subtext">
                BASELINE COST <b>{baselineRoute.reachable ? baselineRoute.cost.toFixed(4) : "∞"}</b>
              </div>
            </div>
            <div className="path-info-block current-path-block">
              <div className="data-label">
                CURRENT MINIMUM-COST PATH{" "}
                <span>{metrics.current.reachable ? "DIJKSTRA" : "NO ROUTE"}</span>
              </div>
              <div className="path-string current-path-string">
                <PathNodes path={metrics.current.reachable ? metrics.current.path : []} />
              </div>
              <div className="data-subtext">
                CURRENT COST{" "}
                <b>{metrics.current.reachable ? metrics.current.cost.toFixed(4) : "∞"}</b>
                {metrics.current.reachable && (
                  <CostDelta current={metrics.current.cost} baseline={baselineRoute.cost} />
                )}
              </div>
            </div>
            <details className="advanced-analysis">
              <summary>Network structure</summary>
              <div className="compact-metrics">
                <div>
                  <span>
                    SIMPLE PATHS{metrics.simplePathsLimited ? ` (FIRST ${SIMPLE_PATH_LIMIT})` : ""}
                  </span>
                  <strong>
                    {metrics.simplePathsLimited
                      ? `${metrics.alternativePathCount}+`
                      : metrics.alternativePathCount}
                  </strong>
                </div>
                <div>
                  <span>CONNECTED COMPONENTS</span>
                  <strong>{metrics.components.length}</strong>
                </div>
                <div>
                  <span>BRIDGES / CUT EDGES</span>
                  <strong>{metrics.bridges.length}</strong>
                </div>
                <div>
                  <span>ARTICULATION POINTS</span>
                  <strong>{metrics.articulationPoints.length}</strong>
                </div>
              </div>
              {metrics.bridges.length > 0 && (
                <div className="structure-detail">BRIDGES: {metrics.bridges.join(", ")}</div>
              )}
              {metrics.articulationPoints.length > 0 && (
                <div className="structure-detail">
                  CUT NODES: {metrics.articulationPoints.join(", ")}
                </div>
              )}
            </details>
          </section>

          <section className="results-section">
            <SectionTitle
              icon={<ArrowUpRight size={14} />}
              title="SIMULATED PERFORMANCE"
              index="07"
            />
            <div className="performance-row">
              <div className="performance-value">
                {performancePercent.toFixed(1)}
                <span>%</span>
              </div>
              <div className="performance-explanation">
                baseline path cost / current path cost
                <div className="performance-bar">
                  <span style={{ width: `${Math.min(performancePercent, 100)}%` }} />
                </div>
              </div>
            </div>
            <p className="performance-caveat">MODEL-SPECIFIC PROXY ONLY · NOT CLINICAL RECOVERY</p>
            <div className="metric-pair-grid secondary-metrics">
              <Metric label="AVG. ACTIVE WEIGHT" value={metrics.averageWeight.toFixed(3)} />
              <Metric
                label="STRENGTHENED EDGES"
                value={String(strengthenedEdges).padStart(2, "0")}
              />
              <Metric label="LEARNING RATE" value={learningRate.toFixed(2)} />
              <Metric label="DECAY RATE" value={decayRate.toFixed(2)} />
            </div>
          </section>

          <details className="results-section state-comparison">
            <summary>
              <SectionTitle
                as="h3"
                icon={<GitBranch size={14} />}
                title="STATE COMPARISON"
                index="08"
              />
            </summary>
            <div className="comparison-row">
              <div>
                <span>BASELINE</span>
                <strong>{baselineRoute.reachable ? baselineRoute.cost.toFixed(3) : "∞"}</strong>
                <small>PATH COST</small>
              </div>
              <div className="comparison-arrow">
                <ChevronRight size={15} />
              </div>
              <div>
                <span>CURRENT</span>
                <strong>{metrics.current.reachable ? metrics.current.cost.toFixed(3) : "∞"}</strong>
                <small>
                  {costChangeLabel(
                    baselineRoute.cost,
                    metrics.current.cost,
                    metrics.current.reachable && baselineRoute.reachable,
                  )}
                </small>
              </div>
            </div>
            <div className="state-markers">
              <span className="state-done">S0 · BASELINE</span>
              <span className={damaged ? "state-done" : "state-pending"}>S1 · DAMAGED</span>
              <span className={activePath.length || iteration > 0 ? "state-done" : "state-pending"}>
                S2 · RECRUITED
              </span>
              <span className={iteration ? "state-done" : "state-pending"}>S3 · ADAPTED</span>
            </div>
          </details>
        </aside>
      </div>

      <section className="bottom-workspace">
        <div className="bottom-heading">
          <div>
            <div className="eyebrow">MEASURED STATE HISTORY</div>
            <h2>Simulation record</h2>
          </div>
          <div className="history-count">
            {history.length} SNAPSHOTS <i /> {events.length} EVENTS
          </div>
        </div>
        <div className="history-layout">
          <div className="history-charts">
            <HistoryCharts history={chartHistory} edgeIds={routeEdgeIds} />
          </div>
          <div className="event-panel">
            <div className="event-heading">
              <span>EVENT HISTORY</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!undoStack.length}
                aria-label="Undo most recent change"
                title="Undo most recent change"
              >
                <Undo2 size={15} />
              </Button>
            </div>
            <div className="event-list">
              {events.map((event) => (
                <div className={`event-row ${event.tone}`} key={event.id} data-event-id={event.id}>
                  <span className="event-marker" />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="record-footnote">
          STATE · {phase} <i /> ITERATION {String(iteration).padStart(2, "0")} <i /> SIMULATED
          NETWORK PERFORMANCE: {metrics.performance.toFixed(3)}{" "}
          <span>· ZERO VALUES ARE RETAINED AS DISRUPTED CONNECTION RECORDS</span>
        </div>
      </section>
      <footer className="app-footer">
        <span>
          NEUROPLASTICITY SIMULATOR <i /> SYNTHETIC MODEL ONLY
        </span>
        <span>
          REPRODUCIBLE LOCAL COMPUTATION <i /> {new Date().getFullYear()}
        </span>
      </footer>
    </main>
  );
}

function costChangeLabel(baseline, current, comparable) {
  if (!comparable || !Number.isFinite(baseline) || !Number.isFinite(current)) return "UNREACHABLE";
  if (baseline === 0) return "0.0% COST CHANGE";
  const change = ((current - baseline) / baseline) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% COST CHANGE`;
}

function PathNodes({ path }) {
  if (!path?.length) return "—";
  return path.map((node, index) => (
    <span className="path-segment" key={`${node}-${index}`}>
      {index ? <ChevronRight /> : null}
      {node}
    </span>
  ));
}

function CostDelta({ current, baseline }) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  const delta = current - baseline;
  if (Math.abs(delta) < 0.00005) return <span className="cost-delta neutral">0.0000</span>;
  const improved = delta < 0;
  const Icon = improved ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={`cost-delta ${improved ? "improved" : "worse"}`}>
      <Icon size={12} />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(4)}
    </span>
  );
}

function SectionTitle({ icon, title, index, as: Tag = "div" }) {
  return (
    <Tag className="section-title">
      <span className="section-icon">{icon}</span>
      {Tag === "div" ? <h3>{title}</h3> : <span className="section-label">{title}</span>}
      <span className="section-index">{index}</span>
    </Tag>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function RangeControl({ id, label, value, onChange, max, step, formatter }) {
  return (
    <div className="range-control-group">
      <div className="range-row">
        <label htmlFor={id}>{label}</label>
        <output className="range-value" htmlFor={id}>
          {formatter(value)}
        </output>
      </div>
      <input
        id={id}
        className="range-control"
        type="range"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function InspectorValue({ label, value, tone }) {
  return (
    <div className="inspector-value">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function AlgorithmResult({ algorithm }) {
  if (algorithm.kind === "DFS") {
    return (
      <div className="algorithm-result">
        <div className="result-label">SIMPLE ROUTES · MAX 12</div>
        {algorithm.result.paths.length ? (
          algorithm.result.paths.map((path, index) => (
            <div className="result-path" key={`${index}-${path.join("-")}`}>
              {String(index + 1).padStart(2, "0")} <span>{path.join(" → ")}</span>
            </div>
          ))
        ) : (
          <div className="result-empty">NO PATH FOUND</div>
        )}
      </div>
    );
  }
  const { result } = algorithm;
  return (
    <div className="algorithm-result">
      <div className="result-label">{algorithm.kind} RESULT</div>
      {result.reachable ? (
        <div className="result-path">
          <span>{result.path.join(" → ")}</span>
          {algorithm.kind === "DIJKSTRA" && <b>{result.cost.toFixed(4)}</b>}
        </div>
      ) : (
        <div className="result-empty">{result.error ?? "NO PATH FOUND"}</div>
      )}
      {algorithm.alsoBfs && (
        <div className="result-subtext">BFS · {algorithm.alsoBfs.edgeCount} edges</div>
      )}
    </div>
  );
}
