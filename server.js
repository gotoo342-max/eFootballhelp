const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const API_URL = process.env.PLAYER_DATA_API_URL || '';
const API_KEY = process.env.PLAYER_DATA_API_KEY || '';
const ARRAY_PATH = process.env.PLAYER_DATA_ARRAY_PATH || 'players';
let cache = { at: 0, players: null, source: null };
const CACHE_MS = 5 * 60 * 1000;

function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function getPath(obj, dotted) {
  return dotted.split('.').reduce((v,k) => v == null ? undefined : v[k], obj);
}
function normalizePlayer(p, i) {
  const num = (v) => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  return {
    id: String(p.id ?? p.cardId ?? p.playerId ?? `row-${i+1}`),
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
    image: typeof p.image === 'string' && /^https?:\/\//i.test(p.image) ? p.image : '',
    updatedAt: p.updatedAt ?? p.updated_at ?? null
  };
}
async function loadPlayers(force=false) {
  if (!force && cache.players && Date.now()-cache.at < CACHE_MS) return cache;
  if (!API_URL) {
    return { players: [], source: 'not-configured', at: null,
      message: 'No external data source configured. Import a JSON file or configure a permitted API.' };
  }
  let url;
  try { url = new URL(API_URL); } catch { throw new Error('PLAYER_DATA_API_URL is not a valid URL'); }
  if (url.protocol !== 'https:') throw new Error('External data API must use HTTPS.');
  const headers = {'Accept':'application/json'};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Data provider returned HTTP ${response.status}`);
  const raw = await response.json();
  const rows = Array.isArray(raw) ? raw : getPath(raw, ARRAY_PATH);
  if (!Array.isArray(rows)) throw new Error(`Expected an array at "${ARRAY_PATH}" in provider response.`);
  cache = { players: rows.map(normalizePlayer), source: 'external-api', at: new Date().toISOString() };
  return cache;
}
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/api/health') return json(res,200,{ok:true, app:'eFootballhelp', version:'1.2.0', providerConfigured:!!API_URL});
  if (pathname === '/api/players') {
    try {
      const data = await loadPlayers(new URL(req.url, `http://${req.headers.host}`).searchParams.get('refresh') === '1');
      return json(res,200,data);
    } catch (e) {
      return json(res,502,{players:[],source:'provider-error',at:null,message:e.message});
    }
  }
  let requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const full = path.normalize(path.join(PUBLIC, requested));
  if (!full.startsWith(PUBLIC)) return json(res,403,{error:'Forbidden'});
  fs.readFile(full,(err,body)=>{
    if(err) return json(res,404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});
    res.end(body);
  });
});
server.listen(PORT,()=>console.log(`eFootballhelp running at http://localhost:${PORT}`));
