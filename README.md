# Yelp Business Page Scraper

An Apify Actor that scrapes individual Yelp business pages and extracts a rich structured JSON payload (address, coordinates, hours, categories, amenities, services, media, search stats) by decoding the embedded Apollo GraphQL state. Uses [Scrape.do](https://scrape.do) as a proxy.

## Prerequisites

- An [Apify](https://apify.com) account
- A [Scrape.do](https://scrape.do) API key

## Installation

### Option 1: Deploy via ZIP URL

1. Go to [Apify Console](https://console.apify.com)
2. Go to **My Actors**. In the top right of the My Actors page, click **Develop new**
3. Click **Browse all templates** and select **Empty JavaScript Project**
4. Name your Actor
5. Go to the **Code** tab, under **Source**
6. Change **Source type** to **Zip file**
7. Paste this URL in the **Zip file URL** input:
   ```
   https://github.com/edsmkt/yelp-biz-scraper/archive/refs/heads/main.zip
   ```
8. Click **Save** and then **Build**

### Option 2: Deploy from GitHub

1. Go to [Apify Console](https://console.apify.com) and create a new Actor
2. In the **Source** tab, select **Git repository**
3. Paste this repo URL: `https://github.com/edsmkt/yelp-biz-scraper.git`
4. Click **Build** to build the Actor

### Option 3: Deploy via Apify CLI

```bash
git clone https://github.com/edsmkt/yelp-biz-scraper.git
cd yelp-biz-scraper
npm install
apify login
apify push
```

## Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bizUrls` | string[] | Yes | List of Yelp business page URLs |
| `scrapeDoApiKey` | string | Yes | Your Scrape.do API token |
| `geoCode` | string | No | Scrape.do geoCode (e.g. `"us"`). Default: `"us"` |
| `delayBetweenRequestsMs` | integer | No | Pause between requests. Default: `1500` |

### Example Input (Apify UI or JSON)

```json
{
  "bizUrls": [
    "https://www.yelp.com/biz/warm-stone-spa-playa-del-rey",
    "https://www.yelp.com/biz/rejuv-head-spa-calabasas-4"
  ],
  "scrapeDoApiKey": "your-scrape-do-api-key",
  "geoCode": "us",
  "delayBetweenRequestsMs": 1500
}
```

### How to get a Yelp business URL

1. Go to [yelp.com](https://www.yelp.com) and search for a business
2. Click into the business detail page
3. Copy the URL from your browser's address bar — it should look like `https://www.yelp.com/biz/{alias}`

## Output

The Actor pushes one record per business URL to the default dataset.

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Input Yelp biz URL |
| `alias` | string | Yelp business alias (URL slug) |
| `businessId` | string | Yelp internal business encid |
| `name` | string | Business name |
| `about` | string | Specialties / about blurb |
| `rating` | number | Star rating (1-5) |
| `reviewCount` | number | Total number of reviews |
| `priceRange` | string | Price range (e.g. `$$`) |
| `isClosed` | boolean | Permanently closed flag |
| `isClaimed` | boolean | Whether the business is claimed |
| `isClaimable` | boolean | Whether claim is still available |
| `isYelpAdvertiser` | boolean | Whether the business runs Yelp ads |
| `yearEstablished` | number | Year the business was established (if set) |
| `categories` | object[] | `[{ title, alias }]` — primary Yelp categories |
| `address` | object | `{ addressLine1, addressLine2, addressLine3, city, regionCode, postalCode, formatted, country }` |
| `neighborhoods` | string[] | Neighborhoods the business is listed in |
| `timezone` | string | IANA timezone |
| `coordinates` | object | `{ latitude, longitude }` — extracted from the embedded static map |
| `phone` | string | Public phone number |
| `meteredPhone` | string | Yelp tracking phone number (if present) |
| `website` | string | Business website URL |
| `menuUrl` | string | External menu / booking URL |
| `operationHours` | object | Day-of-week → open hours string |
| `hoursLastUpdated` | string | Yelp's "updated N ago" string |
| `upcomingHolidays` | object[] | `[{ name, date }]` — upcoming special hours |
| `amenities` | string[] | All properties in the "Amenities and More" section |
| `offeredServices` | object[] | `[{ alias, name, suggestedByYelp }]` — services offered |
| `messaging` | object | `{ enabled, responseRate, responseTimeText }` |
| `searchStats` | object | `{ totalSearchCount, totalSearchRadius, totalSearchCategory }` — Yelp impression data |
| `associatedSearches` | object[] | `[{ phrase, href }]` — related search terms |
| `photoCount` | number | Number of photos on the page |
| `photoUrls` | string[] | Full-resolution photo URLs |

### Example Output

```json
{
  "url": "https://www.yelp.com/biz/warm-stone-spa-playa-del-rey",
  "alias": "warm-stone-spa-playa-del-rey",
  "businessId": "TUje2qrjBSrF8ZeldoYANA",
  "name": "Warm Stone Spa",
  "about": "Warm Stone Spa is a top-rated massage studio in Playa del Rey specializing in Thai-inspired bodywork, deep tissue, hot stone, couples, and four-hands massage...",
  "rating": 5,
  "reviewCount": 8,
  "priceRange": null,
  "isClosed": false,
  "isClaimed": true,
  "isYelpAdvertiser": true,
  "categories": [
    { "title": "Massage", "alias": "massage" },
    { "title": "Massage Therapy", "alias": "massage_therapy" },
    { "title": "Yoga", "alias": "yoga" }
  ],
  "address": {
    "addressLine1": "6810 Vista Del Mar Ln",
    "city": "Playa del Rey",
    "regionCode": "CA",
    "postalCode": "90293",
    "formatted": "6810 Vista Del Mar Ln\nPlaya del Rey, CA 90293",
    "country": "US"
  },
  "neighborhoods": ["Playa del Rey"],
  "timezone": "America/Los_Angeles",
  "coordinates": { "latitude": 33.958691, "longitude": -118.448148 },
  "phone": "(310) 439-2222",
  "meteredPhone": "(310) 737-2578",
  "website": "https://www.warmstonespa.com",
  "menuUrl": "https://booking.mangomint.com/warmstonespa",
  "operationHours": {
    "Mon": "10:00 AM - 8:00 PM",
    "Tue": "10:00 AM - 8:00 PM",
    "Wed": "10:00 AM - 8:00 PM",
    "Thu": "10:00 AM - 8:00 PM",
    "Fri": "10:00 AM - 8:00 PM",
    "Sat": "10:00 AM - 8:00 PM",
    "Sun": "10:00 AM - 8:00 PM"
  },
  "hoursLastUpdated": "Updated 3 months ago",
  "upcomingHolidays": [{ "name": "Memorial Day", "date": "2026-05-25" }],
  "amenities": [
    "Walk-ins welcome",
    "Wheelchair accessible",
    "Accepts credit cards",
    "Private lot parking",
    "Accepts insurance"
  ],
  "offeredServices": [
    { "alias": "job_massage_thai", "name": "Thai massage", "suggestedByYelp": false },
    { "alias": "job_massage_hot_stone", "name": "Hot stone massage", "suggestedByYelp": false }
  ],
  "searchStats": {
    "totalSearchCount": 78417,
    "totalSearchRadius": 15,
    "totalSearchCategory": "Massage"
  },
  "photoCount": 14,
  "photoUrls": ["https://s3-media0.fl.yelpcdn.com/bphoto/izTPgmQm4ZWnBywqA0P64g/o.jpg"]
}
```

## Running via API

```bash
curl -X POST "https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bizUrls": ["https://www.yelp.com/biz/warm-stone-spa-playa-del-rey"],
    "scrapeDoApiKey": "your-scrape-do-api-key"
  }'
```

To fetch results after the run completes:

```bash
curl "https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs/last/dataset/items?token=YOUR_APIFY_TOKEN"
```

## How it works

Yelp embeds the full Apollo GraphQL normalized cache (~114KB of structured data) inside an HTML comment on every business page. The scraper:

1. Fetches the biz page via Scrape.do with `customHeaders=true`, forwarding real Chrome browser security headers (User-Agent, sec-ch-ua, sec-fetch-*, etc.) to bypass Yelp's DataDome bot detection
2. Rotates through a pool of 10 browser fingerprints (Chrome 142–146, macOS/Windows/Linux, Edge) across requests to avoid fingerprint-based blocking
3. Locates the `<!--{...}-->` HTML comment containing the Apollo GraphQL cache
4. Decodes HTML entities and parses the JSON — if parse fails, retries with a fresh fingerprint and Canadian geoCode
5. Dereferences Apollo `__ref` pointers and flattens into a clean output schema
6. Extracts coordinates from the embedded Google static map URL — supports both storefront (`center=LAT,LNG`) and service-area businesses (`markers=...%7CLAT,LNG`)

## Notes

- Individual reviews and Q&A answers are **not** included — those are lazy-loaded via separate GraphQL calls
- Errored URLs are pushed to the dataset with an `error` field instead of being silently dropped
- Default delay between requests is 1.5s; raise it if you hit Scrape.do rate limits
- Tested at 20/20 success rate across lawyers, florists, movers, photographers, restaurants, spas, plumbers, auto repair, and more
