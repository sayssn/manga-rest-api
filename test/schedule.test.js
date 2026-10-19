import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Schedule endpoint returns weekly release schedule", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/schedule");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.schedule);
  assert.ok(Array.isArray(data.schedule.senin));
  assert.ok(Array.isArray(data.schedule.minggu));
  assert.ok(typeof data.total === "number");
  assert.ok(data.total > 0);
});
