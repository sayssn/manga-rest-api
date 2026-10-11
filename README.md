# DeiManga REST API (Manga & Anime)

A high-performance, lightweight REST API gateway for Indonesian Manga & Anime providers running on **Vercel Edge (Singapore - sin1)** with in-memory caching and sub-100ms response times.

## Status

| Property | Value |
| --- | --- |
| Name | DeiManga REST API |
| Platform | Vercel Edge Runtime |
| Primary Region | Singapore (`sin1`) |
| Status | Operational |
| Manga Providers | 3 (`komikindo`, `bacakomik`, `komiku`) |
| Anime Providers | 3 (`samehadaku`, `otakudesu`, `animeindo`) |
| API Format | JSON |
| Direct Streaming | Pixeldrain MP4, Filedon Cloudflare R2, Vidhide HLS |

## Base URL

```text
https://deimanga-rest-api.vercel.app
```

---

## Manga Endpoints

Replace `:provider` with `komikindo`, `bacakomik`, or `komiku`.

### Search
```http
GET /api/:provider/search?q=:query
```
Example: `/api/komikindo/search?q=solo`

### Latest Updates
```http
GET /api/:provider/latest?page=:page
```

### Manhwa & Manhua
```http
GET /api/:provider/manhwa?page=:page
GET /api/:provider/manhua?page=:page
```

### Genres & Filter
```http
GET /api/:provider/genres
GET /api/:provider/genres/:genre?page=:page
```

### Manga Detail
```http
GET /api/:provider/manga/:slug
```

### Chapters
```http
GET /api/:provider/chapters/:slug
```

### Chapter Pages (Reader)
```http
GET /api/:provider/chapter/:chapterSlug
```

### Raw Scraper Proxy Fallback
```http
GET /:provider/*
```

---

## Anime Endpoints

Replace `:provider` with `samehadaku`, `otakudesu`, or `animeindo`.

### 1. Latest Anime Updates
```http
GET /api/anime/:provider/latest?page=:page
```
Example: `/api/anime/otakudesu/latest?page=1`

Response:
```json
{
  "status": "success",
  "provider": "otakudesu",
  "page": 1,
  "total": 25,
  "items": [
    {
      "sourceId": "ao-hako-s2-sub-indo",
      "title": "Ao no Hako Season 2",
      "coverImage": "https://otakudesu.blog/wp-content/uploads/2026/10/160267.jpg",
      "latestEpisode": "Episode 2",
      "type": "TV"
    }
  ]
}
```

### 2. Anime Feed (Featured, Latest, Ongoing, Popular)
```http
GET /api/anime/:provider/feed
```
Example: `/api/anime/animeindo/feed`

### 3. Search Anime
```http
GET /api/anime/:provider/search?q=:query
```
Example: `/api/anime/otakudesu/search?q=ao+no+hako`

### 4. Anime Detail & Episode List
```http
GET /api/anime/:provider/detail/:slug
```
Example: `/api/anime/otakudesu/detail/ao-hako-s2-sub-indo`

Response:
```json
{
  "status": "success",
  "provider": "otakudesu",
  "data": {
    "sourceId": "ao-hako-s2-sub-indo",
    "provider": "otakudesu",
    "title": "Ao no Hako Season 2",
    "japaneseTitle": "アオのハコ Season2",
    "synopsis": "Second season of Ao no Hako.",
    "coverImage": "https://otakudesu.blog/wp-content/uploads/2026/10/160267.jpg",
    "status": "Ongoing",
    "type": "TV",
    "rating": 7.4,
    "genres": ["Love Polygon", "School", "Shounen", "Team Sports"],
    "episodes": [
      {
        "episodeNumber": 1,
        "episodeLabel": "Episode 1",
        "providerEpisodeUrl": "https://otakudesu.blog/episode/anh-s2-episode-1-sub-indo/"
      },
      {
        "episodeNumber": 2,
        "episodeLabel": "Episode 2",
        "providerEpisodeUrl": "https://otakudesu.blog/episode/anh-s2-episode-2-sub-indo/"
      }
    ]
  }
}
```

### 5. Episode Stream Sources
```http
GET /api/anime/:provider/episode/:slug
GET /api/anime/:provider/episode?url=:providerEpisodeUrl
```
Example: `/api/anime/otakudesu/episode?url=https%3A%2F%2Fotakudesu.blog%2Fepisode%2Fanh-s2-episode-1-sub-indo%2F`

Response:
```json
{
  "status": "success",
  "provider": "otakudesu",
  "episode": "https://otakudesu.blog/episode/anh-s2-episode-1-sub-indo/",
  "total": 4,
  "streams": [
    {
      "server": "Pixeldrain 1080P (Direct)",
      "type": "mp4",
      "url": "https://pixeldrain.com/api/file/gtDYDNpn",
      "quality": "1080p",
      "isEmbed": false,
      "headers": {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    },
    {
      "server": "Pixeldrain 720P (Direct)",
      "type": "mp4",
      "url": "https://pixeldrain.com/api/file/GvcxyGjX",
      "quality": "720p",
      "isEmbed": false,
      "headers": {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    },
    {
      "server": "Filedon 720P (Direct)",
      "type": "mp4",
      "url": "https://pub-2e9...r2.cloudflarestorage.com/...mp4",
      "quality": "720p",
      "isEmbed": false
    },
    {
      "server": "Vidhide 720P (HLS)",
      "type": "m3u8",
      "url": "https://vidhidepro.com/v/...",
      "quality": "720p",
      "isEmbed": true
    }
  ]
}
```

---

## Supported Provider Matrix

| Feature | KomikIndo | BacaKomik | Komiku | Samehadaku | Otakudesu | AnimeIndo |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Category | Manga | Manga | Manga | Anime | Anime | Anime |
| Search | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Latest Updates | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Detail & Item Info | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chapters / Episodes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reader / Streams | ✓ | ✓ | ✓ | ✓ (Direct MP4) | ✓ (Direct MP4) | ✓ (HLS / MP4) |
| Pixeldrain Unthrottled | - | - | - | ✓ | ✓ | - |

---

## Reliability & Fallback Strategy

Mobile clients and backend applications consume this API as the primary Singapore-edge gateway while preserving internal fallback scrapers in case of upstream maintenance:

```text
Client Application / Mobile App
             │
             ▼
  DeiManga REST API (Vercel Edge Singapore)
             │
     ┌───────┴───────┐
  Success          Failure
     │               │
     ▼               ▼
Return JSON     Internal Backend Scraper Fallback
```

## Deployment

Pushes to the `main` branch automatically trigger Vercel deployment:
```bash
git add .
git commit -m "feat: add anime providers (samehadaku, otakudesu, animeindo)"
git push origin main
```