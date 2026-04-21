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

// -------- helpers ----------

function decodeHtmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; last to avoid double-decoding
}

function extractApolloState(html) {
  // Yelp embeds the Apollo GraphQL normalized cache in an HTML comment,
  // HTML-entity-encoded. The comment typically starts with &quot;ROOT_QUERY&quot;
  // and contains BusinessLocation somewhere in the middle.
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
  if (ref && typeof ref === 'object' && '__ref' in ref) {
    return store[ref.__ref] || ref;
  }
  return ref;
}

function findBusinessKey(store) {
  return Object.keys(store).find(k => k.startsWith('Business:'));
}

function parseCoordinatesFromMap(mapSrc) {
  if (!mapSrc) return null;
  const m = mapSrc.match(/center=(-?[\d.]+)%2C(-?[\d.]+)/);
  if (!m) return null;
  return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
}

function aliasFromUrl(url) {
  const m = url.match(/\/biz\/([^?&#/]+)/);
  return m ? m[1] : null;
}

function photoIdFromRef(ref) {
  // BusinessPhoto refs are base64-ish; cached BusinessPhoto entities hold urls
  const id = ref.replace(/^BusinessPhoto:/, '');
  return id;
}

function extractPhotoUrls(store) {
  const urls = [];
  for (const [key, val] of Object.entries(store)) {
    if (!key.startsWith('BusinessPhoto:')) continue;
    // Photo entities vary; look for any url field
    const photoUrlObj = val?.photoUrl || val?.url;
    if (photoUrlObj && typeof photoUrlObj === 'object') {
      const u = photoUrlObj.url || photoUrlObj.src;
      if (u) urls.push(u);
    }
  }
  // Fallback: regex out all bphoto IDs from any url fields
  return urls;
}

function extractHoursFromWeek(weekArr, store) {
  if (!Array.isArray(weekArr)) return {};
  const out = {};
  for (const entry of weekArr) {
    const d = deref(entry, store);
    if (d?.dayOfWeekShort) {
      out[d.dayOfWeekShort] = (d.hours || d.regularHours || []).join(', ') || null;
    }
  }
  return out;
}

function extractAmenities(propsArr, store) {
  const out = [];
  if (!Array.isArray(propsArr)) return out;
  for (const sec of propsArr) {
    const section = deref(sec, store);
    for (const p of section?.properties || []) {
      const ip = deref(p, store);
      if (ip?.displayText) out.push(ip.displayText);
    }
  }
  return out;
}

function parseBiz(apolloStore, url, rawHtml) {
  const bizKey = findBusinessKey(apolloStore);
  if (!bizKey) return null;
  const biz = apolloStore[bizKey];
  const locKey = Object.keys(apolloStore).find(k => k.startsWith('BusinessLocation:'));
  const loc = locKey ? apolloStore[locKey] : null;
  const address = loc?.address || null;

  const alias = biz.alias || aliasFromUrl(url);

  const mapKey = Object.keys(biz).find(k => k.startsWith('map('));
  const mapObj = mapKey ? deref(biz[mapKey], apolloStore) : null;
  const coords = parseCoordinatesFromMap(mapObj?.src);

  const hrs = deref(biz.operationHours, apolloStore);
  const weekKey = 'regularHoursMergedWithSpecialHoursForCurrentWeek';
  const operationHours = extractHoursFromWeek(hrs?.[weekKey], apolloStore);
  const holidays = (hrs?.businessHolidays || []).map(h => deref(h, apolloStore))
    .map(h => ({ name: h?.name, date: h?.date }))
    .filter(h => h.name);

  const categories = (biz.categories || [])
    .map(c => deref(c, apolloStore))
    .map(c => ({ title: c?.title, alias: c?.alias }))
    .filter(c => c.title);

  const propsKey = Object.keys(biz).find(k => k.startsWith('organizedProperties('));
  const amenities = extractAmenities(propsKey ? biz[propsKey] : [], apolloStore);

  const jobs = deref(biz.jobs, apolloStore);
  const offeredServices = (jobs?.offeredJobs || []).map(j => ({
    alias: j.alias,
    name: j.canonicalDisplayName,
    suggestedByYelp: j.isSuggestedByYelp,
  }));

  const ext = deref(biz.externalResources, apolloStore);
  const website = deref(ext?.website, apolloStore)?.url || null;
  const menuUrl = deref(ext?.menu, apolloStore)?.url || null;

  const phone = deref(biz.phoneNumber, apolloStore)?.formatted || null;
  const meteredPhone = deref(biz.meteredPhoneNumber, apolloStore)?.phoneText || null;

  const claimKey = Object.keys(biz).find(k => k.startsWith('claimability(')) || 'claimability';
  const claim = deref(biz[claimKey], apolloStore);

  const messaging = deref(biz.messaging, apolloStore);
  const responsiveness = deref(messaging?.responsiveness, apolloStore);

  const searchStats = deref(biz.searchStats, apolloStore);

  const assocKey = Object.keys(biz).find(k => k.startsWith('associatedSearchesV2('));
  const associatedSearches = (assocKey ? biz[assocKey] : [])
    .map(a => deref(a, apolloStore))
    .map(a => ({ phrase: a?.searchPhrase, href: a?.href }))
    .filter(a => a.phrase);

  const ratingKey = Object.keys(biz).find(k => k.startsWith('rating(')) || 'rating';

  // Photo URLs: regex from raw html (reliable) + dedupe
  const photoIds = Array.from(new Set(
    [...rawHtml.matchAll(/bphoto\/([A-Za-z0-9_-]+)\/[ols]\.(?:jpg|jpeg|png)/g)].map(m => m[1])
  ));
  const photoUrls = photoIds.map(id => `https://s3-media0.fl.yelpcdn.com/bphoto/${id}/o.jpg`);

  const history = deref(biz.history, apolloStore);

  return {
    url,
    alias,
    businessId: biz.encid || null,
    name: biz.name || null,
    about: biz.specialties || null,
    summary: biz.summary || null,
    rating: biz[ratingKey] ?? null,
    reviewCount: biz.reviewCount ?? null,
    priceRange: biz.priceRange || null,
    isClosed: biz.isClosed ?? null,
    isClaimed: claim?.isClaimed ?? null,
    isClaimable: claim?.isClaimable ?? null,
    isYelpAdvertiser: biz.isYelpAdvertiser ?? null,
    yearEstablished: history?.yearEstablished || null,
    historyDescription: history?.description || null,
    categories,
    address: address ? {
      addressLine1: address.addressLine1 || null,
      addressLine2: address.addressLine2 || null,
      addressLine3: address.addressLine3 || null,
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
    offeredServices,
    messaging: {
      enabled: messaging?.enabledness ? Object.values(messaging.enabledness).find(v => typeof v === 'boolean') ?? null : null,
      responseRate: responsiveness?.responseRate || null,
      responseTimeText: responsiveness?.responseTimeText || null,
    },
    searchStats: searchStats ? {
      totalSearchCount: searchStats.totalSearchCount ?? null,
      totalSearchRadius: searchStats.totalSearchRadius ?? null,
      totalSearchCategory: searchStats.totalSearchCategory ?? null,
    } : null,
    associatedSearches,
    photoCount: photoUrls.length,
    photoUrls,
  };
}

// -------- main loop ----------

const MAX_RETRIES = 2; // attempt 1: standard proxy; attempt 2: super proxy on miss
const RETRY_DELAY_MS = 3000;

const results = [];
for (let i = 0; i < bizUrls.length; i++) {
  const bizUrl = bizUrls[i];
  log.info(`[${i + 1}/${bizUrls.length}] Fetching ${bizUrl}`);

  const params = new URLSearchParams({
    token: scrapeDoApiKey,
    url: bizUrl,
    render: 'true',
  });
  if (geoCode) params.set('geoCode', geoCode);
  const apiUrl = `http://api.scrape.do/?${params.toString()}`;

  let html = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // First attempt uses standard proxy; escalate to super on data-miss retries
    const useSuper = attempt > 1;
    const attemptParams = new URLSearchParams(params);
    if (useSuper) attemptParams.set('super', 'true');
    else attemptParams.delete('super');
    const attemptUrl = `http://api.scrape.do/?${attemptParams.toString()}`;

    if (attempt > 1) log.info(`  Retry ${attempt}/${MAX_RETRIES} with super proxy...`);

    try {
      const res = await fetch(attemptUrl);
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        log.warning(`Attempt ${attempt}: HTTP ${res.status} for ${bizUrl}`);
      } else {
        const text = await res.text();
        if (text.includes('BusinessLocation')) {
          html = text;
          break;
        }
        lastError = 'apollo_state_not_found';
        log.warning(`Attempt ${attempt}: Apollo state missing for ${bizUrl} (page size: ${text.length})`);
      }
    } catch (e) {
      lastError = e.message;
      log.warning(`Attempt ${attempt}: Fetch failed for ${bizUrl}: ${e.message}`);
    }
    if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  }

  if (!html) {
    log.warning(`All ${MAX_RETRIES} attempts failed for ${bizUrl}: ${lastError}`);
    await Actor.pushData({ url: bizUrl, error: lastError });
    continue;
  }

  const apollo = extractApolloState(html);
  if (!apollo) {
    log.warning(`Apollo JSON parse failed for ${bizUrl}`);
    await Actor.pushData({ url: bizUrl, error: 'apollo_state_not_found' });
    continue;
  }

  const parsed = parseBiz(apollo, bizUrl, html);
  if (!parsed) {
    log.warning(`Parse failed for ${bizUrl}`);
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

log.info(`Done. Scraped ${results.length}/${bizUrls.length} businesses.`);

await Actor.exit();
