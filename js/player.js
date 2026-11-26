// CD PLAYER: the visitor's own music. Songs are loaded from the phone or computer and kept in
// this browser only (js/music.js), so everyone hears just the songs they added themselves.
// Songs of one album (two or more with the same album tag) make their own disc; the rest go
// on "Мой микс". The music keeps playing while you move between sections; a small spinning
// disc in the taskbar controls it.
import { $, $$, esc, ICON, openModal, confirmBox, hashStr, plural, sound } from './util.js';
import { ACCEPT, listTracks, getSound, removeTrack, addFile, problem, keepSafe } from './music.js';

const SILENT = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const LOOKS = [
  { bg: '#FFB8D9', ink: '#000', ac: '#E8291F', pat: 'hearts' }, { bg: '#244EE7', ink: '#fff', ac: '#CFE0FF', pat: 'grid' },
  { bg: '#FFD84A', ink: '#000', ac: '#244EE7', pat: 'dots' }, { bg: '#000000', ink: '#FFB8D9', ac: '#FFB8D9', pat: 'stripes' },
  { bg: '#E8291F', ink: '#fff', ac: '#FFD84A', pat: 'bolts' }, { bg: '#CFE0FF', ink: '#000', ac: '#E8291F', pat: 'sun' }
];

const P = { tracks: [], discs: [], disc: null, list: [], i: -1, playing: false, error: '', note: '', busy: false, unlocked: false, modal: null, loaded: false, fails: 0, url: '', token: 0 };
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
const subs = new Set();
const emit = () => { subs.forEach(f => f()); renderMini(); media(); };

/* ---------- the shelf: songs grouped into discs ---------- */
function makeDisc(id, title, tracks) {
  const artists = [...new Set(tracks.map(t => t.artist).filter(Boolean))];
  return { id, title, tracks, artist: artists.length === 1 ? artists[0] : '', mix: artists.length !== 1, cover: (tracks.find(t => t.cover) || {}).cover || '', ...LOOKS[hashStr(id) % LOOKS.length] };
}
function shelf(tracks) {
  const albums = new Map();
  tracks.forEach(t => { const k = (t.album || '').toLowerCase(); if (k) { if (!albums.has(k)) albums.set(k, []); albums.get(k).push(t); } });
  const discs = [], onDisc = new Set();
  for (const [k, list] of albums) {
    if (list.length < 2) continue;
    list.sort((a, b) => (parseInt(a.no, 10) || 999) - (parseInt(b.no, 10) || 999) || a.added - b.added);
    discs.push(makeDisc('album:' + k, list[0].album, list)); list.forEach(t => onDisc.add(t.id));
  }
  const loose = tracks.filter(t => !onDisc.has(t.id));
  if (loose.length) discs.unshift(makeDisc('mix', 'Мой микс', loose));
  return discs;
}
let loading = null;
export function refresh() {
  loading = listTracks().then(tracks => {
    P.tracks = tracks; P.discs = shelf(tracks); P.loaded = true;
    // keep the song that is playing right now in its (rebuilt) disc
    const cur = P.i >= 0 ? P.list[P.i] : null;
    if (P.disc) {
      const d = (cur && P.discs.find(x => x.tracks.some(t => t.id === cur.id))) || P.discs.find(x => x.id === P.disc.id) || null;
      P.disc = d; P.list = d ? d.tracks : [];
      P.i = d && cur ? d.tracks.findIndex(t => t.id === cur.id) : -1;
      if (!d) stopAll();
    }
    emit();
    return P.discs;
  }).catch(() => { P.loaded = true; P.error = 'Этот браузер не даёт хранить музыку. Попробуй другой браузер или выйди из режима инкогнито.'; emit(); return []; });
  return loading;
}
// up to three discs for the stack on the desk
export async function myDiscs() { await (loading || refresh()); return P.discs; }

