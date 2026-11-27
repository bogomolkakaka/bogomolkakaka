// CD PLAYER: the visitor's own music. Songs are loaded from the phone or computer and kept in
// this browser only (js/music.js), so everyone hears just the songs they added themselves.
// Songs live in playlists ("discs") that the visitor arranges: everything goes into one
// playlist by default (new songs join the playlist that is open), and from the ⋯ menus a
// playlist can be split, merged, renamed, and songs moved between playlists or up and down.
// The playlists themselves are a small list of song ids in localStorage.
// The music keeps playing while you move between sections; a small spinning disc in the
// taskbar controls it.
import { $, $$, esc, h, ICON, openModal, confirmBox, hashStr, plural, sound, lsGet, lsSet, uid, clamp } from './util.js';
import { ACCEPT, listTracks, getSound, removeTrack, addFile, problem, keepSafe } from './music.js';

const SILENT = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const LISTS_KEY = 'bg-playlists';
const FIRST = 'Мой микс';
const LOOKS = [
  { bg: '#FFB8D9', ink: '#000', ac: '#E8291F', pat: 'hearts' }, { bg: '#244EE7', ink: '#fff', ac: '#CFE0FF', pat: 'grid' },
  { bg: '#FFD84A', ink: '#000', ac: '#244EE7', pat: 'dots' }, { bg: '#000000', ink: '#FFB8D9', ac: '#FFB8D9', pat: 'stripes' },
  { bg: '#E8291F', ink: '#fff', ac: '#FFD84A', pat: 'bolts' }, { bg: '#CFE0FF', ink: '#000', ac: '#E8291F', pat: 'sun' }
];

// disc = the open playlist, cur = id of the song in the player (it may have moved to another playlist)
const P = { tracks: [], lists: [], discs: [], disc: null, list: [], cur: null, playing: false, error: '', note: '', busy: false, unlocked: false, modal: null, loaded: false, fails: 0, url: '', token: 0, target: null };
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
const subs = new Set();
const emit = () => { subs.forEach(f => f()); renderMini(); media(); };
const idx = () => P.list.findIndex(t => t.id === P.cur);
export const nowPlaying = () => (P.cur ? P.tracks.find(t => t.id === P.cur) || null : null);

