import { CONFIG } from './config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

/* ---------- dates in the project time zone ---------- */
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function zoned(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second, key: `${p.year}-${p.month}-${p.day}` };
}
export const todayKey = () => zoned().key;
export function msToNextDay() { const z = zoned(); return ((23 - z.hh) * 3600 + (59 - z.mm) * 60 + (60 - z.ss)) * 1000; }
export function keyToDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
export function addDays(key, n) { const d = keyToDate(key); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function fmtDay(key, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) { return new Intl.DateTimeFormat('ru-RU', { ...opts, timeZone: 'UTC' }).format(keyToDate(key)).replace(/\s?г\.$/, ''); }
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// Russian plural: plural(5, ['штука', 'штуки', 'штук'])
export function plural(n, f) { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; }
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- toast / modal / confirm ---------- */
let toastTimer = 0;
export function toast(text, isError = false) {
  const host = $('#toast-host');
  if (!host) return;
  host.innerHTML = `<div class="toast${isError ? ' is-error' : ''}" role="${isError ? 'alert' : 'status'}">${esc(text)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, isError ? 6000 : 2600);
}
let modalStack = [];
export function openModal(inner, { label = '', wide = false, onClose } = {}) {
  const host = $('#layer-modal');
  const back = document.activeElement;
  const wrap = h(`<div class="modal"><div class="modal__card${wide ? ' modal__card--wide' : ''}" role="dialog" aria-modal="true" ${label ? `aria-label="${esc(label)}"` : ''}>
    <button class="iconbtn modal__x" type="button" data-close aria-label="Закрыть">${ICON.close}</button>${inner}</div></div>`);
  host.appendChild(wrap);
  const entry = { wrap, back, onClose };
  modalStack.push(entry);
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    modalStack = modalStack.filter(e => e !== entry);
    if (onClose) onClose();
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  };
  entry.close = close;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  setTimeout(() => { const f = $('input, textarea, select, .btn', wrap.firstElementChild) || $('[data-close]', wrap); if (f) f.focus(); }, 30);
  return { el: wrap.firstElementChild, close };
}
export function closeTopModal() { modalStack = modalStack.filter(m => m.wrap.isConnected); const e = modalStack[modalStack.length - 1]; if (e) { e.close(); return true; } return false; }
export function confirmBox(title, text, yes = 'Да', no = 'Отмена', danger = true) {
  return new Promise(res => {
    let done = false;
    const m = openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="modal__actions">
      <button class="btn btn--ghost" type="button" data-no>${esc(no)}</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-yes>${esc(yes)}</button></div>`, { label: title, onClose: () => { if (!done) res(false); } });
    $('[data-yes]', m.el).addEventListener('click', () => { done = true; m.close(); res(true); });
    $('[data-no]', m.el).addEventListener('click', () => { done = true; m.close(); res(false); });
    setTimeout(() => $('[data-no]', m.el).focus(), 40);
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) { e.stopImmediatePropagation(); closeTopModal(); } }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !modalStack.length) return;
  const card = modalStack[modalStack.length - 1].wrap.firstElementChild;
  const f = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', card).filter(x => x.offsetParent !== null);
  if (!f.length) return;
  if (!card.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); return; }
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
});

