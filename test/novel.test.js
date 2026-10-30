import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

test('Novel: resolves health and metadata listing novel_providers', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/health');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'operational');
  assert.ok(Array.isArray(data.novel_providers));
  assert.ok(data.novel_providers.includes('sakuranovel'));
});

test('Novel: resolves trending novels', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/trending');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.equal(data.provider, 'sakuranovel');
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
  assert.ok(data.items[0].title);
});

test('Novel: resolves latest novels with pagination', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/latest?page=1');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.equal(data.page, 1);
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
  assert.ok(data.items[0].id);
  assert.ok(data.items[0].title);
});

test('Novel: resolves novel search query', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/search?q=witch');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
});

test('Novel: resolves novel search with genre parameter', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/search?genre=harem');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.equal(data.genre, 'harem');
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
  assert.ok(data.items.some(it => (it.title || '').toLowerCase().includes('harem') || it.genres?.includes('harem')));
});

test('Novel: resolves novel genre direct route', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/genres/harem');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.equal(data.genre, 'harem');
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
});

test('Novel: resolves novel detail with chapters', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/detail/1906');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.ok(data.data.title);
  assert.ok(Array.isArray(data.data.chapters));
  assert.ok(data.data.chapters.length > 0);
});

test('Novel: resolves chapter text blocks', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/novel/sakuranovel/chapter/403012');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.ok(data.data.novel_title);
  assert.ok(Array.isArray(data.data.blocks));
  assert.ok(data.data.blocks.length > 0);
  assert.equal(data.data.blocks[0].type, 'text');
  assert.ok(data.data.blocks[0].content);
});