/* ---------- playback ---------- */
// iPhone: audio may only start inside a tap. The first tap plays a silent sound, after that the element is free.
function unlock() {
  if (P.unlocked) return;
  P.unlocked = true;
  try { audio.src = SILENT; const p = audio.play(); if (p) p.catch(() => {}); } catch (e) { /* fine */ }
}
function stopAll() {
  audio.pause(); P.playing = false; P.i = -1;
  if (P.url) { URL.revokeObjectURL(P.url); P.url = ''; }
}
export function loadDisc(id, autoplay = true) {
  const disc = P.discs.find(d => d.id === id); if (!disc) return;
  unlock();
  P.disc = disc; P.list = disc.tracks; P.i = -1; P.error = ''; P.fails = 0;
  if (autoplay) playTrack(0); else { audio.pause(); P.playing = false; emit(); }
}
export async function playTrack(i) {
  if (!P.list.length) return;
  unlock();
  P.i = (i + P.list.length) % P.list.length;
  const t = P.list[P.i], token = ++P.token;
  P.playing = true; P.error = ''; emit();
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
  if (P.fails >= Math.max(1, P.list.length)) { audio.pause(); P.playing = false; P.error = 'Песни этого диска не играют в этом браузере. Попробуй файлы mp3 или m4a.'; emit(); return; }
  P.error = msg || 'Эта песня не играет в браузере, включаю следующую.'; emit();
  const at = P.i;
  setTimeout(() => { if (P.i === at) next(); }, 900);
}
export function toggle() {
  if (P.i < 0) { if (P.list.length) playTrack(0); else if (P.discs.length) loadDisc(P.discs[0].id, true); return; }
  if (audio.paused) { unlock(); P.error = ''; audio.play().catch(() => {}); P.playing = true; }
  else { audio.pause(); P.playing = false; }
  emit();
}
export function next() {
  if (P.i < P.list.length - 1) { playTrack(P.i + 1); return; }
  // end of the disc: the next disc in the stack goes in (or this one again)
  if (!P.discs.length) return;
  const k = P.discs.indexOf(P.disc);
  loadDisc(P.discs[(k + 1) % P.discs.length].id, true);
}
export function prev() { if (audio.currentTime > 3 || P.i <= 0) { audio.currentTime = 0; return; } playTrack(P.i - 1); }
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };
export const nowPlaying = () => (P.i >= 0 ? P.list[P.i] : null);
const real = () => audio.src && audio.src !== SILENT;
audio.addEventListener('ended', () => { if (real() && P.i >= 0) next(); });
audio.addEventListener('pause', () => { if (P.playing && real() && !audio.ended) { P.playing = false; emit(); } });
audio.addEventListener('play', () => { if (real() && !P.playing && P.i >= 0) { P.playing = true; emit(); } });
audio.addEventListener('error', () => { if (real() && P.i >= 0) fail(); });
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
  P.note = added ? `Добавлено: ${added} ${plural(added, ['песня', 'песни', 'песен'])}.` : '';
  P.error = bad.length ? `Не добавились ${bad.join('; ')}.` : '';
  if (added) keepSafe();
  await refresh();
  if (added && firstNew && !P.playing) {
    const d = P.discs.find(x => x.tracks.some(t => t.id === firstNew.id));
    if (d) { P.disc = d; P.list = d.tracks; playTrack(d.tracks.findIndex(t => t.id === firstNew.id)); }
  }
  setTimeout(() => { if (!P.busy && P.note) { P.note = ''; emit(); } }, 5000);
}
export async function deleteTrack(id) {
  const t = P.tracks.find(x => x.id === id); if (!t) return;
  if (!(await confirmBox('Удалить песню?', `«${t.title}» пропадёт из плеера в этом браузере.`, 'Удалить'))) return;
  const cur = nowPlaying();
  if (cur && cur.id === id) { P.token++; stopAll(); }
  try { await removeTrack(id); } catch (e) { P.error = 'Не получилось удалить песню.'; }
  await refresh();
}

