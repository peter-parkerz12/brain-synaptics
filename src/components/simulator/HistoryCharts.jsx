import { useEffect, useRef } from "react";
import { readToken } from "@/lib/css-color.js";
import { ROUTE_SERIES_COLORS, uncappedAxis } from "@/components/simulator/chart-scales.js";

export function HistoryCharts({ history, edgeIds = [] }) {
  const weightsCanvas = useRef(null);
  const outcomesCanvas = useRef(null);
  const charts = useRef([]);
  const edgeIdsRef = useRef(edgeIds);
  edgeIdsRef.current = edgeIds;
  const edgeKey = edgeIds.join("|");

  useEffect(() => {
    let disposed = false;
    const activeEdgeIds = edgeIdsRef.current;
    import("chart.js/auto").then(({ default: Chart }) => {
      if (disposed || !weightsCanvas.current || !outcomesCanvas.current) return;
      const color = (name) => readToken(name);
      const labels = history.map(
        (point) => `${String(point.index).padStart(2, "0")} · ${point.iteration}`,
      );
      const tick = {
        color: color("--muted-foreground"),
        font: { family: "JetBrains Mono", size: 11 },
      };
      const grid = { color: color("--grid") };
      const weightScale = {
        min: 0,
        max: 1,
        grid,
        ticks: tick,
      };
      const common = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            labels: {
              color: color("--muted-foreground"),
              boxWidth: 10,
              boxHeight: 2,
              font: { family: "JetBrains Mono", size: 11 },
            },
          },
          tooltip: {
            backgroundColor: color("--panel") || color("--card"),
            borderColor: color("--border"),
            borderWidth: 1,
            titleFont: { family: "JetBrains Mono" },
            bodyFont: { family: "JetBrains Mono" },
          },
        },
        scales: {
          x: { grid, ticks: { ...tick, maxTicksLimit: 9 } },
          y: weightScale,
        },
      };
      const costScale = {
        ...uncappedAxis(weightScale),
        grid,
        ticks: tick,
      };
      charts.current.forEach((chart) => chart.destroy());
      charts.current = [
        new Chart(weightsCanvas.current, {
          type: "line",
          data: {
            labels,
            datasets: activeEdgeIds.map((id, index) => ({
              label: id,
              data: history.map((point) => point.edges?.[id] ?? null),
              borderColor: color(ROUTE_SERIES_COLORS[index % ROUTE_SERIES_COLORS.length]),
              backgroundColor: color(ROUTE_SERIES_COLORS[index % ROUTE_SERIES_COLORS.length]),
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.18,
              spanGaps: true,
            })),
          },
          options: common,
        }),
        new Chart(outcomesCanvas.current, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Path cost",
                data: history.map((point) => (Number.isFinite(point.cost) ? point.cost : null)),
                borderColor: color("--secondary-green"),
                backgroundColor: color("--secondary-green"),
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.18,
                yAxisID: "y",
                spanGaps: false,
              },
              {
                label: "Performance",
                data: history.map((point) => point.performance),
                borderColor: color("--primary"),
                backgroundColor: color("--primary"),
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.18,
                yAxisID: "y1",
              },
            ],
          },
          options: {
            ...common,
            scales: {
              ...common.scales,
              y: costScale,
              y1: {
                position: "right",
                min: 0,
                grid: { drawOnChartArea: false },
                ticks: tick,
              },
            },
          },
        }),
      ];
    });
    return () => {
      disposed = true;
      charts.current.forEach((chart) => chart.destroy());
      charts.current = [];
    };
  }, [history, edgeKey]);

  return (
    <div className="chart-grid">
      <section className="chart-block">
        <h3 className="micro-heading">ACTIVE ROUTE CONNECTION STRENGTHS</h3>
        <div className="chart-wrap">
          <canvas
            ref={weightsCanvas}
            aria-label="Connection weights on the current minimum-cost path"
          />
        </div>
        {edgeIds.length === 0 && <p className="chart-empty">No connections on this path.</p>}
      </section>
      <section className="chart-block">
        <h3 className="micro-heading">PATH COST / SIMULATED PERFORMANCE</h3>
        <div className="chart-wrap">
          <canvas
            ref={outcomesCanvas}
            aria-label="Path cost and simulated network performance over time"
          />
        </div>
      </section>
      <details className="chart-table">
        <summary>Chart values</summary>
        <div className="chart-table-scroll">
          <table>
            <caption>Simulation history for the selected source and target</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Iteration</th>
                {edgeIds.map((id) => (
                  <th scope="col" key={id}>
                    {id}
                  </th>
                ))}
                <th scope="col">Path cost</th>
                <th scope="col">Performance</th>
              </tr>
            </thead>
            <tbody>
              {history.map((point) => (
                <tr key={`${point.index}-${point.iteration}`}>
                  <th scope="row">{String(point.index).padStart(2, "0")}</th>
                  <td>{String(point.iteration).padStart(2, "0")}</td>
                  {edgeIds.map((id) => (
                    <td key={id}>
                      {Number.isFinite(point.edges?.[id]) ? point.edges[id].toFixed(3) : "—"}
                    </td>
                  ))}
                  <td>{Number.isFinite(point.cost) ? point.cost.toFixed(4) : "—"}</td>
                  <td>{point.performance.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
