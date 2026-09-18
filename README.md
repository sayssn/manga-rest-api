# Indonesian Manga REST API

A lightweight REST API gateway for Indonesian manga providers.

## Status

| Property | Value |
| --- | --- |
| Name | Indonesian Manga REST API |
| Platform | Vercel |
| Primary Region | Singapore |
| Status | Operational |
| Providers | 3 |
| API Format | JSON |
| Timestamp | 2026-09-18 |

## Providers

- **KomikIndo**
- **BacaKomik**
- **Komiku**

## Base URL

```text
https://deimanga-rest-api.vercel.app
```

## API Endpoints

Replace `:provider` with `komikindo`, `bacakomik`, or `komiku`.

### Search

```http
GET /api/:provider/search?q=:query
```

Example:

```text
/api/komikindo/search?q=naruto
```

### Latest Updates

```http
GET /api/:provider/latest?page=:page
```

### Manhwa

```http
GET /api/:provider/manhwa?page=:page
```

### Manhua

```http
GET /api/:provider/manhua?page=:page
```

### Genres

```http
GET /api/:provider/genres
```

### Manga by Genre

```http
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

### Chapter Detail

```http
GET /api/:provider/chapter/:chapterSlug
```

### Raw Proxy

```http
GET /:provider/*
```

Supported providers:

```text
komikindo
bacakomik
komiku
```

The raw proxy is intended for provider access and compatibility with existing scraper implementations. For normal application integration, prefer the JSON API under `/api/:provider/*`.

## Response Format

REST endpoints return JSON.

Example:

```json
{
  "data": [
    {
      "title": "Naruto",
      "slug": "naruto",
      "cover": "https://example.com/cover.jpg",
      "type": "manga"
    }
  ]
}
```

Exact fields may vary by provider and endpoint.

## Architecture

```text
Client Application / Frontend
             |
             v
   Application Backend
             |
             v
  Manga REST API (Vercel)
             |
      +------+------+
      |      |      |
      v      v      v
 KomikIndo BacaKomik Komiku
```

The service acts as a provider gateway so downstream backends or client applications do not need to perform heavy scraping for every request.

## Reliability

Backends consuming this service can use this REST API as a primary provider while retaining a local provider scraper as a fallback.

```text
Vercel REST API
      |
   success
      |
      v
  Return JSON

      |
    error
      v
Fallback / Internal scraper
```

## Supported Provider Matrix

| Feature | KomikIndo | BacaKomik | Komiku |
| --- | :---: | :---: | :---: |
| Search | ✓ | ✓ | ✓ |
| Latest | ✓ | ✓ | ✓ |
| Manhwa | ✓ | ✓ | ✓ |
| Manhua | ✓ | ✓ | ✓ |
| Genres | ✓ | ✓ | ✓ |
| Genre Manga | ✓ | ✓ | ✓ |
| Manga Detail | ✓ | ✓ | ✓ |
| Chapters | ✓ | ✓ | ✓ |
| Chapter Detail | ✓ | ✓ | ✓ |
| Raw Proxy | ✓ | ✓ | ✓ |

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Deployment

Production:

```text
https://deimanga-rest-api.vercel.app
```

The service is deployed on Vercel and provides a lightweight regional gateway for Indonesian manga providers.

## Intended Usage

This API is designed to:

1. isolate provider scraping from the main application backend
2. reduce resource consumption and scraping overhead on primary application services
3. normalize multiple provider responses into clean, consistent JSON
4. provide a unified endpoint structure across different sources
5. facilitate flexible fallback strategies for manga reader apps and web frontends

## Disclaimer

This project is an unofficial API gateway and is not affiliated with or endorsed by KomikIndo, BacaKomik, or Komiku.

Provider availability and response behavior may change if upstream websites modify their infrastructure or access policies.