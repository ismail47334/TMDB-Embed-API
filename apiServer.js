// MoviMoon - apiServer.js - FINAL VERSION for Docker + Render Port 8787 + movimoon.blogspot.com
// This replaces the old TMDB-Embed-API apiServer.js
// Docker: EXPOSE 8787, BIND_HOST=0.0.0.0, HEALTHCHECK /api/health
// Render: PORT env (8787), Priority: MultiMovies BEER & Slast430did COM First

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== CONFIG - তোমার নতুন Domain =====
const TMDB_API_KEY = process.env.TMDB_API_KEY || '31ff7a3cb6f70503286613810c0e6a58';
const PORT = process.env.PORT || 8787; // Render uses 8787, Docker EXPOSE 8787
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SITE_DOMAIN = 'movimoon.blogspot.com'; // Changed from cinevol.blogspot.com
const REFERER = `https://${SITE_DOMAIN}/`;

console.log(`[Config] PORT=${PORT} BIND_HOST=${BIND_HOST} SITE=${SITE_DOMAIN} TMDB_KEY=${TMDB_API_KEY ? 'SET' : 'NOT SET'}`);

// Cache
const cache = new Map();

// Load 61 Servers
let ALL_SERVERS = [];
try {
  let loaded;
  try { loaded = require('./MoviMoon_61_Servers_COMBINED_FINAL.js'); } 
  catch(e1) { 
    try { loaded = require('./MoviMoon_61_Servers_COMBINED_FINAL'); }
    catch(e2) { loaded = null; }
  }
  if(loaded) {
    ALL_SERVERS = loaded.SERVERS || loaded;
    console.log(`[Load] Loaded ${ALL_SERVERS.length} servers from 61 file`);
  }
} catch(e) {
  console.error('[Load] Failed to load 61 servers file:', e.message);
}

