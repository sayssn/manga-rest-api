import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/index.js';

test('E2E /api/novel/sakuranovel/latest returns status 200 with items', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/latest?page=1');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
  assert.ok(json.items[0].id);
});

test('E2E /api/novel/sakuranovel/popular returns status 200 with items', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/popular?page=1');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});

test('E2E /api/novel/sakuranovel/detail?id=1906 returns series detail and chapters', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/detail?id=1906');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.equal(json.data.id, 1906);
  assert.ok(Array.isArray(json.data.chapters));
  assert.ok(json.data.chapters.length > 0);
});

test('E2E /api/novel/sakuranovel/chapter?id=421269 returns reading blocks', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/chapter?id=421269');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.equal(json.data.id, 421269);
  assert.ok(Array.isArray(json.data.blocks));
  assert.ok(json.data.blocks.length > 0);
  assert.equal(json.data.blocks[0].type, 'text');
});
