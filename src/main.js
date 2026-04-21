import { Actor, log } from 'apify';

await Actor.init();

const {
  bizUrls = [],
  bizIds = [],
  scrapeDoApiKey,
  geoCode = 'us',
  delayBetweenRequestsMs = 1500,
} = await Actor.getInput();

if (!scrapeDoApiKey) throw new Error('scrapeDoApiKey is required');
if (!Array.isArray(bizUrls) && !Array.isArray(bizIds)) {
  throw new Error('Provide bizUrls or bizIds');
}

// -------- helpers ----------

const HEADER_POOL = [
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"macOS"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', chUa: '"Chromium";v="145", "Not-A.Brand";v="24", "Google Chrome";v="145"', platform: '"Windows"', mobile: '?0', lang: 'en-US,en;q=0.8' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', chUa: '"Chromium";v="144", "Not-A.Brand";v="24", "Google Chrome";v="144"', platform: '"macOS"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"', platform: '"Windows"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"Linux"', mobile: '?0', lang: 'en-US,en;q=0.7' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', chUa: '"Chromium";v="143", "Not-A.Brand";v="24", "Google Chrome";v="143"', platform: '"macOS"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', chUa: '"Chromium";v="145", "Not-A.Brand";v="24", "Google Chrome";v="145"', platform: '"Windows"', mobile: '?0', lang: 'en-GB,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', chUa: '"Chromium";v="142", "Not-A.Brand";v="24", "Google Chrome";v="142"', platform: '"macOS"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', chUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"', platform: '"Windows"', mobile: '?0', lang: 'en-US,en;q=0.9' },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', chUa: '"Chromium";v="144", "Not-A.Brand";v="24", "Google Chrome";v="144"', platform: '"Linux"', mobile: '?0', lang: 'en-US,en;q=0.8' },
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
    'sec-ch-ua-mobile': h.mobile,
    'sec-ch-ua-platform': h.platform,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };
}

function scrapeDoUrl(targetUrl, opts = {}) {
  const p = new URLSearchParams({ token: scrapeDoApiKey, url: targetUrl, customHeaders: 'true' });
  if (opts.render) p.set('render', 'true');
  if (opts.super) p.set('super', 'true');
  if (opts.geoCode || geoCode) p.set('geoCode', opts.geoCode || geoCode);
  return `http://api.scrape.do/?${p.toString()}`;
}

async function scrapeDoFetch(targetUrl, opts = {}) {
  return fetch(scrapeDoUrl(targetUrl, opts), { headers: getNextHeaders() });
}

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

