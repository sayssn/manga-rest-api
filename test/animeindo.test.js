import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

test('AnimeIndoAnime: resolves detail for slug with -s2 abbreviation (ao-ashi-s2)', async () => {
  const req = new Request('https://deimanga-rest-api.vercel.app/api/anime/animeindo/detail/ao-ashi-s2');
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'success');
  assert.ok(data.data.episodes.length > 0, 'Expected episodes to be found for ao-ashi-s2');
});