/* ---------- playlists ---------- */
function look(id) { return LOOKS[hashStr(id) % LOOKS.length]; }
// Every song sits in exactly one playlist. Songs nobody placed yet (just added, or added before
// playlists existed) go to the end of the target playlist, which is the first one by default.
// The saved copy is read once; after that the playlists in memory are the truth and are saved on every change.
function syncLists() {
  const have = new Set(P.tracks.map(t => t.id)), seen = new Set();
  let lists = P.listsReady ? P.lists : lsGet(LISTS_KEY, null);
  if (!Array.isArray(lists)) lists = [];
  lists = lists.filter(l => l && typeof l.id === 'string');
  lists.forEach(l => {
    l.title = String(l.title || 'Плейлист').slice(0, 40);
    l.ids = (Array.isArray(l.ids) ? l.ids : []).filter(id => have.has(id) && !seen.has(id) && seen.add(id));
  });
  if (!lists.length) lists = [{ id: 'mix', title: FIRST, ids: [] }];
  const loose = P.tracks.filter(t => !seen.has(t.id)).map(t => t.id);
  if (loose.length) (lists.find(l => l.id === P.target) || lists[0]).ids.push(...loose);
  P.lists = lists; P.listsReady = true;
  saveLists();
}
const saveLists = () => lsSet(LISTS_KEY, P.lists.map(l => ({ id: l.id, title: l.title, ids: l.ids })));
function rebuild() {
  syncLists();
  const byId = new Map(P.tracks.map(t => [t.id, t]));
  P.discs = P.lists.map(l => {
    const tracks = l.ids.map(id => byId.get(id)).filter(Boolean);
    const artists = [...new Set(tracks.map(t => t.artist).filter(Boolean))];
    return { id: l.id, title: l.title, tracks, artist: artists.length === 1 ? artists[0] : '', mix: artists.length !== 1, cover: (tracks.find(t => t.cover) || {}).cover || '', ...look(l.id) };
  });
  if (P.disc) { P.disc = P.discs.find(d => d.id === P.disc.id) || null; P.list = P.disc ? P.disc.tracks : []; }
  if (P.cur && !byId.has(P.cur)) stopAll();
  emit();
}
let loading = null;
export function refresh() {
  loading = listTracks().then(tracks => { P.tracks = tracks; P.loaded = true; rebuild(); return P.discs; })
    .catch(() => { P.loaded = true; P.error = 'Этот браузер не даёт хранить музыку. Попробуй другой браузер или выйди из режима инкогнито.'; emit(); return []; });
  return loading;
}
// discs for the stack on the desk
export async function myDiscs() { await (loading || refresh()); return P.discs; }
const listOf = id => P.lists.find(l => l.id === id);
const listWith = trackId => P.lists.find(l => l.ids.includes(trackId));
function newList(title, ids = [], after = null) {
  const l = { id: 'pl-' + uid().slice(0, 8), title: title.slice(0, 40), ids };
  const k = after ? P.lists.indexOf(after) : -1;
  if (k >= 0) P.lists.splice(k + 1, 0, l); else P.lists.push(l);
  return l;
}
function take(trackId) { const l = listWith(trackId); if (l) l.ids = l.ids.filter(x => x !== trackId); }
const songs = n => `${n} ${plural(n, ['песня', 'песни', 'песен'])}`;
function say(text) { P.note = text; P.error = ''; emit(); clearTimeout(say.t); say.t = setTimeout(() => { if (P.note === text) { P.note = ''; emit(); } }, 4000); }

function moveTrack(trackId, toId) { const to = listOf(toId); if (!to) return; take(trackId); to.ids.push(trackId); rebuild(); say(`Перенесла в «${to.title}».`); }
function shift(trackId, dir) {
  const l = listWith(trackId); if (!l) return;
  const k = l.ids.indexOf(trackId), j = k + dir; if (j < 0 || j >= l.ids.length) return;
  [l.ids[k], l.ids[j]] = [l.ids[j], l.ids[k]]; rebuild();
}
async function toNewList(trackId) {
  const name = await askName('Новый плейлист', `Плейлист ${P.lists.length + 1}`); if (!name) return;
  const from = listWith(trackId); if (!from) return;
  take(trackId); newList(name, [trackId], from); rebuild(); say(`Создала «${name}» и перенесла туда песню.`);
}
async function splitFrom(trackId) {
  const before = listWith(trackId); if (!before || before.ids.indexOf(trackId) <= 0) return;
  const name = await askName('Разделить плейлист', `${before.title} 2`); if (!name) return;
  const l = listWith(trackId); if (!l) return;
  const k = l.ids.indexOf(trackId); if (k <= 0) return;
  const rest = l.ids.slice(k); l.ids = l.ids.slice(0, k);
  newList(name, rest, l); rebuild(); say(`Готово: ${songs(rest.length)} теперь в «${name}».`);
}
async function createList() {
  const name = await askName('Новый плейлист', `Плейлист ${P.lists.length + 1}`); if (!name) return;
  const l = newList(name); rebuild(); openDisc(l.id, false);
  say(`Плейлист «${name}» готов. Перенеси в него песни через ⋯ или загрузи новые.`);
}
async function renameList(id) {
  const was = listOf(id); if (!was) return;
  const name = await askName('Название плейлиста', was.title); if (!name) return;
  const l = listOf(id); if (!l) return;
  l.title = name; rebuild();
}
function mergeInto(id, intoId) {
  const l = listOf(id), into = listOf(intoId); if (!l || !into || l === into) return;
  into.ids.push(...l.ids); P.lists = P.lists.filter(x => x !== l);
  const open = P.disc && P.disc.id === id;
  rebuild(); if (open) openDisc(into.id, false);
  say(`«${l.title}» теперь внутри «${into.title}».`);
}
async function deleteList(id) {
  const l = listOf(id); if (!l || P.lists.length < 2) return;
  const into = P.lists.find(x => x !== l);
  if (!(await confirmBox('Удалить плейлист?', l.ids.length ? `Плейлист «${l.title}» пропадёт, а его песни перейдут в «${into.title}».` : `Плейлист «${l.title}» пропадёт.`, 'Удалить'))) return;
  mergeInto(id, into.id);
}