/* ---------- sound: tiny synth, nothing to download ---------- */
export const sound = {
  muted: lsGet('bg.muted', false), ctx: null, listeners: new Set(),
  toggle() { this.muted = !this.muted; lsSet('bg.muted', this.muted); this.listeners.forEach(f => f(this.muted)); if (!this.muted) this.play('pop'); },
  ac() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  tone(f, dur, type = 'square', vol = .05, slide = 0, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur = .08, vol = .08, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, len, ac.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = vol;
    s.connect(g).connect(ac.destination); s.start(ac.currentTime + delay);
  },
  play(name) {
    if (this.muted) return;
    try {
      switch (name) {
        case 'click': this.tone(660, .04, 'triangle', .04); break;
        case 'open': this.tone(520, .06, 'triangle', .05); this.tone(780, .09, 'triangle', .05, 0, .05); break;
        case 'pop': this.tone(880, .06, 'sine', .06, 300); break;
        case 'tick': this.tone(1240, .03, 'square', .03); break;
        case 'shutter': this.noise(.09, .12); this.tone(2200, .02, 'square', .03); break;
        case 'coin': this.tone(988, .05, 'square', .04); this.tone(1319, .12, 'square', .04, 0, .05); break;
        case 'jump': this.tone(320, .12, 'square', .035, 380); break;
        case 'hit': this.tone(200, .28, 'sawtooth', .06, -140); break;
        case 'power': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .09, 'square', .035, 0, i * .06)); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .14, 'triangle', .06, 0, i * .1)); break;
        case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, .2, 'triangle', .06, 0, i * .14)); break;
        case 'paper': this.noise(.05, .05); break;
      }
    } catch (e) { /* audio is optional */ }
  }
};

