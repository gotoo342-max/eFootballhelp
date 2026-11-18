
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PLAYER_DB = path.join(ROOT, 'PlayersDB_20261118.jsonl.gz');
const PLAYER_DB_LIMIT = 100000;

const PORT = Number(process.env.PORT || 3000);
const API_URL = process.env.PLAYER_DATA_API_URL || '';
const API_KEY = process.env.PLAYER_DATA_API_KEY || '';
const ARRAY_PATH = process.env.PLAYER_DATA_ARRAY_PATH || 'players';
const REFRESH_MINUTES = Math.max(5, Number(process.env.PLAYER_DATA_REFRESH_MINUTES || 60));
const CACHE_MS = REFRESH_MINUTES * 60 * 1000;

let cache = {
  players: [],
  source: 'not-configured',
  at: null,
  lastError: null,
  refreshing: false
};

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function getPath(obj, dotted) {
  if (!dotted) return obj;
  return dotted.split('.').reduce(
    (v, k) => v == null ? undefined : v[k],
    obj
  );
}

function normalizePlayer(p, i) {
  const num = v =>
    v === '' || v == null || !Number.isFinite(Number(v))
      ? null
      : Number(v);

  return {
    id: String(p.id ?? p.cardId ?? p.playerId ?? `row-${i + 1}`),
    name: String(p.name ?? p.playerName ?? p.title ?? 'Unknown player'),
    team: String(p.team ?? p.club ?? p.teamName ?? ''),
    position: String(p.position ?? p.pos ?? ''),
    cardType: String(p.cardType ?? p.card_type ?? p.type ?? ''),
    overall: num(p.overall ?? p.rating ?? p.ovr),
    speed: num(p.speed ?? p.stats?.speed),
    acceleration: num(p.acceleration ?? p.stats?.acceleration),
    finishing: num(p.finishing ?? p.stats?.finishing),
    dribbling: num(p.dribbling ?? p.stats?.dribbling),
    passing: num(p.passing ?? p.stats?.passing),
    physical: num(p.physical ?? p.physicalContact ?? p.stats?.physical),
    stamina: num(p.stamina ?? p.stats?.stamina),
    image: typeof p.image === 'string' &&
      /^https?:\/\//i.test(p.image) ? p.image : '',
    updatedAt: p.updatedAt ?? p.updated_at ?? null
  };
}

// Read and decompress the local PlayersDB dataset.
async function loadLocalDatabase() {
  if (!fs.existsSync(PLAYER_DB)) {
    throw new Error(
      'PlayersDB file not found: ' + path.basename(PLAYER_DB)
    );
  }

  const players = [];

  const stream = fs
    .createReadStream(PLAYER_DB)
    .pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const record = JSON.parse(line);
      const player = normalizePlayer(record, players.length);

      if (player.name !== 'Unknown player') {
        players.push(player);
      }

      if (players.length >= PLAYER_DB_LIMIT) break;
    } catch (err) {
      console.error('Skipping invalid player record:', err.message);
    }
  }

  if (players.length === 0) {
    throw new Error('No valid player records were found.');
  }

  return players;
}

// Load from external API or local PlayersDB.
async function refreshProvider() {
  if (cache.refreshing) return cache;

  cache.refreshing = true;

  try {
    let players;
    let source;

    if (API_URL) {
      const url = new URL(API_URL);

      if (url.protocol !== 'https:') {
        throw new Error('Provider URL must use HTTPS.');
      }

      const headers = { Accept: 'application/json' };

      if (API_KEY) {
        headers.Authorization = `Bearer ${API_KEY}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`Provider returned HTTP ${response.status}`);
      }

      const raw = await response.json();
      const rows = Array.isArray(raw)
        ? raw
        : getPath(raw, ARRAY_PATH);

      if (!Array.isArray(rows)) {
        throw new Error('Expected a player array from the provider.');
      }

      players = rows
        .map(normalizePlayer)
        .filter(p => p.name !== 'Unknown player');

      source = 'external-api';
    } else {
      players = await loadLocalDatabase();
      source = 'local-PlayersDB';
    }

    cache = {
      players,
      source,
      at: new Date().toISOString(),
      lastError: null,
      refreshing: false
    };

    console.log(`Player data loaded: ${players.length} records`);
  } catch (err) {
    cache = {
      ...cache,
      lastError: err.message,
      refreshing: false
    };

    console.error('Player data refresh failed:', err.message);
  }

  return cache;
}

async function loadPlayers(force = false) {
  const stale =
    !cache.at ||
    Date.now() - new Date(cache.at).getTime() >= CACHE_MS;

  if (force || stale) {
    await refreshProvider();
  }

  return {
    players: cache.players,
    source: cache.source,
    at: cache.at,
    lastError: cache.lastError,
    refreshEveryMinutes: REFRESH_MINUTES,
    message: cache.players.length
      ? 'Player data loaded.'
      : (cache.lastError || 'No player data available.')
  };
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      app: 'eFootballhelp',
      version: '1.3.0',
      providerConfigured: Boolean(API_URL),
      databaseConfigured: fs.existsSync(PLAYER_DB),
      refreshEveryMinutes: REFRESH_MINUTES,
      lastUpdated: cache.at,
      playerCount: cache.players.length
    });
  }

  if (pathname === '/api/players') {
    const data = await loadPlayers(
      parsed.searchParams.get('refresh') === '1'
    );

    return json(res, 200, data);
  }

  let requested;

  try {
    requested = pathname === '/'
      ? '/index.html'
      : decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: 'Invalid path' });
  }

  const full = path.resolve(PUBLIC, `.${requested}`);

  if (
    !full.startsWith(PUBLIC + path.sep) &&
    full !== PUBLIC
  ) {
    return json(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(full, (err, body) => {
    if (err) {
      return json(res, 404, { error: 'Not found' });
    }

    res.writeHead(200, {
      'Content-Type':
        mime[path.extname(full)] || 'application/octet-stream'
    });

    res.end(body);
  });
});

server.listen(PORT, async () => {
  console.log(`eFootballhelp running on port ${PORT}`);

  await refreshProvider();

  setInterval(refreshProvider, CACHE_MS).unref();
});