function aliasFromUrl(url) {
  const m = url?.match(/\/biz\/([^?&#/]+)/);
  return m ? m[1] : null;
}

// -------- Step 1: get bizId from alias URL (cheap plain HTTP) ----------

async function getBizId(bizUrl) {
  try {
    const res = await scrapeDoFetch(bizUrl);
    if (!res.ok) return null;
    const html = await res.text();
    // Meta tag: <meta name="yelp-biz-id" content="...">
    const m = html.match(/yelp-biz-id[^>]*content="([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) {
    log.warning(`getBizId failed for ${bizUrl}: ${e.message}`);
    return null;
  }
}

// -------- Step 2: props endpoint (primary, 100% reliable) ----------

async function fetchProps(bizId) {
  const url = `https://www.yelp.com/biz/${bizId}/props`;
  try {
    const res = await scrapeDoFetch(url, { super: true });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bizDetailsPageProps || null;
  } catch (e) {
    log.warning(`fetchProps failed for ${bizId}: ${e.message}`);
    return null;
  }
}

function parseProps(props, bizId, alias) {
  if (!props) return null;

  const services = (props.serviceOfferingsProps?.services || [])
    .map(s => s.serviceName).filter(Boolean);

  const highlights = (props.sponsoredBusinessHighlightsProps?.businessHighlights || [])
    .map(h => h.title).filter(Boolean);

  const msg = props.messageWidgetProps || {};
  const resp = msg.responsiveness || {};

  const related = (props.relatedBusinessesCarouselProps?.relatedBusinesses || [])
    .map(r => ({
      name: r.name,
      rating: r.rating,
      alias: aliasFromUrl(r.businessUrl),
      categories: (r.categories || []).map(c => c.title),
    }));

  return {
    businessId: bizId,
    alias,
    name: props.businessName || null,
    isYelpAdvertiser: props.businessIsAdvertiser ?? null,
    services,
    highlights,
    messaging: {
      recentRequestCount: msg.recentRequestCount || null,
      responseTimeText: resp.responseTimeText || null,
      replyRateText: resp.replyRateText || null,
      isGoodResponsiveness: resp.isGoodResponsiveness ?? null,
    },
    relatedBusinesses: related,
  };
}

// -------- Step 3: Apollo HTML (bonus enrichment) ----------

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

async function fetchApollo(bizUrl) {
  try {
    const res = await scrapeDoFetch(bizUrl, { super: true });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes('BusinessLocation')) return null;
    return { apollo: extractApolloState(html), html };
  } catch (e) {
    return null;
  }
}

function parseApollo(store, html) {
  if (!store) return null;
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
    if (d?.dayOfWeekShort) {
      operationHours[d.dayOfWeekShort] = (d.hours || d.regularHours || []).join(', ') || null;
    }
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

  const photoIds = Array.from(new Set(
    [...html.matchAll(/bphoto\/([A-Za-z0-9_-]+)\/[ols]\.(?:jpg|jpeg|png)/g)].map(m => m[1])
  ));

  return {
    rating: biz[ratingKey] ?? null,
    reviewCount: biz.reviewCount ?? null,
    priceRange: biz.priceRange || null,
    isClosed: biz.isClosed ?? null,
    isClaimed: claim?.isClaimed ?? null,
    about: biz.specialties || null,
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
    searchStats: searchStats ? {
      totalSearchCount: searchStats.totalSearchCount ?? null,
      totalSearchRadius: searchStats.totalSearchRadius ?? null,
      totalSearchCategory: searchStats.totalSearchCategory ?? null,
    } : null,
    photoCount: photoIds.length,
    photoUrls: photoIds.map(id => `https://s3-media0.fl.yelpcdn.com/bphoto/${id}/o.jpg`),
  };
}

// -------- build input list ----------

// Normalise: merge bizUrls + bizIds into [{alias, bizId}]
const inputs = [];

for (const entry of bizIds) {
  if (typeof entry === 'string') {
    inputs.push({ bizId: entry, alias: null, url: null });
  } else if (entry?.bizId) {
    inputs.push({ bizId: entry.bizId, alias: entry.alias || null, url: entry.url || null });
  }
}

for (const url of bizUrls) {
  inputs.push({ bizId: null, alias: aliasFromUrl(url), url });
}

if (inputs.length === 0) throw new Error('Provide at least one bizUrl or bizId');

// -------- main loop ----------

const results = [];

for (let i = 0; i < inputs.length; i++) {
  let { bizId, alias, url } = inputs[i];
  log.info(`[${i + 1}/${inputs.length}] ${alias || bizId}`);

  // Step 1: resolve bizId if missing
  if (!bizId) {
    const targetUrl = url || (alias ? `https://www.yelp.com/biz/${alias}` : null);
    if (!targetUrl) {
      await Actor.pushData({ alias, error: 'no_url_or_bizid' });
      continue;
    }
    bizId = await getBizId(targetUrl);
    if (!bizId) {
      log.warning(`  Could not resolve bizId for ${targetUrl}`);
      await Actor.pushData({ url: targetUrl, alias, error: 'bizid_not_found' });
      continue;
    }
    log.info(`  Resolved bizId: ${bizId}`);
  }

  if (!alias && url) alias = aliasFromUrl(url);

  // Step 2: props (reliable, always runs)
  const propsData = await fetchProps(bizId);
  if (!propsData) {
    log.warning(`  Props failed for ${bizId}`);
    await Actor.pushData({ bizId, alias, error: 'props_fetch_failed' });
    continue;
  }
  const parsed = parseProps(propsData, bizId, alias);
  log.info(`  ${parsed.name} — props ok`);

  // Step 3: Apollo HTML (bonus, runs in parallel with props already done)
  const apolloResult = await fetchApollo(
    alias ? `https://www.yelp.com/biz/${alias}` : `https://www.yelp.com/biz/${bizId}`
  );
  const apolloData = apolloResult ? parseApollo(apolloResult.apollo, apolloResult.html) : null;
  if (apolloData) {
    log.info(`  Apollo enrichment ok (coords: ${!!apolloData.coordinates})`);
    Object.assign(parsed, apolloData);
  } else {
    log.info(`  Apollo enrichment skipped/failed — props data only`);
  }

  results.push(parsed);
  await Actor.pushData(parsed);

  if (i < inputs.length - 1 && delayBetweenRequestsMs > 0) {
    await new Promise(r => setTimeout(r, delayBetweenRequestsMs));
  }
}

log.info(`Done. ${results.length}/${inputs.length} businesses scraped.`);
await Actor.exit();