/* ---------- images ---------- */
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });
}
export async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try { return await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
export async function resizeToBlob(src, max = 1600, type = 'image/jpeg', quality = .86) {
  const img = src instanceof HTMLImageElement || src instanceof HTMLCanvasElement ? src : await fileToImage(src);
  const w = img.naturalWidth || img.width, hgt = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, hgt));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(hgt * s);
  const ctx = cv.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, type, quality));
  if (!blob) throw new Error('encode');
  return { blob, width: cv.width, height: cv.height };
}
export const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- icons ---------- */
const s = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  left: s('<path d="M15 5l-7 7 7 7"/>'),
  right: s('<path d="M9 5l7 7-7 7"/>'),
  back: s('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  pen: s('<path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"/>'),
  trash: s('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  send: s('<path d="M21 3L3 11l7 2 2 7 9-17z"/>'),
  insta: s('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  share: s('<path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6"/>'),
  redo: s('<path d="M4 12a8 8 0 0114-5l2 2M20 4v5h-5M20 12a8 8 0 01-14 5l-2-2M4 20v-5h5"/>'),
  flag: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  rotate: s('<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>'),
  resize: s('<path d="M14 20h6v-6M20 20L12 12M10 4H4v6M4 4l8 8"/>'),
  sound: s('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 010 6M19.5 6.5a8 8 0 010 11"/>'),
  mute: s('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  zoomIn: s('<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/>'),
  zoomOut: s('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>'),
  target: s('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>'),
  upload: s('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
  lock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  eye: s('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: s('<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 4M6.3 6.3C3.7 8 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.6 6.5L21 9.3l-5 4.5 1.5 6.9L12 17l-5.5 3.7L8 13.8 3 9.3l6.4-.8z" fill="currentColor"/></svg>',
  // section icons: small, chunky, 2000s desktop feel
  desk: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="13" rx="3" fill="#244EE7"/><path d="M5 18v3M19 18v3" stroke="#000" stroke-width="2" stroke-linecap="round"/><rect x="5" y="8" width="6" height="5" rx="1" fill="#FFD84A"/><rect x="13" y="8" width="6" height="2" rx="1" fill="#fff"/></svg>',
  booth: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="4" fill="#244EE7"/><circle cx="13" cy="13" r="4.5" fill="#fff"/><circle cx="13" cy="13" r="2.5" fill="#111"/><rect x="5" y="8.5" width="4" height="2.5" rx="1" fill="#fff"/><rect x="7" y="3" width="7" height="4" rx="1" fill="#FFB8D9"/></svg>',
  wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="3" fill="#fff" stroke="#000" stroke-width="1.6"/><rect x="5" y="6" width="6" height="6" rx="1" fill="#FFD84A" transform="rotate(-6 8 9)"/><rect x="13" y="7" width="6" height="7" rx="1" fill="#FFB8D9" transform="rotate(5 16 10)"/><rect x="7" y="13" width="7" height="5" rx="1" fill="#CFE0FF"/><circle cx="8" cy="6" r="1.2" fill="#E8291F"/></svg>',
  run: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3" fill="#FFD84A" stroke="#000" stroke-width="1.4"/><rect x="7.5" y="4.5" width="9" height="7" rx="1" fill="#CFE0FF" stroke="#000" stroke-width="1.2"/><path d="M8 15h3M9.5 13.5v3" stroke="#000" stroke-width="1.6" stroke-linecap="round"/><circle cx="15" cy="16" r="1.4" fill="#E8291F"/></svg>',
  objects: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="20" rx="9" ry="2" fill="#000" opacity=".18"/><path d="M8 4c0 3 .5 5 1 6" stroke="#FF9CC8" stroke-width="2.6" stroke-linecap="round"/><path d="M15 4c0 3-.5 5-1 6" stroke="#FF9CC8" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="11.5" cy="14.5" rx="6" ry="5.5" fill="#FF9CC8"/><circle cx="9.5" cy="14" r="1" fill="#000"/><circle cx="13.5" cy="14" r="1" fill="#000"/></svg>',
  stuff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7a2 2 0 012-2h5l2 2h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2z" fill="#244EE7"/><path d="M2 10h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2z" fill="#5577F2"/><rect x="6" y="3" width="10" height="7" fill="#FFD84A" transform="rotate(-6 11 6)"/></svg>',
  capsule: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#000" stroke-width="1.6"/><rect x="3" y="4" width="18" height="5" rx="2" fill="#E8291F"/><path d="M8 2v4M16 2v4" stroke="#000" stroke-width="2" stroke-linecap="round"/><text x="12" y="18.5" font-size="8" text-anchor="middle" font-family="Arial Black, sans-serif" fill="#000">12</text></svg>',
  films: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" fill="#111"/><rect x="4" y="7" width="16" height="5" rx="1" fill="#FFD84A"/><circle cx="8" cy="15.5" r="2" fill="#fff"/><circle cx="16" cy="15.5" r="2" fill="#fff"/><rect x="10" y="14.5" width="4" height="2" fill="#E8291F"/></svg>',
  admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="#000"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#000" stroke-width="2" fill="none"/><circle cx="12" cy="16" r="1.6" fill="#FFD84A"/></svg>',
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c2 4 6 6 10 5-2 4-1 9 2 12-4 0-8 3-9 7-2-3-6-5-10-4 1-4-1-9-5-11 4-1 8-4 9-8z" fill="#FFD84A" stroke="#fff" stroke-width="1.5"/><circle cx="13" cy="15" r="1.6"/><circle cx="19" cy="15" r="1.6"/><path d="M13.5 19.5c1.5 1.2 3.5 1.2 5 0" stroke="#000" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'
};

export const SECTIONS = [
  { id: 'booth', name: 'Фотобудка', short: 'Фотобудка', hint: 'Четыре кадра, восемь фильтров, одна полоска', icon: 'booth' },
  { id: 'wall', name: 'Стена дня', short: 'Стена', hint: 'Общий коллаж, каждый день с чистого листа', icon: 'wall' },
  { id: 'run', name: 'Игры', short: 'Игры', hint: 'Забег дизайнера, мемори, змейка и тренажёр', icon: 'run' },
  { id: 'objects', name: 'Маленькие объекты', short: 'Объекты', hint: 'Фигурки ручной работы с моей полки', icon: 'objects' },
  { id: 'films', name: 'Видеопрокат', short: 'Прокат', hint: 'Фильмы и сериалы, которые стоит посмотреть', icon: 'films' },
  { id: 'stuff', name: 'Мои работы', short: 'Работы', hint: 'Постеры, 3D и всякие эксперименты', icon: 'stuff' },
  { id: 'capsule', name: 'Капсула времени', short: 'Капсула', hint: 'Все стены, которые мы сделали, по датам', icon: 'capsule' }
];
