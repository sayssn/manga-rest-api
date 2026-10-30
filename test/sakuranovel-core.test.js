import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanParagraphs, parseChapterMeta, resolveCover, fetchSakura } from '../api/sakuranovel-core.js';

test('cleanParagraphs strips HTML tags and watermarks', () => {
  const html = '<p>Volume 1 Chapter 1</p><p>Hello world.</p><p>Sakuranovel.id</p>';
  const blocks = cleanParagraphs(html);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].content, 'Volume 1 Chapter 1');
  assert.equal(blocks[1].content, 'Hello world.');
});

test('parseChapterMeta extracts chapter number and cleaned title', () => {
  const rawPost = {
    id: 403012,
    date: '2026-05-14T12:13:00',
    slug: 'the-villain-chapter-1',
    title: { rendered: 'The Villain Chapter 1 &#8211; Chapter 1 Bahasa Indonesia' },
  };
  const meta = parseChapterMeta(rawPost);
  assert.equal(meta.id, 403012);
  assert.equal(meta.chapter_number, 'Chapter 1');
  assert.equal(meta.title, 'The Villain Chapter 1 - Chapter 1 Bahasa Indonesia');
});

test('resolveCover fetches HD cover via Kitsu', async () => {
  const cover = await resolveCover('The Villain Who Invests in a Witch to Survive');
  assert.ok(cover.startsWith('http'));
  assert.ok(cover.includes('kitsu.app') || cover.includes('media'));
});

test('fetchSakura returns data from live WP REST API', async () => {
  const posts = await fetchSakura('/posts', { per_page: 1 });
  assert.ok(Array.isArray(posts));
  assert.equal(posts.length, 1);
  assert.ok(posts[0].id);
});
