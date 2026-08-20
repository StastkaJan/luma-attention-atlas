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
  await expect(page.getByLabel("PLANNING DATE")).not.toHaveValue("");
  await expect(page).toHaveTitle("Luma — Attention Atlas");
  await expect(page.getByRole("heading", { name: /Your day, with clear edges/i })).toBeVisible();
});

test.afterEach(() => expect(browserErrors).toEqual([]));

test("plans, edits, completes, focuses, persists, and deletes a block", async ({ page }, testInfo) => {
  const label = `Release plan ${testInfo.project.name} ${Date.now()}`;
  const refined = `${label} refined`;

  await page.getByRole("button", { name: "Add focus block" }).click();
  await page.getByLabel("What needs attention?").fill(label);
  await page.getByLabel("Start").fill("11:15");
  await page.getByLabel("Minutes").fill("25");
  await page.getByLabel("A useful constraint").fill("Leave one clear decision");
  await page.getByLabel("blue").check();
  await page.getByRole("button", { name: "Add to atlas" }).click();
  await expect(page.getByRole("button", { name: `Edit ${label}` })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${label}` }).click();
  await page.getByLabel("What needs attention?").fill(refined);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: `Edit ${refined}` })).toBeVisible();

  await page.getByRole("button", { name: `Mark complete: ${refined}` }).click();
  await expect(page.getByRole("button", { name: `Mark incomplete: ${refined}` })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^11:15/ }).filter({ hasText: refined }).click();
  await page.getByRole("button", { name: "Enter focus" }).click();
  await expect(page.locator(".focus-stage")).toContainText(refined);
  await expect(page.locator(".timer")).toContainText("25:00");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Leave focus" }).click();

  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: `Edit ${refined}` })).toBeVisible();
  await page.getByRole("button", { name: `Delete ${refined}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: `Edit ${refined}` })).toHaveCount(0);
});

test("date navigation, keyboard editor, and reduced motion work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const date = page.getByLabel("PLANNING DATE");
  const original = await date.inputValue();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(date).not.toHaveValue(original);

  const add = page.getByRole("button", { name: "Add focus block" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Make it count." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("keeps keyboard focus inside the editor", async ({ page }) => {
  await page.getByRole("button", { name: "Add focus block" }).click();
  await page.getByRole("button", { name: "Add to atlas" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close editor" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Add to atlas" })).toBeFocused();
});

test("rejects invalid task payloads", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one API contract check is enough");
  const response = await request.post("/api/tasks", { data: { label: "Incomplete" } });
  expect(response.status()).toBe(400);
});

test("isolates task data by authenticated user", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one authorization check is enough");
  const date = "2037-04-12";
  const alice = { "oai-authenticated-user-email": "alice@example.com" };
  const bob = { "oai-authenticated-user-email": "bob@example.com" };
  const created = await request.post("/api/tasks", {
    headers: alice,
    data: { date, time: "10:00", label: "Alice only", note: "Private", duration: 30, tone: "moss", position: 0 },
  });
  expect(created.status()).toBe(201);
  const { task } = await created.json();

  const hidden = await request.get(`/api/tasks?date=${date}`, { headers: bob });
  expect((await hidden.json()).tasks).toEqual([]);
  const blockedUpdate = await request.patch("/api/tasks", { headers: bob, data: { id: task.id, label: "Stolen" } });
  expect(blockedUpdate.status()).toBe(404);
  const blockedDelete = await request.delete(`/api/tasks?id=${task.id}`, { headers: bob });
  expect(blockedDelete.status()).toBe(404);
  const visible = await request.get(`/api/tasks?date=${date}`, { headers: alice });
  expect((await visible.json()).tasks).toContainEqual(expect.objectContaining({ id: task.id, label: "Alice only" }));

  await request.delete(`/api/tasks?id=${task.id}`, { headers: alice, data: {} });
});

test("mobile layout has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("button", { name: "Add focus block" })).toBeVisible();
});
