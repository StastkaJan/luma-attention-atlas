import { expect, test } from "@playwright/test";

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(page).toHaveTitle("Luma — Attention Atlas");
  await expect(page.getByRole("heading", { name: /Make room for what matters/i })).toBeVisible();
});

test.afterEach(() => expect(browserErrors).toEqual([]));

test("energy, task selection, completion, and focus mode stay in sync", async ({ page }) => {
  await page.getByRole("button", { name: "Deep" }).click();
  await expect(page.getByRole("button", { name: "Deep" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dial-core")).toContainText("DEEP ENERGY");
  await page.getByRole("button", { name: /^13:30 Walk \+ field notes/ }).click();
  await expect(page.locator(".dial-core")).toContainText("Walk + field notes");
  await page.getByRole("button", { name: "Mark complete: Walk + field notes" }).click();
  await expect(page.getByText("DAY LEDGER / 01 OF 04")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark incomplete: Walk + field notes" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Enter focus" }).click();
  await expect(page.getByRole("button", { name: "Leave focus" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".focus-stage")).toContainText("No headphones · 30 min");
});

test("keyboard controls and reduced motion preserve the experience", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const focusButton = page.getByRole("button", { name: "Enter focus" });
  await focusButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Leave focus" })).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("button", { name: "Enter focus" })).toBeVisible();
});
