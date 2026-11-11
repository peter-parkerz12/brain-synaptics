import { useEffect, useRef } from "react";

export function HistoryCharts({ history }) {
  const weightsCanvas = useRef(null);
  const outcomesCanvas = useRef(null);
  const charts = useRef([]);

  useEffect(() => {
    let disposed = false;
    import("chart.js/auto").then(({ default: Chart }) => {
      if (disposed || !weightsCanvas.current || !outcomesCanvas.current) return;
      const color = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const labels = history.map((point) => `${String(point.index).padStart(2, "0")} · ${point.iteration}`);
      const edgeLine = (id, variable, lineColor) => ({
        label: id,
        data: history.map((point) => point.graph.edges.find((edge) => edge.id === id)?.weight ?? null),
        borderColor: color(lineColor), backgroundColor: color(lineColor), borderWidth: 2, pointRadius: 2, tension: 0.18, spanGaps: true,
      });
      const common = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: color("--muted-foreground"), boxWidth: 10, boxHeight: 2, font: { family: "JetBrains Mono", size: 10 } } }, tooltip: { backgroundColor: color("--panel"), borderColor: color("--border"), borderWidth: 1, titleFont: { family: "JetBrains Mono" }, bodyFont: { family: "JetBrains Mono" } } }, scales: { x: { grid: { color: color("--grid") }, ticks: { color: color("--muted-foreground"), maxTicksLimit: 9, font: { family: "JetBrains Mono", size: 9 } } }, y: { min: 0, max: 1, grid: { color: color("--grid") }, ticks: { color: color("--muted-foreground"), font: { family: "JetBrains Mono", size: 9 } } } } };
      charts.current.forEach((chart) => chart.destroy());
      charts.current = [
        new Chart(weightsCanvas.current, { type: "line", data: { labels, datasets: [edgeLine("A-D", "weight", "--primary"), edgeLine("D-E", "weight", "--secondary"), edgeLine("E-F", "weight", "--warning")] }, options: common }),
        new Chart(outcomesCanvas.current, { type: "line", data: { labels, datasets: [
          { label: "Path cost", data: history.map((point) => Number.isFinite(point.cost) ? point.cost : null), borderColor: color("--secondary"), backgroundColor: color("--secondary"), borderWidth: 2, pointRadius: 2, tension: 0.18, yAxisID: "y" },
          { label: "Performance", data: history.map((point) => point.performance), borderColor: color("--primary"), backgroundColor: color("--primary"), borderWidth: 2, pointRadius: 2, tension: 0.18, yAxisID: "y1" },
        ] }, options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, min: 0 }, y1: { position: "right", min: 0, max: 1, grid: { drawOnChartArea: false }, ticks: { color: color("--muted-foreground"), font: { family: "JetBrains Mono", size: 9 } } } } } }),
      ];
    });
    return () => { disposed = true; charts.current.forEach((chart) => chart.destroy()); charts.current = []; };
  }, [history]);

  return <div className="chart-grid"><section className="chart-block"><h3 className="micro-heading">PATHWAY CONNECTION STRENGTHS</h3><div className="chart-wrap"><canvas ref={weightsCanvas} aria-label="Connection weights over simulation history" /></div></section><section className="chart-block"><h3 className="micro-heading">PATH COST / SIMULATED PERFORMANCE</h3><div className="chart-wrap"><canvas ref={outcomesCanvas} aria-label="Path cost and simulated network performance over time" /></div></section></div>;
}