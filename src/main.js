import { Actor, log } from 'apify';

await Actor.init();

const {
  bizUrls = [],
  scrapeDoApiKey,
  geoCode = 'us',
  delayBetweenRequestsMs = 1500,
} = await Actor.getInput();

if (!scrapeDoApiKey) throw new Error('scrapeDoApiKey is required');
if (!Array.isArray(bizUrls) || bizUrls.length === 0) {
  throw new Error('bizUrls must be a non-empty array of Yelp biz URLs');
}

// -------- browser header pool ----------

const HEADER_POOL = [
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"macOS"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', chUa: '"Chromium";v="145", "Not-A.Brand";v="24", "Google Chrome";v="145"', platform: '"Windows"', lang: 'en-US,en;q=0.8' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', chUa: '"Chromium";v="144", "Not-A.Brand";v="24", "Google Chrome";v="144"', platform: '"macOS"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"', platform: '"Windows"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"Linux"', lang: 'en-US,en;q=0.7' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', chUa: '"Chromium";v="143", "Not-A.Brand";v="24", "Google Chrome";v="143"', platform: '"macOS"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', chUa: '"Chromium";v="145", "Not-A.Brand";v="24", "Google Chrome";v="145"', platform: '"Windows"', lang: 'en-GB,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', chUa: '"Chromium";v="142", "Not-A.Brand";v="24", "Google Chrome";v="142"', platform: '"macOS"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"Windows"', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', chUa: '"Chromium";v="144", "Not-A.Brand";v="24", "Google Chrome";v="144"', platform: '"Linux"', lang: 'en-US,en;q=0.8' },
];

let headerIndex = 0;
function getNextHeaders() {
  const h = HEADER_POOL[headerIndex % HEADER_POOL.length];
  headerIndex++;
  return {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': h.lang,
    'user-agent': h.ua,
    'sec-ch-ua': h.chUa,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': h.platform,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };
}

// -------- helpers ----------

function decodeHtmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function extractApolloState(html) {
  const re = /<!--(\{&quot;[\s\S]+?\})-->/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes('BusinessLocation')) continue;
    try {
      return JSON.parse(decodeHtmlEntities(m[1]));
    } catch (e) {
      log.warning(`Apollo JSON parse failed: ${e.message}`);
    }
  }
  return null;
}

function deref(ref, store) {
  if (ref && typeof ref === 'object' && '__ref' in ref) return store[ref.__ref] || ref;
  return ref;
}

