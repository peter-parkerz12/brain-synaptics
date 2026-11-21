import { describe, expect, it } from "vitest";
import { uncappedAxis } from "./chart-scales.js";

describe("chart scales", () => {
  it("removes the weight-chart ceiling from the path-cost axis", () => {
    const scale = uncappedAxis({ min: 0, max: 1, suggestedMax: 1, ticks: { color: "red" } });
    expect(scale).toEqual({ min: 0, ticks: { color: "red" } });
    expect(scale).not.toHaveProperty("max");
    expect(scale).not.toHaveProperty("suggestedMax");
  });
});
