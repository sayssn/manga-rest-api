import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SakuraNovel } from '../api/sakuranovel-provider.js';

test('getPopular returns top series with total_chapters and covers', async () => {
  const items = await SakuraNovel.getPopular(1);
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
  assert.ok(items[0].id);
  assert.ok(items[0].title);
  assert.ok(items[0].total_chapters > 0);
});

test('getLatest returns novel items from SakuraNovel WP API', async () => {
  const items = await SakuraNovel.getLatest(1);
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
  assert.ok(items[0].id);
  assert.ok(items[0].title);
});

test('getDetail returns series with chapters and synopsis', async () => {
  const detail = await SakuraNovel.getDetail(1906);
  assert.equal(detail.id, 1906);
  assert.ok(detail.title.includes('Villain'));
  assert.ok(Array.isArray(detail.chapters));
  assert.ok(detail.chapters.length > 0);
  assert.ok(detail.chapters[0].chapter_number);
});

test('getChapter returns paragraph blocks', async () => {
  const chapter = await SakuraNovel.getChapter(421269);
  assert.equal(chapter.id, 421269);
  assert.ok(Array.isArray(chapter.blocks));
  assert.ok(chapter.blocks.length > 0);
  assert.equal(chapter.blocks[0].type, 'text');
});