function parseCoordinatesFromMap(mapSrc) {
  if (!mapSrc) return null;
  let m = mapSrc.match(/center=(-?[\d.]+)%2C(-?[\d.]+)/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  const markers = [...mapSrc.matchAll(/markers=[^&]*%7C(-?[\d.]+)%2C(-?[\d.]+)/g)];
  if (markers.length) {
    const last = markers[markers.length - 1];
    return { latitude: parseFloat(last[1]), longitude: parseFloat(last[2]) };
  }
  return null;
}

function aliasFromUrl(url) {
  const m = url?.match(/\/biz\/([^?&#/]+)/);
  return m ? m[1] : null;
}

function parseBiz(store, url, html) {
  const bizKey = Object.keys(store).find(k => k.startsWith('Business:'));
  if (!bizKey) return null;
  const biz = store[bizKey];
  const locKey = Object.keys(store).find(k => k.startsWith('BusinessLocation:'));
  const loc = locKey ? store[locKey] : null;
  const address = loc?.address || null;

  const mapKey = Object.keys(biz).find(k => k.startsWith('map('));
  const mapObj = mapKey ? deref(biz[mapKey], store) : null;
  const coords = parseCoordinatesFromMap(mapObj?.src);

  const hrs = deref(biz.operationHours, store);
  const weekKey = 'regularHoursMergedWithSpecialHoursForCurrentWeek';
  const operationHours = {};
  for (const entry of hrs?.[weekKey] || []) {
    const d = deref(entry, store);
    if (d?.dayOfWeekShort) operationHours[d.dayOfWeekShort] = (d.hours || d.regularHours || []).join(', ') || null;
  }

  const holidays = (hrs?.businessHolidays || [])
    .map(h => deref(h, store))
    .map(h => ({ name: h?.name, date: h?.date }))
    .filter(h => h.name);

  const cats = (biz.categories || [])
    .map(c => deref(c, store))
    .map(c => ({ title: c?.title, alias: c?.alias }))
    .filter(c => c.title);

  const propsKey = Object.keys(biz).find(k => k.startsWith('organizedProperties('));
  const amenities = [];
  for (const sec of propsKey ? biz[propsKey] : []) {
    const section = deref(sec, store);
    for (const p of section?.properties || []) {
      const ip = deref(p, store);
      if (ip?.displayText) amenities.push(ip.displayText);
    }
  }

  const ext = deref(biz.externalResources, store);
  const website = deref(ext?.website, store)?.url || null;
  const menuUrl = deref(ext?.menu, store)?.url || null;
  const phone = deref(biz.phoneNumber, store)?.formatted || null;
  const meteredPhone = deref(biz.meteredPhoneNumber, store)?.phoneText || null;
  const claimKey = Object.keys(biz).find(k => k.startsWith('claimability(')) || 'claimability';
  const claim = deref(biz[claimKey], store);
  const searchStats = deref(biz.searchStats, store);
  const history = deref(biz.history, store);
  const ratingKey = Object.keys(biz).find(k => k.startsWith('rating(')) || 'rating';
  const assocKey = Object.keys(biz).find(k => k.startsWith('associatedSearchesV2('));
  const associatedSearches = (assocKey ? biz[assocKey] : [])
    .map(a => deref(a, store))
    .map(a => ({ phrase: a?.searchPhrase, href: a?.href }))
    .filter(a => a.phrase);

  const photoIds = Array.from(new Set(
    [...html.matchAll(/bphoto\/([A-Za-z0-9_-]+)\/[ols]\.(?:jpg|jpeg|png)/g)].map(m => m[1])
  ));

  return {
    url,
    alias: biz.alias || aliasFromUrl(url),
    businessId: biz.encid || null,
    name: biz.name || null,
    about: biz.specialties || null,
    rating: biz[ratingKey] ?? null,
    reviewCount: biz.reviewCount ?? null,
    priceRange: biz.priceRange || null,
    isClosed: biz.isClosed ?? null,
    isClaimed: claim?.isClaimed ?? null,
    isYelpAdvertiser: biz.isYelpAdvertiser ?? null,
    yearEstablished: history?.yearEstablished || null,
    categories: cats,
    address: address ? {
      addressLine1: address.addressLine1 || null,
      addressLine2: address.addressLine2 || null,
      city: address.city || null,
      regionCode: address.regionCode || null,
      postalCode: address.postalCode || null,
      formatted: address.formatted || null,
      country: loc?.country?.code || null,
    } : null,
    neighborhoods: loc?.neighborhoods || [],
    timezone: loc?.timezone || null,
    coordinates: coords,
    phone,
    meteredPhone,
    website,
    menuUrl,
    operationHours,
    hoursLastUpdated: hrs?.regularHoursLastUpdated || null,
    upcomingHolidays: holidays,
    amenities,
    messaging: {
      responseRate: null,
      responseTimeText: null,
    },
    searchStats: searchStats ? {
      totalSearchCount: searchStats.totalSearchCount ?? null,
      totalSearchRadius: searchStats.totalSearchRadius ?? null,
      totalSearchCategory: searchStats.totalSearchCategory ?? null,
    } : null,
    associatedSearches,
    photoCount: photoIds.length,
    photoUrls: photoIds.map(id => `https://s3-media0.fl.yelpcdn.com/bphoto/${id}/o.jpg`),
  };
}

// -------- main loop ----------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const results = [];
for (let i = 0; i < bizUrls.length; i++) {
  const bizUrl = bizUrls[i];
  log.info(`[${i + 1}/${bizUrls.length}] Fetching ${bizUrl}`);

  const params = new URLSearchParams({
    token: scrapeDoApiKey,
    url: bizUrl,
    customHeaders: 'true',
  });
  if (geoCode) params.set('geoCode', geoCode);

  let html = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptParams = new URLSearchParams(params);
    attemptParams.set('super', 'true');
    if (attempt > 1) attemptParams.set('geoCode', 'ca');
    const attemptUrl = `http://api.scrape.do/?${attemptParams.toString()}`;

    if (attempt > 1) log.info(`  Retry ${attempt}/${MAX_RETRIES} (ca geoCode)...`);

    try {
      const res = await fetch(attemptUrl, { headers: getNextHeaders() });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        log.warning(`Attempt ${attempt}: HTTP ${res.status}`);
      } else {
        const text = await res.text();
        if (text.includes('BusinessLocation')) {
          // Verify parse succeeds before accepting
          if (extractApolloState(text)) { html = text; break; }
          lastError = 'apollo_state_not_found';
          log.warning(`Attempt ${attempt}: Apollo parse failed (size: ${text.length})`);
        } else {
          lastError = 'apollo_state_not_found';
          log.warning(`Attempt ${attempt}: Apollo state missing (size: ${text.length})`);
        }
      }
    } catch (e) {
      lastError = e.message;
      log.warning(`Attempt ${attempt}: ${e.message}`);
    }
    if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  }

  if (!html) {
    await Actor.pushData({ url: bizUrl, error: lastError });
    continue;
  }

  const apollo = extractApolloState(html);
  if (!apollo) {
    await Actor.pushData({ url: bizUrl, error: 'apollo_state_not_found' });
    continue;
  }

  const parsed = parseBiz(apollo, bizUrl, html);
  if (!parsed) {
    await Actor.pushData({ url: bizUrl, error: 'parse_failed' });
    continue;
  }

  log.info(`  ${parsed.name} — ${parsed.rating}★ (${parsed.reviewCount} reviews)`);
  results.push(parsed);
  await Actor.pushData(parsed);

  if (i < bizUrls.length - 1 && delayBetweenRequestsMs > 0) {
    await new Promise(r => setTimeout(r, delayBetweenRequestsMs));
  }
}

log.info(`Done. ${results.length}/${bizUrls.length} businesses scraped.`);
await Actor.exit();