/* ---------- playback ---------- */
// iPhone: audio may only start inside a tap. The first tap plays a silent sound, after that the element is free.
function unlock() {
  if (P.unlocked) return;
  P.unlocked = true;
  try { audio.src = SILENT; const p = audio.play(); if (p) p.catch(() => {}); } catch (e) { /* fine */ }
}
function stopAll() {
  P.token++; audio.pause(); P.playing = false; P.cur = null;
  if (P.url) { URL.revokeObjectURL(P.url); P.url = ''; }
}
function openDisc(id, autoplay) {
  const disc = P.discs.find(d => d.id === id); if (!disc) return;
  P.disc = disc; P.list = disc.tracks; P.error = ''; P.fails = 0;
  if (autoplay && disc.tracks.length) playTrack(0); else emit();
}
export function loadDisc(id, autoplay = true) { unlock(); openDisc(id, autoplay); }
export async function playTrack(i) {
  if (!P.list.length) return;
  unlock();
  const t = P.list[(i + P.list.length) % P.list.length], token = ++P.token;
  P.cur = t.id; P.playing = true; P.error = ''; emit();
  let blob = null;
  try { blob = await getSound(t.id); } catch (e) { blob = null; }
  if (token !== P.token) return;
  if (!blob) { fail('Эта песня не нашлась в браузере, включаю следующую.'); return; }
  const old = P.url;
  P.url = URL.createObjectURL(blob);
  audio.src = P.url;
  if (old) URL.revokeObjectURL(old);
  const p = audio.play();
  if (p) p.catch(e => {
    if (token !== P.token) return;
    P.playing = false;
    // the browser wants a tap first: one press on play is enough
    P.error = e && e.name === 'NotAllowedError' ? 'Нажми ▶, чтобы включить музыку.' : '';
    emit();
  });
}
function fail(msg) {
  P.fails++;
  if (P.fails >= Math.max(1, P.list.length)) { audio.pause(); P.playing = false; P.error = 'Песни этого плейлиста не играют в этом браузере. Попробуй файлы mp3 или m4a.'; emit(); return; }
  P.error = msg || 'Эта песня не играет в браузере, включаю следующую.'; emit();
  const at = P.cur;
  setTimeout(() => { if (P.cur === at) next(); }, 900);
}
export function toggle() {
  if (!P.cur) {
    if (P.list.length) playTrack(0);
    else { const d = P.discs.find(x => x.tracks.length); if (d) loadDisc(d.id, true); }
    return;
  }
  if (audio.paused) { unlock(); P.error = ''; audio.play().catch(() => {}); P.playing = true; }
  else { audio.pause(); P.playing = false; }
  emit();
}
export function next() {
  const k = idx();
  if (P.list.length && k < P.list.length - 1) { playTrack(k + 1); return; }
  // end of the playlist: the next one with songs plays (or this one again)
  const withSongs = P.discs.filter(d => d.tracks.length); if (!withSongs.length) { stopAll(); emit(); return; }
  const at = Math.max(0, withSongs.indexOf(P.disc));
  loadDisc(withSongs[(at + 1) % withSongs.length].id, true);
}
export function prev() { const k = idx(); if (audio.currentTime > 3 || k <= 0) { audio.currentTime = 0; return; } playTrack(k - 1); }
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };
const real = () => audio.src && audio.src !== SILENT;
audio.addEventListener('ended', () => { if (real() && P.cur) next(); });
audio.addEventListener('pause', () => { if (P.playing && real() && !audio.ended) { P.playing = false; emit(); } });
audio.addEventListener('play', () => { if (real() && !P.playing && P.cur) { P.playing = true; emit(); } });
audio.addEventListener('error', () => { if (real() && P.cur) fail(); });
audio.addEventListener('playing', () => { if (!real()) return; P.fails = 0; if (P.error) { P.error = ''; emit(); } });

