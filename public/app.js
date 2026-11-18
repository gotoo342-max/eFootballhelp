const $ = s => document.querySelector(s);
let players = [], source = 'none';
const statKeys = ['speed','acceleration','finishing','dribbling','passing','physical','stamina'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.page === id));
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => setPage(b.dataset.page));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => setPage(b.dataset.go));
function setStatus(text) { $('#status').textContent = text; }
function getLocal() { try { return JSON.parse(localStorage.getItem('efh_imported_players') || '[]'); } catch { return []; } }
function normalizeLocal(p, i) {
  return {
    id: String(p.id ?? p.cardId ?? `local-${i}`),
    name: String(p.name ?? p.playerName ?? 'Unknown'),
    team: String(p.team ?? p.club ?? ''),
    position: String(p.position ?? p.pos ?? ''),
    cardType: String(p.cardType ?? p.type ?? ''),
    overall: Number(p.overall ?? p.rating) || null,
    ...Object.fromEntries(statKeys.map(k => [k, Number(p[k] ?? p.stats?.[k]) || null])),
    image: ''
  };
}
async function loadData(refresh = false) {
  setStatus(refresh ? 'Refreshing player data…' : 'Checking player-data service…');
  try {
    const r = await fetch('/api/players' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' });
    const d = await r.json();
    const remote = Array.isArray(d.players) ? d.players : [];
    const local = getLocal();
    players = [...remote, ...local];
    source = d.source;
    const updated = d.at ? new Date(d.at).toLocaleString() : 'not yet updated';
    const providerLabel = d.source === 'external-api' ? 'External data provider' : 'No external provider';
    setStatus(`${providerLabel} · ${remote.length} provider records · last update: ${updated} · auto-refresh: every ${d.refreshEveryMinutes || 60} minutes. ${d.lastError || d.message || ''} Local imports: ${local.length}.`);
  } catch (e) {
    players = getLocal();
    source = 'offline';
    setStatus(`Could not reach the data service. ${players.length} locally imported records available.`);
  }
  renderPlayers();
  fillCompare();
}
function renderPlayers() {
  const q = $('#search').value.toLowerCase(), pos = $('#position').value;
  const list = players.filter(p =>
    (!pos || String(p.position).toUpperCase() === pos) &&
    [p.name, p.team, p.position, p.cardType].join(' ').toLowerCase().includes(q)
  );
  $('#playerGrid').innerHTML = list.length
    ? list.map(p => `<article class="player" data-id="${esc(p.id)}"><div class="rating">${p.overall ?? '—'} <span class="tag">OVR</span></div><h3>${esc(p.name)}</h3><div class="tag">${esc(p.position || 'Position unknown')} · ${esc(p.team || 'Team unknown')}</div><p class="tag">${esc(p.cardType || 'Card type not supplied')}</p></article>`).join('')
    : '<div class="empty">No player records available yet. Configure a provider or import a JSON file.</div>';
  document.querySelectorAll('.player').forEach(el => el.onclick = () => showPlayer(el.dataset.id));
}
function showPlayer(id) {
  const p = players.find(x => x.id === id);
  if (!p) return;
  $('#modalContent').innerHTML = `<p class="eyebrow">PLAYER RECORD</p><h2>${esc(p.name)}</h2><div class="rating">${p.overall ?? '—'} OVR</div><p class="muted">${esc(p.position)} · ${esc(p.team)} · ${esc(p.cardType)}</p><table class="comparetable">${statKeys.map(k => `<tr><td>${k[0].toUpperCase()+k.slice(1)}</td><td>${p[k] ?? 'Not supplied'}</td></tr>`).join('')}</table><p class="small muted">Values are shown as received from the source. Missing values are not estimated.</p>`;
  $('#modal').classList.remove('hidden');
}
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
$('#search').oninput = renderPlayers;
$('#position').onchange = renderPlayers;
$('#refresh').onclick = () => loadData(true);
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    const rows = Array.isArray(raw) ? raw : (raw.players || raw.data?.players);
    if (!Array.isArray(rows)) throw Error('JSON must be an array, or contain a players array.');
    const normalized = rows.map(normalizeLocal);
    localStorage.setItem('efh_imported_players', JSON.stringify(normalized));
    await loadData();
    setStatus(`Imported ${normalized.length} records into this browser. These are locally imported, not live-verified.`);
  } catch (err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
};
const categories = ['Speed','Dexterity','Dribbling','Passing','Shooting','Strength','Defending','Aerial','Goalkeeping'];
function buildPlanner() {
  $('#allocations').innerHTML = categories.map(c => `<div class="allocrow"><span>${c}</span><b id="v-${c}">0</b><input type="range" min="0" max="20" value="0" data-cat="${c}"></div>`).join('');
  document.querySelectorAll('[data-cat]').forEach(el => el.oninput = updateBudget);
  $('#budget').oninput = updateBudget;
  updateBudget();
}
function updateBudget() {
  let total = Math.max(0, Math.min(100, Number($('#budget').value) || 0)), sum = 0;
  document.querySelectorAll('[data-cat]').forEach(el => { sum += Number(el.value); $('#v-' + el.dataset.cat).textContent = el.value; });
  $('#spent').textContent = sum; $('#total').textContent = total;
  document.querySelectorAll('[data-cat]').forEach(el => { el.disabled = sum > total && Number(el.value) === 0; });
}
$('#reset').onclick = () => { document.querySelectorAll('[data-cat]').forEach(el => el.value = 0); updateBudget(); };
function fillCompare() {
  const opts = players.map((p, i) => `<option value="${i}">${esc(p.name)} · ${esc(p.position)}</option>`).join('');
  $('#leftPlayer').innerHTML = opts; $('#rightPlayer').innerHTML = opts;
  if (players.length > 1) $('#rightPlayer').selectedIndex = 1;
}
$('#compareBtn').onclick = () => {
  const a = players[Number($('#leftPlayer').value)], b = players[Number($('#rightPlayer').value)];
  if (!a || !b) return;
  $('#comparison').innerHTML = `<table class="comparetable"><tr><th>Attribute</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr>${['overall', ...statKeys].map(k => `<tr><td>${k}</td><td>${a[k] ?? '—'}</td><td>${b[k] ?? '—'}</td></tr>`).join('')}</table>`;
};
buildPlanner();
loadData();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
