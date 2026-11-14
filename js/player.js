// CD PLAYER: a stack of discs on the desk. Pick a jewel case, the disc goes into the Discman,
// and official 30-second previews (Apple Music catalogue) play right on the site, one after another.
// The music keeps playing while you move between sections; a small spinning disc in the taskbar controls it.
import { $, $$, esc, ICON, openModal, lsGet, lsSet, reducedMotion } from './util.js';

export const DISCS = [
  { id: 'britney', title: 'Бритни', artist: 'Britney Spears', bg: '#FFB8D9', ink: '#000', ac: '#E8291F', pat: 'hearts',
    tracks: ['...Baby One More Time', 'Oops!... I Did It Again', 'Lucky', 'Stronger', "I'm a Slave 4 U", 'Toxic', 'Everytime', 'Gimme More', 'Womanizer', 'Circus', 'Till the World Ends'] },
  { id: 'aguilera', title: 'Агилера', artist: 'Christina Aguilera', bg: '#E8291F', ink: '#fff', ac: '#FFD84A', pat: 'bolts',
    tracks: ['Genie in a Bottle', 'What a Girl Wants', 'Come On Over Baby (All I Want Is You)', 'Dirrty', 'Beautiful', 'Fighter', "Ain't No Other Man", 'Candyman'] },
  { id: 'nsync', title: 'NSYNC', artist: '*NSYNC', bg: '#244EE7', ink: '#fff', ac: '#CFE0FF', pat: 'grid',
    tracks: ['Bye Bye Bye', "It's Gonna Be Me", 'This I Promise You', 'Pop', 'Gone', 'Girlfriend'] },
  { id: 'avril', title: 'Аврил', artist: 'Avril Lavigne', bg: '#000000', ink: '#FFB8D9', ac: '#FFB8D9', pat: 'stripes',
    tracks: ['Complicated', 'Sk8er Boi', "I'm with You", 'My Happy Ending', "Nobody's Home", 'Girlfriend', "When You're Gone", 'What the Hell', "Here's to Never Growing Up"] },
  { id: 'hits00', title: 'Хиты 2000-х', bg: '#FFD84A', ink: '#000', ac: '#244EE7', pat: 'dots', mix: true,
    tracks: [['Beyoncé', 'Crazy in Love'], ['Gwen Stefani', 'Hollaback Girl'], ['Kelly Clarkson', 'Since U Been Gone'], ['Nelly Furtado', 'Promiscuous'], ['Justin Timberlake', 'SexyBack'], ['Rihanna', 'Umbrella'], ['Lady Gaga', 'Poker Face'], ['Katy Perry', 'Hot N Cold']] },
  { id: 'hits10', title: 'Хиты 2010-х', bg: '#CFE0FF', ink: '#000', ac: '#E8291F', pat: 'sun', mix: true,
    tracks: [['Kesha', 'TiK ToK'], ['Katy Perry', 'Firework'], ['Bruno Mars', 'Just the Way You Are'], ['Rihanna', 'We Found Love'], ['Carly Rae Jepsen', 'Call Me Maybe'], ['One Direction', 'What Makes You Beautiful'], ['Taylor Swift', 'Shake It Off'], ['Ariana Grande', 'Problem']] }
];
const API = 'https://itunes.apple.com/search';
const TTL = 3 * 864e5;
const SILENT = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

const P = { disc: null, list: [], i: -1, playing: false, loading: false, error: '', unlocked: false, modal: null };
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
const subs = new Set();
const emit = () => { subs.forEach(f => f()); renderMini(); media(); };

/* ---------- catalogue lookup (JSONP, so it works from any static host) ---------- */
let cbn = 0;
function jsonp(params) {
  return new Promise((res, rej) => {
    const name = `__cd${++cbn}_${Date.now().toString(36)}`;
    const s = document.createElement('script');
    const t = setTimeout(() => done(new Error('timeout')), 12000);
    function done(err, data) { clearTimeout(t); try { delete window[name]; } catch (e) { window[name] = undefined; } s.remove(); err ? rej(err) : res(data); }
    window[name] = d => done(null, d);
    s.onerror = () => done(new Error('net'));
    s.src = `${API}?${new URLSearchParams({ ...params, media: 'music', entity: 'song', country: 'us', callback: name })}`;
    document.head.appendChild(s);
  });
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const SKIP = /karaoke|instrumental|remix|\blive\b|acoustic|re-?recorded|tribute|made famous|originally performed|cover|edit\)|mix\)|version\)/i;
function best(results, artist, title) {
  const a = norm(artist), t = norm(title);
  const ok = (results || []).filter(r => r.previewUrl && r.kind === 'song' && norm(r.artistName).includes(a) && norm(r.trackName).startsWith(t) && (SKIP.test(title) || !SKIP.test(r.trackName + ' ' + (r.collectionName || ''))));
  ok.sort((x, y) => String(x.releaseDate).localeCompare(String(y.releaseDate)));
  const r = ok[0];
  return r ? { title: r.trackName, artist: r.artistName, src: r.previewUrl, url: r.trackViewUrl || '', year: String(r.releaseDate || '').slice(0, 4) } : null;
}
async function resolve(disc) {
  const cached = lsGet('bg.cd.' + disc.id, null);
  if (cached && Date.now() - cached.t < TTL && cached.list.length) return cached.list;
  let list;
  if (disc.mix) {
    list = await Promise.all(disc.tracks.map(([artist, title]) => jsonp({ term: `${artist} ${title}`, limit: 15 }).then(d => best(d.results, artist, title)).catch(() => null)));
  } else {
    const d = await jsonp({ term: disc.artist.replace('*', ''), attribute: 'artistTerm', limit: 200 });
    list = disc.tracks.map(title => best(d.results, disc.artist, title));
    // a hit missing from the artist's top 200: ask for it by name (at most three extra requests)
    const missing = list.map((x, k) => x ? -1 : k).filter(k => k >= 0).slice(0, 3);
    await Promise.all(missing.map(k => jsonp({ term: `${disc.artist.replace('*', '')} ${disc.tracks[k]}`, limit: 15 }).then(r => { list[k] = best(r.results, disc.artist, disc.tracks[k]); }).catch(() => {})));
  }
  list = list.filter(Boolean);
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
  P.disc = disc; P.list = []; P.i = -1; P.loading = true; P.error = ''; P.playing = false;
  emit();
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
  audio.src = P.list[P.i].src;
  const p = audio.play();
  P.playing = true; P.error = '';
  if (p) p.catch(() => { P.playing = false; emit(); });
  emit();
}
export function toggle() {
  if (P.i < 0) { if (P.list.length) playTrack(0); return; }
  if (audio.paused) { unlock(); audio.play().catch(() => {}); P.playing = true; } else { audio.pause(); P.playing = false; }
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
audio.addEventListener('error', () => { if (audio.src && audio.src !== SILENT && P.i >= 0) { P.error = 'Этот отрывок не загрузился, включаю следующий.'; emit(); setTimeout(next, 900); } });

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
window.__cd = { P, audio, DISCS, loadDisc, playTrack, next, toggle };