// lock screen and headphone buttons on phones
function media() {
  if (!('mediaSession' in navigator)) return;
  const t = nowPlaying();
  try {
    navigator.mediaSession.metadata = t ? new MediaMetadata({ title: t.title, artist: t.artist || '', album: P.disc ? P.disc.title : '', artwork: t.cover ? [{ src: t.cover, sizes: '320x320', type: 'image/jpeg' }] : [] }) : null;
    navigator.mediaSession.playbackState = P.playing ? 'playing' : 'paused';
  } catch (e) { /* older browsers */ }
}
if ('mediaSession' in navigator) {
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
  set('play', () => toggle()); set('pause', () => toggle()); set('nexttrack', () => next()); set('previoustrack', () => prev());
  set('seekto', d => { if (d && isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
}

/* ---------- adding and removing songs ---------- */
export async function addFiles(files) {
  files = [...files]; if (!files.length || P.busy) return;
  P.busy = true; P.error = '';
  // new songs join the playlist that is open (or the first one)
  P.target = P.disc ? P.disc.id : (P.lists[0] || {}).id || null;
  const bad = [];
  let added = 0, firstNew = null;
  const base = Date.now();
  for (let k = 0; k < files.length; k++) {
    const f = files[k], why = problem(f);
    P.note = `Добавляю ${k + 1} из ${files.length}…`; emit();
    if (why) { bad.push(`«${f.name}»: ${why}`); continue; }
    try { const m = await addFile(f, base + k); added++; if (!firstNew) firstNew = m; }
    catch (e) {
      const full = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));
      bad.push(`«${f.name}»: ${full ? 'в браузере закончилось место, удали пару песен' : 'не получилось сохранить'}`);
      if (full) break;
    }
  }
  P.busy = false;
  if (added) keepSafe();
  await refresh();
  P.target = null;
  const into = firstNew ? P.discs.find(x => x.tracks.some(t => t.id === firstNew.id)) : null;
  if (added) say(`Добавлено: ${songs(added)}${into ? ` в «${into.title}»` : ''}.`); else P.note = '';
  P.error = bad.length ? `Не добавились ${bad.join('; ')}.` : '';
  if (into && !P.playing) { P.disc = into; P.list = into.tracks; playTrack(into.tracks.findIndex(t => t.id === firstNew.id)); }
  else if (into && !P.disc) openDisc(into.id, false);
  emit();
}
export async function deleteTrack(id) {
  const t = P.tracks.find(x => x.id === id); if (!t) return;
  if (!(await confirmBox('Удалить песню?', `«${t.title}» пропадёт из плеера в этом браузере.`, 'Удалить'))) return;
  if (P.cur === id) stopAll();
  try { await removeTrack(id); } catch (e) { P.error = 'Не получилось удалить песню.'; }
  await refresh();
}

/* ---------- small helpers for the window: a name box and a ⋯ menu ---------- */
function askName(title, value) {
  return new Promise(res => {
    let done = false;
    const m = openModal(`<h2>${esc(title)}</h2><form class="cdp__form"><label class="sr-only" for="pl-name">Название плейлиста</label><input class="input" id="pl-name" maxlength="40" autocomplete="off" value="${esc(value)}">
      <div class="modal__actions"><button class="btn btn--ghost" type="button" data-no>Отмена</button><button class="btn btn--primary" type="submit">Готово</button></div></form>`,
      { label: title, onClose: () => { if (!done) res(null); } });
    const input = $('#pl-name', m.el);
    $('form', m.el).addEventListener('submit', e => { e.preventDefault(); const v = input.value.trim(); if (!v) { input.focus(); return; } done = true; m.close(); res(v.slice(0, 40)); });
    $('[data-no]', m.el).addEventListener('click', () => { done = true; m.close(); res(null); });
    setTimeout(() => { input.focus(); input.select(); }, 50);
  });
}
let menuEl = null;
function closeMenu() { if (menuEl) { const back = menuEl._back; menuEl.remove(); menuEl = null; if (back && back.isConnected) back.focus({ preventScroll: true }); } }
function openMenu(anchor, title, items) {
  closeMenu();
  const card = anchor.closest('.modal__card'); if (!card) return;
  const m = h(`<div class="cdp__menu" role="menu" aria-label="${esc(title)}">${items.map((it, k) => it.sep ? '<hr>' : `<button type="button" role="menuitem" data-k="${k}"${it.danger ? ' class="is-danger"' : ''}>${esc(it.label)}</button>`).join('')}</div>`);
  m._back = anchor; card.appendChild(m); menuEl = m;
  const r = anchor.getBoundingClientRect(), cr = card.getBoundingClientRect();
  const left = clamp(r.right - cr.left - m.offsetWidth, 8, cr.width - m.offsetWidth - 8);
  let top = r.bottom - cr.top + card.scrollTop + 6;
  if (r.bottom + m.offsetHeight + 12 > innerHeight && r.top - m.offsetHeight - 6 > cr.top) top = r.top - cr.top + card.scrollTop - m.offsetHeight - 6;
  m.style.left = left + 'px'; m.style.top = top + 'px';
  m.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const it = items[+b.dataset.k]; closeMenu(); sound.play('click'); it.fn(); });
  const first = $('button', m); if (first) first.focus({ preventScroll: true });
}
document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-menu]')) closeMenu(); }, true);
window.addEventListener('keydown', e => {
  if (!menuEl) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const b = $$('button', menuEl), k = b.indexOf(document.activeElement);
    e.preventDefault(); b[(k + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus();
  }
}, true);
function trackMenu(anchor, trackId) {
  const l = listWith(trackId); if (!l) return;
  const k = l.ids.indexOf(trackId), t = P.tracks.find(x => x.id === trackId);
  const items = [];
  if (k > 0) items.push({ label: '↑ Поднять выше', fn: () => shift(trackId, -1) });
  if (k < l.ids.length - 1) items.push({ label: '↓ Опустить ниже', fn: () => shift(trackId, 1) });
  if (items.length) items.push({ sep: true });
  P.lists.filter(x => x !== l).forEach(x => items.push({ label: `Перенести в «${x.title}»`, fn: () => moveTrack(trackId, x.id) }));
  items.push({ label: 'Перенести в новый плейлист…', fn: () => toNewList(trackId) });
  if (k > 0) items.push({ label: 'Разделить: отсюда — в новый плейлист…', fn: () => splitFrom(trackId) });
  items.push({ sep: true }, { label: 'Удалить песню', danger: true, fn: () => deleteTrack(trackId) });
  openMenu(anchor, `Песня «${t ? t.title : ''}»`, items);
}
function listMenu(anchor) {
  const l = P.disc && listOf(P.disc.id); if (!l) return;
  const items = [{ label: 'Переименовать…', fn: () => renameList(l.id) }, { label: 'Новый плейлист…', fn: () => createList() }];
  P.lists.filter(x => x !== l).forEach(x => items.push({ label: `Объединить с «${x.title}»`, fn: () => mergeInto(l.id, x.id) }));
  if (P.lists.length > 1) items.push({ sep: true }, { label: 'Удалить плейлист', danger: true, fn: () => deleteList(l.id) });
  openMenu(anchor, `Плейлист «${l.title}»`, items);
}

/* ---------- taskbar mini player ---------- */
export function renderMini() {
  const host = document.getElementById('tb-cd'); if (!host) return;
  const t = nowPlaying();
  if (!t && !P.disc) { host.innerHTML = ''; return; }
  const bg = P.disc ? P.disc.bg : '#244EE7';
  host.innerHTML = `<button class="tb-cd${P.playing ? ' is-playing' : ''}" type="button" data-cd="open" title="CD-плеер" aria-label="CD-плеер${t ? `: ${esc(t.title)}${t.artist ? `, ${esc(t.artist)}` : ''}` : ''}"><i class="tb-cd__disc" style="--l:${bg}" aria-hidden="true"></i><span class="tb-cd__t">${t ? esc(t.title) : esc(P.disc.title)}</span></button>
    <button class="tb-icon tb-cd__pp" type="button" data-cd="toggle" aria-label="${P.playing ? 'Пауза' : 'Играть'}">${P.playing ? ICON.pause || '❚❚' : ICON.play || '▶'}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cd]'); if (!b) return;
  if (b.dataset.cd === 'open') openPlayer();
  if (b.dataset.cd === 'toggle') toggle();
});

/* ---------- the player window ---------- */
const fmt = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const short = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export function caseHTML(d, cls = '') {
  const art = d.cover ? ` jewel--cover" style="--bg:${d.bg};--ink:${d.ink};--ac:${d.ac};--cover:url('${d.cover}')` : `" style="--bg:${d.bg};--ink:${d.ink};--ac:${d.ac}`;
  const sub = d.tracks.length ? (d.mix ? songs(d.tracks.length) : short(d.artist, 26)) : 'пусто';
  return `<span class="jewel jewel--${d.pat} ${cls}${art}" aria-hidden="true">
    <span class="jewel__tray"><span class="cdisc" style="--l:${d.bg};--li:${d.ink}"><b>${esc(short(d.title, 14))}</b></span></span>
    <span class="jewel__lid"><span class="jewel__art"><b>${esc(short(d.title, 28))}</b><small>${esc(sub)}</small></span></span>
    <span class="jewel__spine"></span></span>`;
}
export function openPlayer() {
  if (P.modal && document.body.contains(P.modal.el)) return;
  if (!P.loaded) refresh();
  if (!P.disc && P.discs.length) { const d = (P.cur && P.discs.find(x => x.tracks.some(t => t.id === P.cur))) || P.discs[0]; P.disc = d; P.list = d.tracks; }
  const m = openModal(`<div class="cdp">
      <div class="cdp__shelf"><h2 class="cdp__h">Диски</h2><p class="cdp__sub">Твоя музыка. Загрузи песни с телефона или компьютера: они хранятся только в этом браузере и играют только у тебя.</p>
        <input type="file" id="cdp-file" accept="${ACCEPT}" multiple hidden>
        <ul class="cdp__cases" id="cdp-cases"></ul></div>
      <div class="cdp__deck">
        <div class="cdp__lh"><span class="cdp__lk">Плейлист</span><b class="cdp__lt" id="cdp-lt">—</b><button class="cdp__more" type="button" id="cdp-lmenu" data-menu aria-label="Действия с плейлистом" aria-haspopup="menu">⋯</button></div>
        <div class="discman" id="cdp-man"><div class="discman__win"><span class="cdisc cdisc--big" id="cdp-cd"><b></b></span></div>
          <div class="discman__lcd" aria-live="polite"><span id="cdp-lcd-t">ВСТАВЬ ДИСК</span><span id="cdp-lcd-n"></span></div></div>
        <div class="cdp__ctl"><button class="cdp__btn" type="button" data-p="prev" aria-label="Предыдущая песня">⏮</button><button class="cdp__btn cdp__btn--play" type="button" data-p="toggle" id="cdp-pp" aria-label="Играть">▶</button><button class="cdp__btn" type="button" data-p="next" aria-label="Следующая песня">⏭</button></div>
        <input class="cdp__seek" id="cdp-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Перемотка">
        <p class="cdp__note" id="cdp-note" role="status"></p>
        <p class="cdp__msg" id="cdp-msg" role="alert"></p>
        <div class="cdp__empty" id="cdp-empty" hidden><p id="cdp-empty-t"></p><button class="btn btn--primary" type="button" data-add>Загрузить музыку</button></div>
        <ol class="cdp__tracks" id="cdp-tracks"></ol>
        <p class="cdp__credit">Новые песни попадают в открытый плейлист, а через ⋯ у песни их можно переносить и делить плейлист. Песни никуда не отправляются: их слышишь только ты на этом устройстве. На iPhone выбирай файлы в «Файлах»: песни из приложения «Музыка» браузеру недоступны.</p>
      </div></div>`, { label: 'CD-плеер', wide: true, onClose: closeMenu });
  P.modal = m;
  const el = m.el, input = $('#cdp-file', el), seek = $('#cdp-seek', el);
  el.classList.add('cdp-card');
  let seeking = false, shelfKey = '';
  function paint() {
    if (!el.isConnected) return;
    const t = nowPlaying(), d = P.disc, k = idx();
    const key = P.discs.map(x => `${x.id}:${x.title}:${x.tracks.length}:${x.cover.length}`).join('|');
    if (key !== shelfKey) {
      shelfKey = key;
      const target = d ? d.title : (P.discs[0] || {}).title || FIRST;
      $('#cdp-cases', el).innerHTML = `<li><button class="cdp__case cdp__add" type="button" data-add aria-label="Загрузить свою музыку в «${esc(target)}»"><span class="jewel jewel--empty" aria-hidden="true"><span class="jewel__art"><i>+</i><small>mp3, m4a, wav</small></span></span><span class="cdp__name">Загрузить музыку</span></button></li>`
        + P.discs.map(x => `<li><button class="cdp__case" type="button" data-disc="${esc(x.id)}" aria-label="Плейлист «${esc(x.title)}», ${x.tracks.length ? songs(x.tracks.length) : 'пусто'}">${caseHTML(x)}<span class="cdp__name">${esc(x.title)}</span></button></li>`).join('')
        + `<li><button class="cdp__case cdp__new" type="button" data-newlist><span class="cdp__newbox" aria-hidden="true"><i>+</i></span><span class="cdp__name">Новый плейлист</span></button></li>`;
    }
    $$('.cdp__case[data-disc]', el).forEach(b => { const on = !!d && b.dataset.disc === d.id; b.classList.toggle('is-open', on); b.setAttribute('aria-pressed', String(on)); });
    $('#cdp-lt', el).textContent = d ? d.title : '—';
    $('#cdp-lmenu', el).hidden = !d;
    const cd = $('#cdp-cd', el);
    cd.style.cssText = d ? `--l:${d.bg};--li:${d.ink}` : '';
    cd.classList.toggle('is-empty', !d); $('b', cd).textContent = d ? short(d.title, 16) : '';
    $('#cdp-man', el).classList.toggle('is-playing', P.playing);
    $('#cdp-lcd-t', el).textContent = P.busy ? 'ЗАПИСЫВАЮ…' : t ? `${k >= 0 ? String(k + 1).padStart(2, '0') + '  ' : ''}${t.title}` : d && d.tracks.length ? 'ГОТОВ' : P.tracks.length ? 'ПУСТОЙ ПЛЕЙЛИСТ' : 'ЗАГРУЗИ МУЗЫКУ';
    $('#cdp-pp', el).textContent = P.playing ? '❚❚' : '▶';
    $('#cdp-pp', el).setAttribute('aria-label', P.playing ? 'Пауза' : 'Играть');
    $('#cdp-note', el).textContent = P.note;
    $('#cdp-msg', el).textContent = P.error;
    const empty = P.loaded && !P.busy && (!d || !d.tracks.length);
    $('#cdp-empty', el).hidden = !empty;
    $('#cdp-empty-t', el).textContent = !P.tracks.length ? 'Плеер пока пустой. Добавь первые песни, и он сам заиграет.' : 'В этом плейлисте пока пусто. Загрузи сюда новые песни или перенеси старые через ⋯ у песни в другом плейлисте.';
    seek.disabled = !t;
    $('#cdp-tracks', el).innerHTML = P.list.map((x, n) => `<li><button class="cdp__track${x.id === P.cur ? ' is-on' : ''}" type="button" data-t="${n}" ${x.id === P.cur ? 'aria-current="true"' : ''}><span class="cdp__n">${String(n + 1).padStart(2, '0')}</span><span class="cdp__tt"><b>${esc(x.title)}</b>${x.artist ? `<small>${esc(x.artist)}</small>` : ''}</span></button><button class="cdp__more" type="button" data-menu data-tm="${esc(x.id)}" aria-label="Что сделать с «${esc(x.title)}»" aria-haspopup="menu">⋯</button></li>`).join('');
  }
  function time() {
    if (!el.isConnected) return;
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 0, on = !!P.cur && real();
    if (!seeking) seek.value = on && dur ? Math.round(audio.currentTime / dur * 1000) : 0;
    seek.style.setProperty('--p', (seek.value / 10) + '%');
    $('#cdp-lcd-n', el).textContent = on && dur ? `${fmt(audio.currentTime)} / ${fmt(dur)}` : '';
  }
  const off = subscribe(paint);
  audio.addEventListener('timeupdate', time);
  audio.addEventListener('durationchange', time);
  new MutationObserver((_, o) => { if (!el.isConnected) { off(); audio.removeEventListener('timeupdate', time); audio.removeEventListener('durationchange', time); closeMenu(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
  seek.addEventListener('input', () => { seeking = true; seek.style.setProperty('--p', (seek.value / 10) + '%'); });
  seek.addEventListener('change', () => { const dur = audio.duration; if (dur && isFinite(dur)) audio.currentTime = seek.value / 1000 * dur; seeking = false; });
  input.addEventListener('change', () => { const files = input.files; if (files && files.length) addFiles(files); input.value = ''; });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-add]')) { unlock(); sound.play('click'); input.click(); return; }
    if (e.target.closest('[data-newlist]')) { createList(); return; }
    const tm = e.target.closest('[data-tm]'); if (tm) { if (menuEl && menuEl._back === tm) closeMenu(); else trackMenu(tm, tm.dataset.tm); return; }
    const lm = e.target.closest('#cdp-lmenu'); if (lm) { if (menuEl && menuEl._back === lm) closeMenu(); else listMenu(lm); return; }
    const c = e.target.closest('[data-disc]');
    if (c) { const same = P.disc && P.disc.id === c.dataset.disc; if (same && P.cur && idx() >= 0) toggle(); else loadDisc(c.dataset.disc, true); return; }
    const t = e.target.closest('[data-t]'); if (t) { playTrack(+t.dataset.t); return; }
    const p = e.target.closest('[data-p]'); if (!p) return;
    if (p.dataset.p === 'toggle') toggle();
    if (p.dataset.p === 'next') { if (P.cur || P.list.length) next(); else toggle(); }
    if (p.dataset.p === 'prev') { if (P.cur) prev(); }
  });
  // drop files straight onto the window on a computer
  el.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('is-drop'); } });
  el.addEventListener('dragleave', e => { if (e.target === el) el.classList.remove('is-drop'); });
  el.addEventListener('drop', e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); el.classList.remove('is-drop'); addFiles(e.dataTransfer.files); });
  paint(); time();
  return m;
}
refresh();
// test hook (automated checks only)
window.__cd = { P, audio, loadDisc, playTrack, next, toggle, refresh, addFiles };
