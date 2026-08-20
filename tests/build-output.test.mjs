import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("build emits a deployable worker with D1 configuration", async () => {
  await access(new URL("dist/server/index.js", root));
  const hosting = JSON.parse(await readFile(new URL("dist/.openai/hosting.json", root), "utf8"));
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, null);
});

test("ships product metadata and a real social card", async () => {
  const [layout, page, image] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    stat(new URL("public/og.png", root)),
  ]);
  assert.match(layout, /Luma — Attention Atlas/);
  assert.match(layout, /process\.env\.SITE_URL/);
  assert.doesNotMatch(layout, /headers\(\)|requestHeaders|evil\.example/);
  assert.match(page, /Add focus block/);
  assert.ok(image.size > 100_000);
});
