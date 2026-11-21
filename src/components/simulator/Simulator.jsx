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
  applyEdgeDamage,
  applyNodeDamage,
  isEdgeVisuallyTraversable,
  networkHasDamage,
  restoreEdge,
  restoreNode,
  validateGraphIntegrity,
} from "@/simulation/graph.js";
import {
  DEFAULT_SOURCE_ID,
  DEFAULT_TARGET_ID,
  MAX_NETWORK_NODES,
  MIN_NETWORK_NODES,
  generateSyntheticNetwork,
} from "@/simulation/network-generator.js";
import { buildSimulationView } from "@/simulation/simulation-state.js";
import {
  WORKFLOW,
  WORKFLOW_LABEL,
  canAdapt,
  canAnalyse,
  canApplyDamage,
  canConfigureNetwork,
  canEvaluate,
  canRestore,
  getWorkflowGuidance,
  resolveWorkflowAfterRestore,
  runDisruptionAnalysis,
} from "@/simulation/simulation-workflow.js";
import {
  PLASTICITY_STOP_REASON,
  formatPathwaySwitch,
  plasticityStopReason,
  preparePlasticityRun,
} from "@/simulation/plasticity-simulation.js";
import {
  EXPERIENCE_LABEL,
  EXPERIENCE_STAGE,
  countDamage,
  resolveExperienceStage,
} from "@/components/simulator/graph-visual-state.js";

const MAX_ITERATIONS = 20;
const ADAPTATION_TICK_MS = 280;

const createPristineNetwork = (networkSize) => generateSyntheticNetwork(networkSize);

const initialHistory = (graph, referenceGraph, source, target) => {
  const view = buildSimulationView(graph, referenceGraph, source, target);
  return [
    {
      index: 0,
      iteration: 0,
      state: WORKFLOW_LABEL[WORKFLOW.baseline],
      graph: graph.toJSON(),
      cost: view.metrics.current.cost,
      performance: view.metrics.performance,
    },
  ];
};