if(ALL_SERVERS.length === 0) {
  console.warn('[Load] 61 servers file not found, using minimal fallback - Please upload MoviMoon_61_Servers_COMBINED_FINAL.js');
  // Minimal fallback so server still starts
  ALL_SERVERS = [
    { name: 'VidFast VC (Best)', movie: id => `https://vidfast.vc/movie/${id}`, tv: (id,s,e) => `https://vidfast.vc/tv/${id}/${s}/${e}` },
    { name: 'VidSrc XYZ (4K)', movie: id => `https://vidsrc.xyz/embed/movie/${id}`, tv: (id,s,e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}` }
  ];
}

// Priority Sorting
function getPrioritizedServers() {
  const priorityNames = ['MultiMovies BEER', 'Slast430did COM'];
  const priority = [];
  const rest = [];
  for (const s of ALL_SERVERS) {
    const isPriority = priorityNames.some(p => s.name && s.name.includes(p));
    if (isPriority) {
      if (s.name.includes('MultiMovies')) priority.unshift(s);
      else priority.push(s);
    } else {
      rest.push(s);
    }
  }
  const ordered = [...priority, ...rest];
  console.log(`[Priority] Ordered: ${ordered.slice(0,3).map(x=>x.name).join(' -> ')} ... total ${ordered.length}`);
  return ordered;
}

const SERVERS = getPrioritizedServers();

// TMDB Helper
async function getTMDBInfo(tmdbId, type) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const extUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const extRes = await fetch(extUrl);
    const extData = await extRes.json();
    return {
      title: data.title || data.name || '',
      slug: (data.title || data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0,60),
      imdbId: extData.imdb_id || '',
      year: (data.release_date || data.first_air_date || '').split('-')[0]
    };
  } catch(e) {
    console.error('TMDB Error:', e);
    return { title: '', slug: '', imdbId: '', year: '' };
  }
}

// Check Server
async function checkServer(server, tmdbInfo, type, season, episode) {
  try {
    const tmdbId = tmdbInfo.tmdbId;
    let embedUrl = '';
    if(server.name && server.name.includes('MultiMovies')) {
      embedUrl = type === 'movie' ? server.movie(tmdbInfo.slug) : server.tv(tmdbInfo.slug, season, episode);
    } else if(server.name && server.name.includes('Slast430did')) {
      if(!tmdbInfo.imdbId) return null;
      embedUrl = type === 'movie' ? server.movie(tmdbInfo.imdbId) : server.tv(tmdbInfo.imdbId, season, episode);
    } else {
      embedUrl = type === 'movie' ? server.movie(tmdbId) : server.tv(tmdbId, season, episode);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(embedUrl, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': REFERER }
    });
    clearTimeout(timeout);
    const text = await res.text();
    const hasPlayer = text.includes('player') || text.includes('iframe') || text.includes('video') || text.length > 5000;
    const notFound = text.toLowerCase().includes('not found') || text.toLowerCase().includes('404') || text.toLowerCase().includes('no results');
    if(hasPlayer && !notFound && res.status === 200) {
      let score = 0;
      if(server.name && server.name.includes('MultiMovies')) score = 200;
      else if(server.name && server.name.includes('Slast430did')) score = 199;
      else if(embedUrl.includes('vidfast')) score = 100;
      else if(embedUrl.includes('vidsrc.xyz')) score = 95;
      else if(embedUrl.includes('vidlink')) score = 90;
      else score = 50;
      return { name: server.name, embedUrl, score, isWorking: true, isPriority: score >= 199 };
    }
    return null;
  } catch(e) { return null; }
}

// ===== ROUTES =====

// Health Check - Docker HEALTHCHECK uses this
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), port: PORT, servers: SERVERS.length, domain: SITE_DOMAIN, timestamp: Date.now() });
});

// Also support /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    status: 'MoviMoon Smart Backend Running - PORT 8787 - PRIORITY MODE - movimoon.blogspot.com', 
    port: PORT,
    bindHost: BIND_HOST,
    domain: SITE_DOMAIN,
    priorityServers: ['MultiMovies BEER (Title)', 'Slast430did COM (IMDB)'],
    totalServers: SERVERS.length, 
    cache: cache.size,
    endpoints: {
      health: '/api/health',
      resolve: '/api/resolve?tmdb=550&type=movie',
      resolveTV: '/api/resolve?tmdb=1399&type=tv&s=1&e=1'
    }
  });
});

// Main Resolve API - Priority Mode
app.get('/api/resolve', async (req, res) => {
  const { tmdb, type = 'movie', s = 1, e = 1 } = req.query;
  if(!tmdb) return res.status(400).json({ error: 'tmdb required' });
  const cacheKey = `${tmdb}-${type}-${s}-${e}`;
  if(cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if(Date.now() - cached.time < 6*60*60*1000) {
      return res.json({ ...cached.data, fromCache: true });
    }
  }
  console.log(`[Resolve] TMDB:${tmdb} Type:${type} S:${s} E:${e} - Priority First - Domain:${SITE_DOMAIN}`);
  const tmdbInfo = await getTMDBInfo(tmdb, type);
  tmdbInfo.tmdbId = tmdb;
  const priorityServers = SERVERS.slice(0,2);
  const restServers = SERVERS.slice(2);
  let workingServers = [];
  console.log(`[Priority Check] ${priorityServers.map(s=>s.name).join(', ')}`);
  const priorityChecks = await Promise.all(priorityServers.map(s => checkServer(s, tmdbInfo, type, s, e)));
  workingServers.push(...priorityChecks.filter(Boolean));
  const batchSize = 15;
  for(let i = 0; i < restServers.length; i += batchSize) {
    const batch = restServers.slice(i, i + batchSize);
    const checks = await Promise.all(batch.map(s => checkServer(s, tmdbInfo, type, s, e)));
    workingServers.push(...checks.filter(Boolean));
  }
  workingServers.sort((a,b) => b.score - a.score);
  const result = {
    tmdb, type, title: tmdbInfo.title, slug: tmdbInfo.slug, imdbId: tmdbInfo.imdbId,
    domain: SITE_DOMAIN,
    totalChecked: SERVERS.length,
    workingCount: workingServers.length,
    priorityChecked: priorityServers.map(s=>s.name),
    defaultServer: workingServers[0] || null,
    availableServers: workingServers,
    timestamp: Date.now()
  };
  cache.set(cacheKey, { time: Date.now(), data: result });
  res.json(result);
});

// Legacy compatibility: /movie/:id and /tv/:id/:s/:e if old code used it
app.get('/movie/:id', async (req, res) => {
  req.query.tmdb = req.params.id;
  req.query.type = 'movie';
  return app._router.handle(req, res, () => {});
});

console.log(`[Init] SITE_DOMAIN set to ${SITE_DOMAIN}, REFERER=${REFERER}`);

// Start Server - Bind to 0.0.0.0 for Docker + Render
app.listen(PORT, BIND_HOST, () => {
  console.log(`✅ MoviMoon Server running on http://${BIND_HOST}:${PORT} - PORT 8787 Fixed - PRIORITY MODE - Domain: ${SITE_DOMAIN}`);
});
