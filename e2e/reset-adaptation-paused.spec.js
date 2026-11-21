import { expect, test } from "@playwright/test";

async function waitForEdgeDamageOptions(page) {
  const targetSelect = page.getByLabel("Select element to damage");
  await expect
    .poll(async () => {
      const options = await targetSelect.locator("option").allTextContents();
      return options.some((label) => label.startsWith("A-B"));
    })
    .toBe(true);
  return targetSelect;
}

async function prepareDamagedAlternative(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const trauma = page.getByRole("button", { name: /SIMULATE TRAUMA: B-C/i });
  await expect(trauma).toBeEnabled();
  await trauma.click();
  await expect(page.locator(".state-chip-technical")).toHaveText("S1 · DAMAGED");
  await page.locator("details.advanced-simulation").evaluate((el) => el.setAttribute("open", ""));
  await page.getByRole("button", { name: /ANALYSE NETWORK/i }).click();
  await expect(page.locator(".state-chip-technical")).toHaveText("S2 · ANALYSED", {
    timeout: 15_000,
  });
}

async function readEdgeWeight(page, edgeId) {
  await page.getByLabel("Damage element type").selectOption("edge");
  const targetSelect = await waitForEdgeDamageOptions(page);
  await targetSelect.selectOption(edgeId);
  const inspector = page.locator(".inspector-value").filter({ hasText: "CURRENT WEIGHT" });
  await expect(inspector).toBeVisible();
  const value = await inspector.locator("strong").textContent();
  return Number.parseFloat(value ?? "NaN");
}

test.describe("reset adaptation while paused", () => {
  test.describe.configure({ mode: "serial" });

  test("restores checkpoint after pause and stops further ticks", async ({ page }) => {
    test.setTimeout(90_000);
    await prepareDamagedAlternative(page);

    const weightBefore = await readEdgeWeight(page, "A-D");
    expect(weightBefore).toBeCloseTo(0.3, 2);

    await page.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }).click();
    await expect(page.getByText("PLASTICITY RUN")).toBeVisible();
    await expect(page.locator(".state-chip-technical")).toHaveText("S3 · ADAPTING");

    const progress = page.getByRole("progressbar", { name: /Adaptation progress/i });
    const pause = page.getByRole("button", { name: /Pause plasticity simulation/i });
    await expect(progress).toHaveAttribute("aria-valuenow", "1", { timeout: 20_000 });
    await expect(pause).toBeEnabled({ timeout: 2000 });
    await pause.click();

    const weightAdapted = await readEdgeWeight(page, "A-D");
    expect(weightAdapted).toBeGreaterThan(weightBefore);
    await expect(page.getByRole("button", { name: /RESET ADAPTATION/i })).toBeEnabled();

    await page.getByRole("button", { name: /RESET ADAPTATION/i }).click();
    await expect(page.locator(".state-chip-technical")).toHaveText("S2 · ANALYSED");
    await expect(page.getByText("PLASTICITY RUN")).not.toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuenow", "0");

    const weightAfterReset = await readEdgeWeight(page, "A-D");
    expect(weightAfterReset).toBeCloseTo(weightBefore, 2);

    await page.waitForTimeout(700);
    expect(await readEdgeWeight(page, "A-D")).toBeCloseTo(weightAfterReset, 3);
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
  });

  test("keeps reset disabled during an unpaused plasticity run", async ({ page }) => {
    test.setTimeout(60_000);
    await prepareDamagedAlternative(page);
    await page.getByRole("button", { name: /SIMULATE NEUROPLASTICITY/i }).click();
    await expect(page.getByText("PLASTICITY RUN")).toBeVisible();
    await expect(page.getByRole("button", { name: /RESET ADAPTATION/i })).toBeDisabled();
  });
});