export function Simulator() {
  const [networkSize, setNetworkSize] = useState(18);
  const [referenceGraphJson, setReferenceGraphJson] = useState(() =>
    createPristineNetwork(18).toJSON(),
  );
  const [graph, setGraph] = useState(() => createPristineNetwork(18));
  const [source, setSource] = useState(DEFAULT_SOURCE_ID);
  const [target, setTarget] = useState(DEFAULT_TARGET_ID);
  const [damageType, setDamageType] = useState("node");
  const [severity, setSeverity] = useState(40);
  const [learningRate, setLearningRate] = useState(0.1);
  const [decayRate, setDecayRate] = useState(0);
  const [iteration, setIteration] = useState(0);
  const [selected, setSelected] = useState({ type: "node", id: DEFAULT_SOURCE_ID });
  const [pathPreview, setPathPreview] = useState(null);
  const [analysisReport, setAnalysisReport] = useState(null);
  const [workflowStep, setWorkflowStep] = useState(WORKFLOW.baseline);
  const referenceGraph = useMemo(
    () => WeightedGraph.fromJSON(referenceGraphJson),
    [referenceGraphJson],
  );
  const simulationView = useMemo(
    () => buildSimulationView(graph, referenceGraph, source, target),
    [graph, referenceGraph, source, target],
  );
  const metrics = simulationView.metrics;
  const baselineRoute = simulationView.baselineRoute;
  const [history, setHistory] = useState(() =>
    initialHistory(
      createPristineNetwork(18),
      createPristineNetwork(18),
      DEFAULT_SOURCE_ID,
      DEFAULT_TARGET_ID,
    ),
  );
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
  const [adaptationCheckpoint, setAdaptationCheckpoint] = useState(null);
  const [notice, setNotice] = useState("");
  const [damageMode, setDamageMode] = useState(false);
  const phase = WORKFLOW_LABEL[workflowStep];
  const eventSeq = useRef(1);
  const lastPlasticityRouteRef = useRef(null);
  const hasTraumaPreset = Boolean(graph.getEdge("B-C")?.active);
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
      const view = buildSimulationView(nextGraph, referenceGraph, source, target);
      setHistory((previous) => [
        ...previous,
        {
          index: previous.length,
          iteration: nextIteration,
          state: stateName,
          graph: nextGraph.toJSON(),
          cost: view.metrics.current.cost,
          performance: view.metrics.performance,
        },
      ]);
      pushEvent({ title, detail, tone });
    },
    [pushEvent, referenceGraph, source, target],
  );

  const saveUndo = useCallback(() => {
    setUndoStack((previous) =>
      [
        ...previous,
        {
          graph: graph.toJSON(),
          referenceGraphJson,
          networkSize,
          iteration,
          pathPreview,
          history,
          events,
          workflowStep,
          analysisReport,
          adaptationCheckpoint,
          source,
          target,
        },
      ].slice(-20),
    );
  }, [
    adaptationCheckpoint,
    analysisReport,
    events,
    graph,
    history,
    iteration,
    networkSize,
    pathPreview,
    referenceGraphJson,
    source,
    target,
    workflowStep,
  ]);

  const hydrateNetwork = useCallback((size, detail) => {
    const pristine = createPristineNetwork(size);
    const nextJson = pristine.toJSON();
    setNetworkSize(size);
    setReferenceGraphJson(nextJson);
    setGraph(pristine.clone());
    setSource(DEFAULT_SOURCE_ID);
    setTarget(DEFAULT_TARGET_ID);
    setDamageType("node");
    setIteration(0);
    setSelected({ type: "node", id: DEFAULT_SOURCE_ID });
    setPathPreview(null);
    setAnalysisReport(null);
    setAdaptationCheckpoint(null);
    lastPlasticityRouteRef.current = null;
    setHistory(initialHistory(pristine, pristine, DEFAULT_SOURCE_ID, DEFAULT_TARGET_ID));
    setUndoStack([]);
    setIsRunning(false);
    setIsPaused(false);
    setNotice("");
    setWorkflowStep(WORKFLOW.baseline);
    setDamageMode(false);
    setEvents([
      {
        id: eventSeq.current++,
        title: "S0 · BASELINE NETWORK LOADED",
        detail,
        tone: "normal",
      },
    ]);
  }, []);

  const reset = () => {
    const pristine = createPristineNetwork(networkSize);
    hydrateNetwork(
      networkSize,
      `Simulation reset · ${networkSize} nodes · ${pristine.edges.size} weighted connections`,
    );
  };

  const retarget = (which, value) => {
    if (!canConfigureNetwork(workflowStep, busy)) return;
    if (which === "source") setSource(value);
    else setTarget(value);
    setPathPreview(null);
    setAnalysisReport(null);
  };

  const analyseNetwork = () => {
    if (!canAnalyse(workflowStep, graph, busy)) {
      setNotice("Run analysis only after damage has been applied.");
      return;
    }
    try {
      validateGraphIntegrity(graph);
      saveUndo();
      const report = runDisruptionAnalysis(graph, referenceGraph, source, target);
      setAnalysisReport(report);
      setPathPreview(report.preview);
      setNotice(report.disconnected ? report.headline : "");
      setWorkflowStep(WORKFLOW.analysed);
      record(
        graph,
        iteration,
        WORKFLOW_LABEL[WORKFLOW.analysed],
        report.disconnected ? "ANALYSIS · NETWORK DISCONNECTED" : "ANALYSIS · DISRUPTION SURVEYED",
        `${report.headline} ${report.detail}`,
        report.disconnected ? "damage" : "normal",
      );
    } catch (error) {
      setNotice(error.message);
    }
  };

  const evaluateResults = () => {
    if (!canEvaluate(workflowStep, busy)) return;
    saveUndo();
    setWorkflowStep(WORKFLOW.evaluated);
    setIsRunning(false);
    setIsPaused(false);
    const summary = metrics.reachable
      ? `Current cost ${metrics.current.cost.toFixed(4)} vs baseline ${baselineRoute.cost.toFixed(4)} · performance proxy ${(metrics.performance * 100).toFixed(1)}%`
      : "Target unreachable — compare structural metrics only.";
    pushEvent({
      title: "EVALUATION · STATE COMPARISON",
      detail: summary,
      tone: metrics.reachable ? "adapted" : "damage",
    });
    record(
      graph,
      iteration,
      WORKFLOW_LABEL[WORKFLOW.evaluated],
      "EVALUATION · BASELINE VS CURRENT",
      summary,
      "adapted",
    );
  };

  const applyDamage = () => {
    if (!canApplyDamage(workflowStep, busy)) return;
    if (severity <= 0) {
      setNotice("Damage severity must be greater than 0%.");
      return;
    }
    try {
      const nextGraph = graph.clone();
      if (damageType === "edge") applyEdgeDamage(nextGraph, selectedId, severity);
      else applyNodeDamage(nextGraph, selectedId, severity);
      validateGraphIntegrity(nextGraph);
      saveUndo();
      setGraph(nextGraph);
      setPathPreview(null);
      setAnalysisReport(null);
      setAdaptationCheckpoint(null);
      lastPlasticityRouteRef.current = null;
      setIteration(0);
      setIsRunning(false);
      setIsPaused(false);
      setNotice("");
      setWorkflowStep(WORKFLOW.damaged);
      const subject = damageType === "edge" ? `EDGE ${selectedId}` : `NODE ${selectedId}`;
      record(
        nextGraph,
        0,
        WORKFLOW_LABEL[WORKFLOW.damaged],
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
    if (!canRestore(workflowStep, busy)) return;
    try {
      const nextGraph = graph.clone();
      if (damageType === "edge") restoreEdge(nextGraph, selectedId);
      else restoreNode(nextGraph, selectedId);
      validateGraphIntegrity(nextGraph);
      saveUndo();
      setGraph(nextGraph);
      setPathPreview(null);
      setAnalysisReport(null);
      setNotice("");
      setWorkflowStep(resolveWorkflowAfterRestore(nextGraph, iteration));
      record(
        nextGraph,
        iteration,
        "NETWORK RESTORED",
        `${damageType.toUpperCase()} ${selectedId} · RESTORED`,
        networkHasDamage(nextGraph)
          ? "Damage remains · run analysis again before adaptation"
          : "Baseline connectivity restored",
        "normal",
      );
    } catch (error) {
      setNotice(error.message);
    }
  };

  const traumaPreset = () => {
    if (!canApplyDamage(workflowStep, busy) || !hasTraumaPreset) return;
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
    validateGraphIntegrity(nextGraph);
    setGraph(nextGraph);
    setSelected({ type: "edge", id: "B-C" });
    setDamageType("edge");
    setPathPreview(null);
    setAnalysisReport(null);
    setAdaptationCheckpoint(null);
    lastPlasticityRouteRef.current = null;
    setIteration(0);
    setIsRunning(false);
    setNotice("");
    setWorkflowStep(WORKFLOW.damaged);
    record(
      nextGraph,
      0,
      WORKFLOW_LABEL[WORKFLOW.damaged],
      "PRESET · B-C DISRUPTED",
      "Run network analysis to survey rerouting before adaptation",
      "damage",
    );
  };

  const runPlasticityTick = useCallback(() => {
    if (isPaused || iteration >= MAX_ITERATIONS) return;
    const nextGraph = graph.clone();
    const step = adaptationStep(nextGraph, source, target, learningRate, decayRate, iteration + 1, {
      previousEdgeIds: lastPlasticityRouteRef.current,
    });
    if (step.pathChanged) {
      pushEvent({
        title: "PLASTICITY · PATHWAY RESELECTED",
        detail: formatPathwaySwitch(lastPlasticityRouteRef.current, step.edgeIds, step.path),
        tone: "normal",
      });
    }
    lastPlasticityRouteRef.current = step.edgeIds;
    if (!step.reachable) {
      setNotice(step.error ?? "Target became unreachable during plasticity simulation.");
      setIsRunning(false);
      setWorkflowStep(WORKFLOW.analysed);
      pushEvent({
        title: "PLASTICITY · STOP (DISCONNECTED)",
        detail: step.error ?? "Synthetic model halted — not biological recovery.",
        tone: "damage",
      });
      return;
    }
    validateGraphIntegrity(nextGraph);
    const nextIteration = iteration + 1;
    setGraph(nextGraph);
    setIteration(nextIteration);
    const changed = step.changes
      .filter((change) => change.activity > 0)
      .map((change) => `${change.edgeId} ${change.previous.toFixed(3)}→${change.weight.toFixed(3)}`)
      .join(" · ");
    record(
      nextGraph,
      nextIteration,
      WORKFLOW_LABEL[WORKFLOW.adapting],
      `PLASTICITY · ITERATION ${nextIteration}/${MAX_ITERATIONS}`,
      changed
        ? `${changed} · path cost ${step.cost.toFixed(4)}`
        : `No pathway weight change · cost ${step.cost.toFixed(4)}`,
      "adapted",
    );
    const stop = plasticityStopReason(step, nextIteration, MAX_ITERATIONS);
    if (stop.stopped) {
      setIsRunning(false);
      setWorkflowStep(WORKFLOW.evaluated);
      setNotice(stop.message);
      pushEvent({
        title: `PLASTICITY · STOP (${stop.reason.toUpperCase()})`,
        detail: `${stop.message} Synthetic computational model only.`,
        tone: stop.reason === PLASTICITY_STOP_REASON.unreachable ? "damage" : "adapted",
      });
    }
  }, [decayRate, graph, isPaused, iteration, learningRate, pushEvent, record, source, target]);

  const commitAnalysis = useCallback(
    (report, { recordEvent = true } = {}) => {
      setAnalysisReport(report);
      setPathPreview(report.preview);
      setWorkflowStep(WORKFLOW.analysed);
      if (!recordEvent) return report;
      record(
        graph,
        iteration,
        WORKFLOW_LABEL[WORKFLOW.analysed],
        report.disconnected ? "ANALYSIS · NETWORK DISCONNECTED" : "ANALYSIS · DISRUPTION SURVEYED",
        `${report.headline} ${report.detail}`,
        report.disconnected ? "damage" : "normal",
      );
      return report;
    },
    [graph, iteration, record],
  );

  const simulateNeuroplasticity = () => {
    if (isRunning) return;
    try {
      validateGraphIntegrity(graph);
      let report = analysisReport;
      if (workflowStep === WORKFLOW.damaged || !report) {
        saveUndo();
        report = runDisruptionAnalysis(graph, referenceGraph, source, target);
        commitAnalysis(report);
      }
      const prep = preparePlasticityRun(graph, referenceGraph, source, target);
      if (!prep.ready) {
        setNotice(prep.message);
        return;
      }
      saveUndo();
      setAdaptationCheckpoint({
        graphJson: graph.toJSON(),
        analysisReport: report,
        iteration: 0,
      });
      lastPlasticityRouteRef.current = prep.route.edgeIds;
      setPathPreview(null);
      setIteration(0);
      setNotice("");
      setWorkflowStep(WORKFLOW.adapting);
      setIsRunning(true);
      setIsPaused(false);
      pushEvent({
        title: "PLASTICITY · SIMULATION STARTED",
        detail: `${prep.message} Policy: minimum-cost Dijkstra pathway each iteration.`,
        tone: "adapted",
      });
    } catch (error) {
      setNotice(error.message);
      setIsRunning(false);
    }
  };

  const togglePlasticityPause = () => {
    if (!isRunning) return;
    setIsPaused((previous) => {
      const resuming = previous;
      pushEvent({
        title: resuming ? "PLASTICITY · RESUMED" : "PLASTICITY · PAUSED",
        detail: resuming
          ? "Continuing iteration-by-iteration weight updates."
          : "Paused; graph state preserved.",
        tone: "adapted",
      });
      return !previous;
    });
  };

  const resetAdaptation = () => {
    if (!adaptationCheckpoint) {
      setNotice("No adaptation checkpoint saved.");
      return;
    }
    if (isRunning && !isPaused) {
      setNotice("Pause the plasticity run before resetting adaptation.");
      return;
    }
    saveUndo();
    const restored = new WeightedGraph(adaptationCheckpoint.graphJson);
    validateGraphIntegrity(restored);
    setGraph(restored);
    setIteration(0);
    setAnalysisReport(adaptationCheckpoint.analysisReport);
    setWorkflowStep(WORKFLOW.analysed);
    lastPlasticityRouteRef.current = null;
    setAdaptationCheckpoint(null);
    setNotice("");
    pushEvent({
      title: "PLASTICITY · RESET",
      detail: "Restored pre-adaptation damaged state (synthetic model checkpoint).",
      tone: "normal",
    });
  };

  useEffect(() => {
    if (!isRunning || isPaused) return undefined;
    const timer = window.setInterval(runPlasticityTick, ADAPTATION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, isRunning, runPlasticityTick]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    const restored = new WeightedGraph(previous.graph);
    validateGraphIntegrity(restored);
    setGraph(restored);
    setReferenceGraphJson(previous.referenceGraphJson ?? referenceGraphJson);
    setNetworkSize(previous.networkSize ?? networkSize);
    setSource(previous.source ?? source);
    setTarget(previous.target ?? target);
    setIteration(previous.iteration);
    setPathPreview(previous.pathPreview ?? null);
    setHistory(previous.history);
    setEvents(previous.events);
    setWorkflowStep(previous.workflowStep ?? WORKFLOW.baseline);
    setAnalysisReport(previous.analysisReport ?? null);
    setAdaptationCheckpoint(previous.adaptationCheckpoint ?? null);
    lastPlasticityRouteRef.current = null;
    setUndoStack((stack) => stack.slice(0, -1));
    setNotice("");
    setIsRunning(false);
    setIsPaused(false);
  };

  const onSelect = useCallback((item) => {
    setSelected(item);
    setDamageType(item.type === "edge" ? "edge" : "node");
    if (!busy) setDamageMode(true);
    setNotice("");
  }, [busy]);

  const chartHistory = useMemo(
    () =>
      history.map((point) => {
        const snapshot = new WeightedGraph(point.graph);
        const view = buildSimulationView(snapshot, referenceGraph, source, target);
        return {
          index: point.index,
          iteration: point.iteration,
          cost: view.metrics.current.reachable ? view.metrics.current.cost : null,
          performance: view.metrics.performance,
          edges: Object.fromEntries(
            [...snapshot.edges.values()].map((edge) => [edge.id, edge.weight]),
          ),
        };
      }),
    [history, referenceGraph, source, target],
  );
  const chartRouteEdgeIds = useMemo(() => {
    const ids = new Set(simulationView.paths.current.edgeIds);
    for (const point of history) {
      const snapshot = new WeightedGraph(point.graph);
      const view = buildSimulationView(snapshot, referenceGraph, source, target);
      for (const id of view.paths.current.edgeIds) ids.add(id);
    }
    return [...ids].sort();
  }, [history, referenceGraph, simulationView.paths.current.edgeIds, source, target]);
  const routeEdgeIds = simulationView.paths.current.edgeIds;
  const highlightPath = simulationView.paths.current.path;
  const baselineEdgeIds = simulationView.paths.baseline.edgeIds;
  const performancePercent = metrics.performance * 100;
  const strengthenedEdges = allEdges.filter(
    (edge) => edge.weight > edge.initialWeight + 1e-9,
  ).length;
  const adaptAllowed =
    canAdapt(workflowStep, graph, referenceGraph, source, target, iteration, MAX_ITERATIONS) &&
    !busy;
  const plasticityStartAllowed = !isRunning && damaged && workflowStep !== WORKFLOW.baseline;
  const analysisAllowed = canAnalyse(workflowStep, graph, busy);
  const damageAllowed = canApplyDamage(workflowStep, busy);
  const restoreAllowed = canRestore(workflowStep, busy);
  const networkConfigAllowed = canConfigureNetwork(workflowStep, busy);
  const evaluateAllowed = canEvaluate(workflowStep, busy);
  const guidance = getWorkflowGuidance(workflowStep, {
    reachable: metrics.reachable,
    alternativeOk: analysisReport?.alternativeOk ?? false,
    damaged,
    iteration,
    maxIterations: MAX_ITERATIONS,
  });
  const experienceStage = resolveExperienceStage({
    workflowStep,
    damaged,
    isRunning,
    isPaused,
    iteration,
  });
  const damageCounts = countDamage(graph);
  const simulationStatus = isRunning
    ? isPaused
      ? "Paused"
      : `Adapting · iteration ${iteration}/${MAX_ITERATIONS}`
    : workflowStep === WORKFLOW.evaluated
      ? "Adaptation complete"
      : damaged
        ? "Damage applied · ready to simulate"
        : "Baseline network";
  const analyseAndSimulate = () => simulateNeuroplasticity();
  const primaryDamageMode = () => {
    if (busy) return;
    setDamageMode(true);
    setNotice("Click a connection or region on the graph, set severity, then apply damage.");
  };
  const cancelDamageMode = () => {
    setDamageMode(false);
    setNotice("");
  };

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
            {isRunning
              ? isPaused
                ? "PAUSED"
                : "PLASTICITY RUN"
              : workflowStep === WORKFLOW.adapting
                ? "ADAPTING"
                : "IDLE"}
          </div>
          <span className="state-chip experience-chip">{EXPERIENCE_LABEL[experienceStage]}</span>
          <span className="state-chip state-chip-technical" title="Internal workflow state">
            {phase}
          </span>
          <Button size="sm" variant="outline" onClick={reset} aria-label="Reset simulation">
            <RotateCcw size={14} /> RESET SIMULATION
          </Button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="left-rail">
          <section className="mission-control" aria-live="polite">
            <span className="mission-stage">{EXPERIENCE_LABEL[experienceStage]}</span>
            <strong className="mission-title">{guidance.title}</strong>
            <p className="mission-detail">{guidance.detail}</p>
            <dl className="mission-stats">
              <div>
                <dt>Damaged</dt>
                <dd>
                  {damageCounts.damagedNodes} nodes · {damageCounts.damagedEdges} connections
                </dd>
              </div>
              <div>
                <dt>Active route</dt>
                <dd>
                  {metrics.current.reachable ? metrics.current.path.join(" → ") : "—"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{simulationStatus}</dd>
              </div>
            </dl>
            <div className="mission-primary">
              {experienceStage === EXPERIENCE_STAGE.baseline && (
                <Button
                  variant="warning"
                  className="action-button mission-cta"
                  onClick={primaryDamageMode}
                  disabled={busy}
                >
                  <ShieldAlert size={14} /> SELECT DAMAGE
                </Button>
              )}
              {experienceStage === EXPERIENCE_STAGE.selectDamage && !isRunning && (
                <Button
                  variant="primary"
                  className="action-button mission-cta"
                  onClick={analyseAndSimulate}
                  disabled={busy || !damaged}
                >
                  <Activity size={14} /> ANALYSE &amp; SIMULATE
                </Button>
              )}
              {experienceStage === EXPERIENCE_STAGE.simulate && isRunning && (
                <Button
                  variant="primary"
                  className="action-button mission-cta"
                  onClick={togglePlasticityPause}
                  aria-label={isPaused ? "Resume plasticity simulation" : "Pause plasticity simulation"}
                >
                  {isPaused ? (
                    <>
                      <CirclePlay size={13} /> RESUME
                    </>
                  ) : (
                    "PAUSE"
                  )}
                </Button>
              )}
              {experienceStage === EXPERIENCE_STAGE.result && (
                <Button
                  variant="primary"
                  className="action-button mission-cta"
                  onClick={evaluateResults}
                  disabled={!evaluateAllowed}
                >
                  <ScanEye size={14} /> COMPARE RESULTS
                </Button>
              )}
            </div>
            <p className="mission-legend-copy">
              Green connections are alternative pathways strengthened by the simulation. Thickness and
              colour intensity reflect modelled edge weights (synthetic model, not biological recovery).
            </p>
          </section>
          <section className="control-section">
            <SectionTitle icon={<GitBranch size={14} />} title="NETWORK" index="01" />
            <Field label="SOURCE NODE">
              <select
                value={source}
                disabled={busy || !networkConfigAllowed}
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
                disabled={busy || !networkConfigAllowed}
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
            <div className="range-row">
              <label htmlFor="network-size">NETWORK SIZE</label>
              <output htmlFor="network-size" className="range-value">
                {networkSize}
              </output>
            </div>
            <input
              id="network-size"
              className="range-control"
              type="range"
              min={MIN_NETWORK_NODES}
              max={MAX_NETWORK_NODES}
              step="1"
              value={networkSize}
              disabled={busy || !networkConfigAllowed}
              onChange={(event) => {
                const size = Number(event.target.value);
                if (size === networkSize) return;
                const pristine = createPristineNetwork(size);
                hydrateNetwork(
                  size,
                  `${size} nodes · ${pristine.edges.size} weighted connections · regenerated dataset`,
                );
              }}
            />
            <div className="button-stack">
              <Button variant="outline" className="action-button" onClick={reset}>
                <RotateCcw size={14} /> LOAD / RESET BASELINE
              </Button>
              <Button
                variant="warning"
                className="action-button"
                onClick={traumaPreset}
                disabled={busy || !hasTraumaPreset || !damageAllowed}
              >
                <ShieldAlert size={14} /> SIMULATE TRAUMA: B-C
              </Button>
            </div>
          </section>

          <section className={`control-section ${damageMode ? "damage-mode-active" : ""}`}>
            <SectionTitle icon={<ShieldAlert size={14} />} title="DAMAGE / RESTORE" index="02" />
            {damageMode && (
              <p className="section-help damage-mode-banner">
                Selection mode — click the graph, adjust severity, then damage the selected component.
              </p>
            )}
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
                onClick={() => {
                  applyDamage();
                  setDamageMode(false);
                }}
                disabled={busy || !damageAllowed}
              >
                <ShieldAlert size={14} /> DAMAGE SELECTED
              </Button>
              <Button
                variant="outline"
                className="action-button"
                onClick={cancelDamageMode}
                disabled={busy}
              >
                CANCEL
              </Button>
              <Button
                variant="outline"
                className="action-button"
                onClick={restoreSelected}
                disabled={busy || !restoreAllowed}
              >
                <RotateCcw size={14} /> RESTORE SELECTED
              </Button>
            </div>
          </section>

          <details className="control-section advanced-simulation">
            <summary>
              <SectionTitle
                as="span"
                icon={<ScanEye size={14} />}
                title="ADVANCED SIMULATION"
                index="03"
              />
            </summary>
            <p className="section-help">
              Technical routing survey (Dijkstra, BFS, bounded DFS). The primary{" "}
              <strong>ANALYSE &amp; SIMULATE</strong> action runs this automatically.
            </p>
            <Button
              variant="outline"
              className="action-button"
              onClick={analyseNetwork}
              disabled={!analysisAllowed}
            >
              <ScanEye size={14} /> ANALYSE NETWORK
            </Button>
            {analysisReport && (
              <DisruptionAnalysisReport report={analysisReport} source={source} target={target} />
            )}
            <div className="plasticity-section-inner">
            <SectionTitle icon={<Activity size={14} />} title="PLASTICITY" index="04" />
            <RangeControl
              id="learning-rate"
              label="LEARNING RATE"
              value={learningRate}
              onChange={setLearningRate}
              max={0.5}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
              disabled={!adaptAllowed && !isRunning}
            />
            <RangeControl
              id="decay-rate"
              label="DECAY RATE"
              value={decayRate}
              onChange={setDecayRate}
              max={0.2}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
              disabled={!adaptAllowed && !isRunning}
            />
            {damaged && (
              <p className="section-help plasticity-policy">
                Plasticity requires a qualifying alternative pathway. Partial damage that leaves the
                same selected pathway intact may increase its traversal cost without triggering
                adaptation. Synthetic computational model only — not biological recovery.
              </p>
            )}
            {!adaptAllowed && workflowStep === WORKFLOW.analysed && (
              <p className="section-help damage-tone">
                {analysisReport?.disconnected
                  ? "Adaptation blocked: target unreachable."
                  : "Adaptation blocked: no qualifying alternative pathway under the current rules."}
              </p>
            )}
            <div className="iteration-label">
              <span>ITERATION</span>
              <strong>
                {String(iteration).padStart(2, "0")} <small>/ {MAX_ITERATIONS}</small>
              </strong>
            </div>
            <p className="section-help">
              Synthetic activity-dependent plasticity on the live minimum-cost pathway (not
              biological recovery).
            </p>
            <div className="iteration-buttons plasticity-actions">
              <Button
                className="action-button"
                variant="primary"
                onClick={simulateNeuroplasticity}
                disabled={!plasticityStartAllowed}
              >
                <Activity size={14} /> SIMULATE NEUROPLASTICITY
              </Button>
              {!isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={togglePlasticityPause}
                disabled={!isRunning}
              >
                {isPaused ? (
                  <>
                    <CirclePlay size={13} /> RESUME
                  </>
                ) : (
                  "PAUSE"
                )}
              </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={resetAdaptation}
                disabled={!adaptationCheckpoint || (isRunning && !isPaused)}
                aria-label="Reset adaptation"
              >
                <RotateCcw size={14} /> RESET ADAPTATION
              </Button>
            </div>
            <p className="section-help iteration-limit-note">
              Progress counts adaptation iterations ({iteration}/{MAX_ITERATIONS}). Stopping at the limit
              is not the same as biological convergence.
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={MAX_ITERATIONS}
              aria-valuenow={iteration}
              aria-label={`Adaptation progress ${iteration} of ${MAX_ITERATIONS} iterations`}
            >
              <span style={{ width: `${(iteration / MAX_ITERATIONS) * 100}%` }} />
            </div>
            </div>
          </details>
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
              selected={selected}
              onSelect={onSelect}
              layoutKey={networkSize}
              currentEdgeIds={
                workflowStep === WORKFLOW.adapting ||
                workflowStep === WORKFLOW.evaluated ||
                isRunning
                  ? routeEdgeIds
                  : []
              }
              visualOptions={{
                workflowStep,
                iteration,
                maxIterations: MAX_ITERATIONS,
                isRunning,
              }}
            />
            <div className="graph-legend graph-legend-experience">
              <span>
                <i className="legend-swatch legend-grey" /> Grey · original connection
              </span>
              <span>
                <i className="legend-swatch legend-red" /> Red · damaged connection
              </span>
              <span>
                <i className="legend-swatch legend-green-soft" /> Light green · recruited pathway
              </span>
              <span>
                <i className="legend-swatch legend-green-strong" /> Bold green · strengthened pathway
              </span>
              <span className="legend-hint">CLICK GRAPH TO SELECT · ARROWS MOVE SELECTION</span>
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
                  value={`${selectedEdge.usageCount} · ${isEdgeVisuallyTraversable(graph, selectedEdge) ? "ACTIVE" : "DISRUPTED"}`}
                  tone={isEdgeVisuallyTraversable(graph, selectedEdge) ? "normal" : "damage"}
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

          <details
            className="results-section state-comparison"
            open={workflowStep === WORKFLOW.evaluated}
          >
            <summary>
              <SectionTitle
                as="h3"
                icon={<GitBranch size={14} />}
                title="STATE COMPARISON"
                index="08"
              />
            </summary>
            <Button
              variant="outline"
              className="action-button evaluate-button"
              onClick={evaluateResults}
              disabled={!evaluateAllowed}
            >
              <ScanEye size={14} /> COMPARE RESULTS
            </Button>
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
              <span
                className={
                  workflowStep === WORKFLOW.baseline && !damaged ? "state-done" : "state-done"
                }
              >
                S0 · BASELINE
              </span>
              <span
                className={
                  [
                    WORKFLOW.damaged,
                    WORKFLOW.analysed,
                    WORKFLOW.adapting,
                    WORKFLOW.evaluated,
                  ].includes(workflowStep) && damaged
                    ? "state-done"
                    : "state-pending"
                }
              >
                S1 · DAMAGED
              </span>
              <span
                className={
                  [WORKFLOW.analysed, WORKFLOW.adapting, WORKFLOW.evaluated].includes(workflowStep)
                    ? "state-done"
                    : "state-pending"
                }
              >
                S2 · ANALYSED
              </span>
              <span
                className={
                  workflowStep === WORKFLOW.adapting || iteration > 0
                    ? "state-done"
                    : "state-pending"
                }
              >
                S3 · ADAPTING
              </span>
              <span
                className={workflowStep === WORKFLOW.evaluated ? "state-done" : "state-pending"}
              >
                S4 · EVALUATED
              </span>
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
            <HistoryCharts history={chartHistory} edgeIds={chartRouteEdgeIds} />
          </div>
          <div className="event-panel">
            <div className="event-heading">
              <span>EVENT HISTORY</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!undoStack.length || busy}
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

function RangeControl({ id, label, value, onChange, max, step, formatter, disabled = false }) {
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
        disabled={disabled}
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

function DisruptionAnalysisReport({ report, source, target }) {
  return (
    <div className="algorithm-result analysis-report">
      <div className="result-label">
        ANALYSIS · {source} → {target}
      </div>
      <p className="result-subtext">{report.headline}</p>
      {report.disconnected ? (
        <div className="result-empty">{report.detail}</div>
      ) : (
        <>
          <div className="result-path">
            <span>{report.currentPath.join(" → ")}</span>
            <b>{Number.isFinite(report.cost) ? report.cost.toFixed(4) : "∞"}</b>
          </div>
          {report.preview && (
            <div className="result-subtext">
              PREVIEW ALT · {report.preview.path.join(" → ")} ({report.preview.kind})
            </div>
          )}
          <div className="result-subtext">
            BFS {report.bfs.reachable ? `${report.bfs.edgeCount} hops` : "unreachable"} · DFS{" "}
            {report.dfsPaths.length} simple route{report.dfsPaths.length === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}
