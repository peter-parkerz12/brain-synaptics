import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Simulator } from "./Simulator.jsx";
import { NO_ALTERNATIVE_PLASTICITY_MESSAGE } from "@/simulation/plasticity-simulation.js";
import { WeightedGraph, applyNodeDamage, dijkstra } from "@/simulation/graph.js";

vi.mock("cytoscape", () => {
  const emptyCollection = { forEach() {}, length: 0 };
  return {
    default: () => ({
      on() {
        return this;
      },
      destroy() {},
      batch(callback) {
        callback();
      },
      elements() {
        return { stop() {}, forEach() {}, length: 0 };
      },
      nodes: () => emptyCollection,
      edges: () => emptyCollection,
      getElementById() {
        return {
          empty: () => true,
          classes() {},
          data() {},
          position() {},
        };
      },
      add() {},
      resize() {},
      fit() {},
      scratch() {},
    }),
  };
});

vi.mock("chart.js/auto", () => ({
  default: class Chart {
    destroy() {}
  },
}));

function runTraumaAnalyseAdapt() {
  fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
  fireEvent.click(screen.getByRole("button", { name: /ANALYSE NETWORK/i }));
}

describe("simulator controls", () => {
  beforeEach(() => {
    render(<Simulator />);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("compares the selected endpoints with their own baseline", () => {
    fireEvent.change(screen.getByLabelText("Target node"), { target: { value: "M" } });
    const baseline = screen.getByText(/BASELINE SHORTEST PATH/);
    expect(baseline).toHaveTextContent("A → M");
    expect(baseline.parentElement).toHaveTextContent("3.3333");
    expect(baseline.parentElement?.querySelector(".path-string")).toHaveTextContent("AM");
    expect(baseline.parentElement?.querySelector(".path-string")).not.toHaveTextContent("C");
    expect(screen.getByRole("columnheader", { name: "A-M" })).toBeInTheDocument();
  });

  it("styles the primary and warning actions", () => {
    expect(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i })).toHaveClass(
      "bg-primary",
    );
    expect(screen.getByRole("button", { name: /SIMULATE TRAUMA/i })).toHaveClass("bg-warning");
  });

  it("rejects 0% damage without changing the inspected node", () => {
    fireEvent.change(screen.getByLabelText("SEVERITY"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /DAMAGE SELECTED/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/greater than 0%/i);
    expect(screen.getByText("1.00", { selector: "strong" })).toBeInTheDocument();
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S0 · BASELINE");
  });

  it("keeps selection, damage target, and inspector on the same element", () => {
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
    expect(screen.getByText("NODE · B")).toBeInTheDocument();
    expect(screen.getByLabelText("Select element to damage")).toHaveValue("B");
  });

  it("blocks plasticity until disruption analysis is complete", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S1 · DAMAGED");
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S3 · ADAPTING");
  });

  it("shows partial node damage cost and withholds plasticity without a reroute", () => {
    fireEvent.change(screen.getByLabelText("Select element to damage"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("button", { name: /DAMAGE SELECTED/i }));
    const expected = (() => {
      const graph = WeightedGraph.baseline();
      applyNodeDamage(graph, "C", 40);
      return dijkstra(graph, "A", "F").cost.toFixed(4);
    })();
    expect(screen.getByText(/CURRENT COST/).parentElement).toHaveTextContent(expected);
    fireEvent.click(screen.getByRole("button", { name: /ANALYSE NETWORK/i }));
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S2 · ANALYSED");
  });

  it("runs plasticity ticks after simulate neuroplasticity", async () => {
    vi.useFakeTimers();
    runTraumaAnalyseAdapt();
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S3 · ADAPTING");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(290);
    });
    expect(screen.getByRole("progressbar", { name: /Adaptation progress/i })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
  });

  it("advances to adapting and returns to damaged after further damage", async () => {
    vi.useFakeTimers();
    runTraumaAnalyseAdapt();
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(290);
    });
    fireEvent.click(screen.getByRole("button", { name: /Pause plasticity simulation/i }));
    fireEvent.change(screen.getByLabelText("Select element to damage"), { target: { value: "E-F" } });
    fireEvent.click(screen.getByRole("button", { name: /DAMAGE SELECTED/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S1 · DAMAGED");
  });

  it("surveys routing after trauma preset without skipping the analysis step", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    expect(document.querySelector(".state-chip-technical")).toHaveTextContent("S1 · DAMAGED");
    expect(screen.getByRole("button", { name: /ANALYSE NETWORK/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /ANALYSE NETWORK/i }));
    expect(screen.getByRole("columnheader", { name: "A-D" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "D-E" })).toBeInTheDocument();
  });

  it("records a single trauma preset event before analysis", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    const titles = screen.getAllByText(/PRESET · B-C DISRUPTED/);
    expect(titles).toHaveLength(1);
  });

  it("locks network size after damage until reset", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    expect(screen.getByLabelText("NETWORK SIZE")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Reset simulation/i }));
    expect(screen.getByLabelText("NETWORK SIZE")).not.toBeDisabled();
  });

  it("hides RUN ANYWAY when a qualifying alternative exists even after analysis", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    fireEvent.click(screen.getByRole("button", { name: /ANALYSE NETWORK/i }));
    expect(
      screen.queryByRole("button", { name: /^RUN ANYWAY$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows RUN ANYWAY only after plasticity prep reports no qualifying alternative", () => {
    fireEvent.change(screen.getByLabelText("Select element to damage"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("button", { name: /DAMAGE SELECTED/i }));
    fireEvent.click(screen.getByRole("button", { name: /ANALYSE NETWORK/i }));
    expect(
      screen.queryByRole("button", { name: /^RUN ANYWAY$/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(NO_ALTERNATIVE_PLASTICITY_MESSAGE);
    expect(screen.getAllByRole("button", { name: /^RUN ANYWAY$/i }).length).toBeGreaterThan(0);
  });
});