/* ---------- taskbar mini player ---------- */
export function renderMini() {
  const host = document.getElementById('tb-cd'); if (!host) return;
  const t = nowPlaying();
  if (!P.disc) { host.innerHTML = ''; return; }
  host.innerHTML = `<button class="tb-cd${P.playing ? ' is-playing' : ''}" type="button" data-cd="open" title="CD-плеер" aria-label="CD-плеер${t ? `: ${esc(t.title)}${t.artist ? `, ${esc(t.artist)}` : ''}` : ''}"><i class="tb-cd__disc" style="--l:${P.disc.bg}" aria-hidden="true"></i><span class="tb-cd__t">${t ? esc(t.title) : esc(P.disc.title)}</span></button>
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
  return `<span class="jewel jewel--${d.pat} ${cls}${art}" aria-hidden="true">
    <span class="jewel__tray"><span class="cdisc" style="--l:${d.bg};--li:${d.ink}"><b>${esc(short(d.title, 14))}</b></span></span>
    <span class="jewel__lid"><span class="jewel__art"><b>${esc(short(d.title, 28))}</b><small>${d.mix ? `${d.tracks.length} ${plural(d.tracks.length, ['песня', 'песни', 'песен'])}` : esc(short(d.artist, 26))}</small></span></span>
    <span class="jewel__spine"></span></span>`;
}
const addCase = `<li><button class="cdp__case cdp__add" type="button" data-add aria-label="Загрузить свою музыку"><span class="jewel jewel--empty" aria-hidden="true"><span class="jewel__art"><i>+</i><small>mp3, m4a, wav</small></span></span><span class="cdp__name">Загрузить музыку</span></button></li>`;
export function openPlayer() {
  if (P.modal && document.body.contains(P.modal.el)) return;
  if (!P.loaded) refresh();
  const m = openModal(`<div class="cdp">
      <div class="cdp__shelf"><h2 class="cdp__h">Диски</h2><p class="cdp__sub">Твоя музыка. Загрузи песни с телефона или компьютера: они хранятся только в этом браузере и играют только у тебя.</p>
        <input type="file" id="cdp-file" accept="${ACCEPT}" multiple hidden>
        <ul class="cdp__cases" id="cdp-cases"></ul></div>
      <div class="cdp__deck">
        <div class="discman" id="cdp-man"><div class="discman__win"><span class="cdisc cdisc--big" id="cdp-cd"><b></b></span></div>
          <div class="discman__lcd" aria-live="polite"><span id="cdp-lcd-t">ВСТАВЬ ДИСК</span><span id="cdp-lcd-n"></span></div></div>
        <div class="cdp__ctl"><button class="cdp__btn" type="button" data-p="prev" aria-label="Предыдущая песня">⏮</button><button class="cdp__btn cdp__btn--play" type="button" data-p="toggle" id="cdp-pp" aria-label="Играть">▶</button><button class="cdp__btn" type="button" data-p="next" aria-label="Следующая песня">⏭</button></div>
        <input class="cdp__seek" id="cdp-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Перемотка">
        <p class="cdp__note" id="cdp-note" role="status"></p>
        <p class="cdp__msg" id="cdp-msg" role="alert"></p>
        <div class="cdp__empty" id="cdp-empty" hidden><p>Плеер пока пустой. Добавь первые песни, и он сам заиграет.</p><button class="btn btn--primary" type="button" data-add>Загрузить музыку</button></div>
        <ol class="cdp__tracks" id="cdp-tracks"></ol>
        <p class="cdp__credit">Песни никуда не отправляются: их слышишь только ты на этом устройстве. На iPhone выбирай файлы в «Файлах»: песни из приложения «Музыка» браузеру недоступны.</p>
      </div></div>`, { label: 'CD-плеер', wide: true });
  P.modal = m;
  const el = m.el, input = $('#cdp-file', el), seek = $('#cdp-seek', el);
  let seeking = false, shelfKey = '';
  function paint() {
    if (!el.isConnected) { off(); return; }
    const t = nowPlaying(), d = P.disc;
    const key = P.discs.map(x => x.id + ':' + x.tracks.length).join('|') + '#' + (d ? d.id : '');
    if (key !== shelfKey) {
      shelfKey = key;
      $('#cdp-cases', el).innerHTML = addCase + P.discs.map(x => `<li><button class="cdp__case" type="button" data-disc="${esc(x.id)}" aria-label="Диск «${esc(x.title)}»${x.artist ? `, ${esc(x.artist)}` : ''}">${caseHTML(x)}<span class="cdp__name">${esc(x.title)}</span></button></li>`).join('');
    }
    $$('.cdp__case[data-disc]', el).forEach(b => { const on = d && b.dataset.disc === d.id; b.classList.toggle('is-open', !!on); b.setAttribute('aria-pressed', String(!!on)); });
    const cd = $('#cdp-cd', el);
    cd.style.cssText = d ? `--l:${d.bg};--li:${d.ink}` : '';
    cd.classList.toggle('is-empty', !d); $('b', cd).textContent = d ? short(d.title, 16) : '';
    $('#cdp-man', el).classList.toggle('is-playing', P.playing);
    $('#cdp-lcd-t', el).textContent = P.busy ? 'ЗАПИСЫВАЮ…' : t ? `${String(P.i + 1).padStart(2, '0')}  ${t.title}` : d ? 'ГОТОВ' : P.discs.length ? 'ВЫБЕРИ ДИСК' : 'ЗАГРУЗИ МУЗЫКУ';
    $('#cdp-pp', el).textContent = P.playing ? '❚❚' : '▶';
    $('#cdp-pp', el).setAttribute('aria-label', P.playing ? 'Пауза' : 'Играть');
    $('#cdp-note', el).textContent = P.note;
    $('#cdp-msg', el).textContent = P.error;
    $('#cdp-empty', el).hidden = !P.loaded || P.discs.length > 0 || P.busy;
    seek.disabled = !t;
    $('#cdp-tracks', el).innerHTML = P.list.map((x, k) => `<li><button class="cdp__track${k === P.i ? ' is-on' : ''}" type="button" data-t="${k}" ${k === P.i ? 'aria-current="true"' : ''}><span class="cdp__n">${String(k + 1).padStart(2, '0')}</span><span class="cdp__tt"><b>${esc(x.title)}</b>${x.artist ? `<small>${esc(x.artist)}</small>` : ''}</span></button><button class="cdp__del" type="button" data-del="${esc(x.id)}" aria-label="Удалить «${esc(x.title)}»" title="Удалить песню">${ICON.close || '×'}</button></li>`).join('');
  }
  function time() {
    if (!el.isConnected) return;
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 0, on = P.i >= 0 && real();
    if (!seeking) seek.value = on && dur ? Math.round(audio.currentTime / dur * 1000) : 0;
    seek.style.setProperty('--p', (seek.value / 10) + '%');
    $('#cdp-lcd-n', el).textContent = on && dur ? `${fmt(audio.currentTime)} / ${fmt(dur)}` : '';
  }
  const off = subscribe(paint);
  audio.addEventListener('timeupdate', time);
  audio.addEventListener('durationchange', time);
  const stop = () => { off(); audio.removeEventListener('timeupdate', time); audio.removeEventListener('durationchange', time); };
  new MutationObserver((_, o) => { if (!el.isConnected) { stop(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
  seek.addEventListener('input', () => { seeking = true; seek.style.setProperty('--p', (seek.value / 10) + '%'); });
  seek.addEventListener('change', () => { const dur = audio.duration; if (dur && isFinite(dur)) audio.currentTime = seek.value / 1000 * dur; seeking = false; });
  input.addEventListener('change', () => { const files = input.files; if (files && files.length) addFiles(files); input.value = ''; });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-add]')) { unlock(); sound.play('click'); input.click(); return; }
    const del = e.target.closest('[data-del]'); if (del) { deleteTrack(del.dataset.del); return; }
    const c = e.target.closest('[data-disc]'); if (c) { if (!P.disc || P.disc.id !== c.dataset.disc) loadDisc(c.dataset.disc, true); else toggle(); return; }
    const t = e.target.closest('[data-t]'); if (t) { playTrack(+t.dataset.t); return; }
    const p = e.target.closest('[data-p]'); if (!p) return;
    if (p.dataset.p === 'toggle') toggle();
    if (p.dataset.p === 'next') { if (P.disc) next(); else toggle(); }
    if (p.dataset.p === 'prev') { if (P.disc) prev(); }
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
