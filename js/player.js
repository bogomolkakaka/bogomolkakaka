// CD PLAYER: a stack of discs on the desk. Pick a jewel case, the disc goes into the Discman,
// and official 30-second previews (Apple Music catalogue) play right on the site, one after another.
// The music keeps playing while you move between sections; a small spinning disc in the taskbar controls it.
import { $, $$, esc, ICON, openModal, lsGet, lsSet, reducedMotion } from './util.js';

import { DISCS, lookupDisc } from './discs.js';
export { DISCS };
const API = 'https://itunes.apple.com/search';
const TTL = 3 * 864e5;
const SILENT = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

const P = { disc: null, list: [], i: -1, playing: false, loading: false, error: '', unlocked: false, modal: null, started: false, fails: 0, wd: 0, wdMs: 15000 };
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
const subs = new Set();
const emit = () => { subs.forEach(f => f()); renderMini(); media(); };

/* ---------- the song lists ----------
   data/discs.json is built on GitHub's servers once a month (scripts/build-discs.mjs), because the
   Apple catalogue often does not open from Russia. The browser only falls back to asking Apple
   itself when that file is missing. */
let READY = null;
const ready = fetch('data/discs.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null))
  .then(j => { READY = (j && j.discs) || {}; })
  .catch(() => { READY = {}; });
const readyList = disc => (READY && READY[disc.id] && READY[disc.id].length ? READY[disc.id] : null);

let cbn = 0;
function jsonp(params) {
  return new Promise((res, rej) => {
    const name = `__cd${++cbn}_${Date.now().toString(36)}`;
    const s = document.createElement('script');
    const t = setTimeout(() => done(new Error('timeout')), 8000);
    function done(err, data) { clearTimeout(t); try { delete window[name]; } catch (e) { window[name] = undefined; } s.remove(); err ? rej(err) : res(data); }
    window[name] = d => done(null, d);
    s.onerror = () => done(new Error('net'));
    s.src = `${API}?${new URLSearchParams({ ...params, media: 'music', entity: 'song', country: 'us', callback: name })}`;
    document.head.appendChild(s);
  });
}
async function resolve(disc) {
  await ready;
  const have = readyList(disc);
  if (have) return have;
  const cached = lsGet('bg.cd.' + disc.id, null);
  if (cached && Date.now() - cached.t < TTL && cached.list.length) return cached.list;
  let failed = 0;
  const list = await lookupDisc(disc, params => jsonp(params).then(d => d.results || []).catch(e => { if (++failed > 1) throw e; return []; }));
  if (list.length) lsSet('bg.cd.' + disc.id, { t: Date.now(), list });
  return list;
}

/* ---------- playback ---------- */
// iPhone: audio may only start inside a tap. The first tap plays a silent sound, after that the element is free.
function unlock() {
  if (P.unlocked) return;
  P.unlocked = true;
  try { audio.src = SILENT; const p = audio.play(); if (p) p.catch(() => {}); } catch (e) { /* fine */ }
}
export async function loadDisc(id, autoplay = true) {
  const disc = DISCS.find(d => d.id === id); if (!disc) return;
  unlock();
  P.disc = disc; P.list = []; P.i = -1; P.error = ''; P.playing = false;
  // the ready list is already in memory: start right inside the tap, iPhone likes that best
  const have = readyList(disc);
  if (have) { P.list = have; P.loading = false; if (autoplay) playTrack(0); else emit(); return; }
  P.loading = true; emit();
  try {
    const list = await resolve(disc);
    if (P.disc !== disc) return;
    P.list = list; P.loading = false;
    if (!list.length) { P.error = 'Не получилось найти песни этого диска. Проверь интернет и попробуй ещё раз.'; emit(); return; }
    if (autoplay) playTrack(0); else emit();
  } catch (e) {
    if (P.disc !== disc) return;
    P.loading = false; P.error = 'Каталог песен не ответил. Проверь интернет и попробуй ещё раз.'; emit();
  }
}
export function playTrack(i) {
  if (!P.list.length) return;
  unlock();
  P.i = (i + P.list.length) % P.list.length;
  const src = P.list[P.i].src;
  audio.src = src;
  P.playing = true; P.error = ''; P.started = false;
  watch(src);
  const p = audio.play();
  if (p) p.catch(e => {
    if (audio.src !== src) return;
    clearTimeout(P.wd);
    P.playing = false;
    // the browser wants a tap first: one press on play is enough
    if (e && e.name === 'NotAllowedError') P.error = 'Нажми ▶, чтобы включить музыку.';
    emit();
  });
  emit();
}
// a song that neither plays nor fails (the connection just hangs) counts as failed after a while
function watch(src) {
  clearTimeout(P.wd);
  P.wd = setTimeout(() => { if (audio.src === src && P.playing && !P.started) fail(); }, P.wdMs);
}
function fail() {
  clearTimeout(P.wd);
  P.fails++;
  if (P.fails >= 3) {
    audio.pause(); P.playing = false;
    P.error = 'Отрывки сейчас не загружаются: сервер Apple Music не отвечает из твоей сети. Попробуй чуть позже или с другим интернетом.';
    emit(); return;
  }
  P.error = 'Этот отрывок не загрузился, включаю следующий.'; emit();
  const at = P.i;
  setTimeout(() => { if (P.i === at && P.fails && P.fails < 3) next(); }, 900);
}
export function toggle() {
  if (P.i < 0) { if (P.list.length) playTrack(0); return; }
  if (audio.paused) {
    unlock(); P.error = '';
    if (P.fails >= 3) { P.fails = 0; playTrack(P.i); return; }
    audio.play().catch(() => {}); P.playing = true;
    if (!P.started) watch(audio.src);
  } else { audio.pause(); P.playing = false; }
  emit();
}
export function next() {
  if (P.i < P.list.length - 1) { playTrack(P.i + 1); return; }
  // end of the disc: the next disc in the stack goes in
  const k = DISCS.indexOf(P.disc);
  loadDisc(DISCS[(k + 1) % DISCS.length].id, true);
}
export function prev() { if (audio.currentTime > 3 || P.i === 0) { audio.currentTime = 0; return; } playTrack(P.i - 1); }
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };
export const nowPlaying = () => (P.i >= 0 ? P.list[P.i] : null);
audio.addEventListener('ended', () => { if (audio.src !== SILENT && P.i >= 0) next(); });
audio.addEventListener('pause', () => { if (P.playing && audio.src !== SILENT && !audio.ended) { P.playing = false; emit(); } });
audio.addEventListener('play', () => { if (audio.src !== SILENT && !P.playing) { P.playing = true; emit(); } });
audio.addEventListener('error', () => { if (audio.src && audio.src !== SILENT && P.i >= 0) fail(); });
audio.addEventListener('playing', () => { if (audio.src === SILENT) return; P.started = true; P.fails = 0; clearTimeout(P.wd); if (P.error) { P.error = ''; emit(); } });

