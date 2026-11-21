import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Simulator } from "./Simulator.jsx";
import { WeightedGraph, applyNodeDamage, dijkstra } from "@/simulation/graph.js";

vi.mock("cytoscape", () => ({
  default: () => ({
    on() {
      return this;
    },
    destroy() {},
    batch(callback) {
      callback();
    },
    getElementById() {
      return { empty: () => true, classes() {}, data() {} };
    },
    add() {},
    resize() {},
    fit() {},
    scratch() {},
  }),
}));

vi.mock("chart.js/auto", () => ({
  default: class Chart {
    destroy() {}
  },
}));

describe("simulator controls", () => {
  beforeEach(() => {
    render(<Simulator />);
  });

  afterEach(() => cleanup());

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
    expect(screen.getByRole("button", { name: /RUN ALL/i })).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: /SIMULATE TRAUMA/i })).toHaveClass("bg-warning");
  });

  it("rejects 0% damage without changing the inspected node", () => {
    fireEvent.change(screen.getByLabelText("SEVERITY"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /APPLY DAMAGE/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/greater than 0%/i);
    expect(screen.getByText("1.00", { selector: "strong" })).toBeInTheDocument();
    expect(document.querySelector(".state-chip")).toHaveTextContent("S0 · BASELINE");
  });

  it("keeps selection, damage target, and inspector on the same element", () => {
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
    expect(screen.getByText("NODE · B")).toBeInTheDocument();
    expect(screen.getByLabelText("Select element to damage")).toHaveValue("B");
  });

  it("shows partial node damage in the current path cost and returns to damage after adaptation", () => {
    fireEvent.change(screen.getByLabelText("Select element to damage"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("button", { name: /APPLY DAMAGE/i }));
    const expected = (() => {
      const graph = WeightedGraph.baseline();
      applyNodeDamage(graph, "C", 40);
      return dijkstra(graph, "A", "F").cost.toFixed(4);
    })();
    expect(screen.getByText(/CURRENT COST/).parentElement).toHaveTextContent(expected);
    expect(document.querySelector(".state-chip")).toHaveTextContent("S1 · AFTER DAMAGE");
    fireEvent.click(screen.getByRole("button", { name: "+ 1" }));
    expect(document.querySelector(".state-chip")).toHaveTextContent("S3 · AFTER ADAPTATION");
    fireEvent.click(screen.getByRole("button", { name: /APPLY DAMAGE/i }));
    expect(document.querySelector(".state-chip")).toHaveTextContent("S1 · AFTER DAMAGE");
  });

  it("does not mutate edge usage when Dijkstra is used as a query", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    fireEvent.click(screen.getByRole("button", { name: "DIJKSTRA" }));
    fireEvent.change(screen.getByLabelText("Select element to damage"), {
      target: { value: "E-F" },
    });
    expect(screen.getByText("0 · ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A-D" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "D-E" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "B-C" })).not.toBeInTheDocument();
  });

  it("records distinct trauma events", () => {
    fireEvent.click(screen.getByRole("button", { name: /SIMULATE TRAUMA/i }));
    const titles = screen.getAllByText(/PRESET · B-C DISRUPTED|BFS \+ DIJKSTRA · EXECUTED/);
    expect(titles).toHaveLength(2);
    const rows = document.querySelectorAll(".event-row");
    const ids = [...rows].map((row) => row.getAttribute("data-event-id"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
