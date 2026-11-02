import { strict as assert } from 'node:assert';
import handler from '../api/index.js';

async function run() {
  console.log('Testing AnimeIndo Catalog Page 1...');
  const req1 = new Request('https://deimanga-rest-api.vercel.app/api/anime/animeindo/catalog?page=1');
  const res1 = await handler(req1);
  assert.equal(res1.status, 200, 'Page 1 status should be 200');
  const data1 = await res1.json();
  assert.equal(data1.status, 'success');
  assert.equal(data1.provider, 'animeindo');
  assert.ok(Array.isArray(data1.items), 'items should be an array');
  assert.ok(data1.items.length >= 10, 'should return at least 10 items');
  assert.ok(data1.items[0].title, 'first item should have title');
  assert.ok(data1.items[0].coverImage, 'first item should have coverImage');
  assert.ok(data1.items[0].coverImage.startsWith('http'), 'coverImage should be http URL');
  console.log('Page 1 items:', data1.items.length, 'First title:', data1.items[0].title, 'Cover:', data1.items[0].coverImage);

  console.log('Testing AnimeIndo Catalog Page 2...');
  const req2 = new Request('https://deimanga-rest-api.vercel.app/api/anime/animeindo/catalog?page=2');
  const res2 = await handler(req2);
  assert.equal(res2.status, 200, 'Page 2 status should be 200');
  const data2 = await res2.json();
  assert.ok(data2.items.length >= 10, 'page 2 should return at least 10 items');
  console.log('Page 2 items:', data2.items.length, 'First title:', data2.items[0].title);

  console.log('Testing Multi-provider / Default Catalog Route...');
  const reqMulti = new Request('https://deimanga-rest-api.vercel.app/api/anime/catalog?page=1');
  const resMulti = await handler(reqMulti);
  assert.equal(resMulti.status, 200, 'Multi catalog status should be 200');
  const dataMulti = await resMulti.json();
  assert.ok(dataMulti.items.length >= 10, 'multi catalog should return items');
  console.log('Multi catalog items:', dataMulti.items.length);

  console.log('Testing Otakudesu Catalog Route...');
  const reqOtaku = new Request('https://deimanga-rest-api.vercel.app/api/anime/otakudesu/catalog?page=1');
  const resOtaku = await handler(reqOtaku);
  assert.equal(resOtaku.status, 200, 'Otakudesu status should be 200');
  const dataOtaku = await resOtaku.json();
  assert.ok(dataOtaku.items.length >= 10, 'Otakudesu should return items');
  console.log('Otakudesu items:', dataOtaku.items.length, 'First title:', dataOtaku.items[0].title);

  console.log('ALL ANIME CATALOG TESTS PASSED!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