// lock screen and headphone buttons on phones
function media() {
  if (!('mediaSession' in navigator)) return;
  const t = nowPlaying();
  try {
    navigator.mediaSession.metadata = t ? new MediaMetadata({ title: t.title, artist: t.artist, album: P.disc ? P.disc.title : '' }) : null;
    navigator.mediaSession.playbackState = P.playing ? 'playing' : 'paused';
  } catch (e) { /* older browsers */ }
}
if ('mediaSession' in navigator) {
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
  set('play', () => toggle()); set('pause', () => toggle()); set('nexttrack', () => next()); set('previoustrack', () => prev());
}

/* ---------- taskbar mini player ---------- */
export function renderMini() {
  const host = document.getElementById('tb-cd'); if (!host) return;
  const t = nowPlaying();
  if (!P.disc) { host.innerHTML = ''; return; }
  host.innerHTML = `<button class="tb-cd${P.playing ? ' is-playing' : ''}" type="button" data-cd="open" title="CD-плеер" aria-label="CD-плеер${t ? `: ${esc(t.title)}, ${esc(t.artist)}` : ''}"><i class="tb-cd__disc" style="--l:${P.disc.bg}" aria-hidden="true"></i><span class="tb-cd__t">${t ? esc(t.title) : esc(P.disc.title)}</span></button>
    <button class="tb-icon tb-cd__pp" type="button" data-cd="toggle" aria-label="${P.playing ? 'Пауза' : 'Играть'}">${P.playing ? ICON.pause || '❚❚' : ICON.play || '▶'}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cd]'); if (!b) return;
  if (b.dataset.cd === 'open') openPlayer();
  if (b.dataset.cd === 'toggle') toggle();
});

/* ---------- the player window ---------- */
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function caseHTML(d, cls = '') {
  return `<span class="jewel jewel--${d.pat} ${cls}" style="--bg:${d.bg};--ink:${d.ink};--ac:${d.ac}" aria-hidden="true">
    <span class="jewel__tray"><span class="cdisc" style="--l:${d.bg};--li:${d.ink}"><b>${esc(d.title)}</b></span></span>
    <span class="jewel__lid"><span class="jewel__art"><b>${esc(d.title)}</b>${d.mix ? '<small>сборник</small>' : `<small>${esc(d.artist.replace('*', ''))}</small>`}</span></span>
    <span class="jewel__spine"></span></span>`;
}
export function openPlayer() {
  if (P.modal && document.body.contains(P.modal.el)) return;
  const m = openModal(`<div class="cdp">
      <div class="cdp__shelf"><h2 class="cdp__h">Диски</h2><p class="cdp__sub">Поп 2000-х и 2010-х. Выбери диск — он сам заиграет.</p>
        <ul class="cdp__cases">${DISCS.map(d => `<li><button class="cdp__case" type="button" data-disc="${d.id}" aria-label="Диск «${esc(d.title)}»${d.mix ? '' : `, ${esc(d.artist.replace('*', ''))}`}">${caseHTML(d)}<span class="cdp__name">${esc(d.title)}</span></button></li>`).join('')}</ul></div>
      <div class="cdp__deck">
        <div class="discman" id="cdp-man"><div class="discman__win"><span class="cdisc cdisc--big" id="cdp-cd"><b></b></span></div>
          <div class="discman__lcd" aria-live="polite"><span id="cdp-lcd-t">ВСТАВЬ ДИСК</span><span id="cdp-lcd-n"></span></div></div>
        <div class="cdp__ctl"><button class="cdp__btn" type="button" data-p="prev" aria-label="Предыдущая песня">⏮</button><button class="cdp__btn cdp__btn--play" type="button" data-p="toggle" id="cdp-pp" aria-label="Играть">▶</button><button class="cdp__btn" type="button" data-p="next" aria-label="Следующая песня">⏭</button></div>
        <div class="cdp__bar" aria-hidden="true"><i id="cdp-bar"></i></div>
        <p class="cdp__msg" id="cdp-msg" role="status"></p>
        <ol class="cdp__tracks" id="cdp-tracks"></ol>
        <p class="cdp__credit">Официальные отрывки по 30 секунд из каталога Apple Music, потом сама включается следующая песня.</p>
      </div></div>`, { label: 'CD-плеер', wide: true });
  P.modal = m;
  const el = m.el;
  function paint() {
    if (!el.isConnected) { off(); return; }
    const t = nowPlaying(), d = P.disc;
    $$('.cdp__case', el).forEach(b => { const on = d && b.dataset.disc === d.id; b.classList.toggle('is-open', !!on); b.setAttribute('aria-pressed', String(!!on)); });
    const cd = $('#cdp-cd', el);
    cd.style.cssText = d ? `--l:${d.bg};--li:${d.ink}` : '';
    cd.classList.toggle('is-empty', !d); $('b', cd).textContent = d ? d.title : '';
    $('#cdp-man', el).classList.toggle('is-playing', P.playing);
    $('#cdp-lcd-t', el).textContent = P.loading ? 'ЧИТАЮ ДИСК…' : t ? `${String(P.i + 1).padStart(2, '0')}  ${t.title}` : d ? 'ГОТОВ' : 'ВСТАВЬ ДИСК';
    $('#cdp-pp', el).textContent = P.playing ? '❚❚' : '▶';
    $('#cdp-pp', el).setAttribute('aria-label', P.playing ? 'Пауза' : 'Играть');
    $('#cdp-msg', el).textContent = P.error;
    $('#cdp-tracks', el).innerHTML = P.list.map((x, k) => `<li><button class="cdp__track${k === P.i ? ' is-on' : ''}" type="button" data-t="${k}" ${k === P.i ? 'aria-current="true"' : ''}><span class="cdp__n">${String(k + 1).padStart(2, '0')}</span><span class="cdp__tt"><b>${esc(x.title)}</b>${d && d.mix ? `<small>${esc(x.artist)}</small>` : ''}</span><span class="cdp__y">${esc(x.year)}</span></button>${x.url ? `<a class="cdp__am" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" aria-label="«${esc(x.title)}» целиком в Apple Music">↗</a>` : ''}</li>`).join('');
  }
  function time() {
    if (!el.isConnected) return;
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 30;
    $('#cdp-bar', el).style.width = (P.i >= 0 ? Math.min(100, audio.currentTime / dur * 100) : 0) + '%';
    $('#cdp-lcd-n', el).textContent = P.i >= 0 && audio.src !== SILENT ? `${fmt(audio.currentTime)} / ${fmt(dur)}` : '';
  }
  const off = subscribe(paint);
  audio.addEventListener('timeupdate', time);
  const stop = () => { off(); audio.removeEventListener('timeupdate', time); };
  new MutationObserver((_, o) => { if (!el.isConnected) { stop(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
  el.addEventListener('click', e => {
    const c = e.target.closest('[data-disc]'); if (c) { if (!P.disc || P.disc.id !== c.dataset.disc) loadDisc(c.dataset.disc, true); else toggle(); return; }
    const t = e.target.closest('[data-t]'); if (t) { playTrack(+t.dataset.t); return; }
    const p = e.target.closest('[data-p]'); if (!p) return;
    if (p.dataset.p === 'toggle') { if (!P.disc) loadDisc(DISCS[0].id, true); else toggle(); }
    if (p.dataset.p === 'next') next();
    if (p.dataset.p === 'prev') prev();
  });
  paint(); time();
  return m;
}
// test hook (automated checks only)
window.__cd = { P, audio, DISCS, loadDisc, playTrack, next, toggle, ready };
