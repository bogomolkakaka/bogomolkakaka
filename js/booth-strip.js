// Strip composer: takes four filtered 4:3 frames and draws them into one of the six frames.
import { BUILTIN, stickerURL } from './stickers.js';
import { loadImg } from './util.js';

export const FRAMES = [
  { id: 'film', name: 'Плёнка' },
  { id: 'scan', name: 'Скан плёнки' },
  { id: 'choco', name: 'Шоколадка' },
  { id: 'polaroid', name: 'Полароид', shots: 1 } // single photo
];
const frameId = id => (FRAMES.some(f => f.id === id) ? id : FRAMES[0].id); // strips made with retired frames fall back to film
const CHOCO_P = 540; // height of one wrapper on the chocolate strip
// single photo: a tilted polaroid on dark felt
const PL = { W: 1080, H: 1080, cx: 540, cy: 552, cw: 840, ch: 960, pad: 52, pw: 736, ph: 552, rot: -2.5 };
function polaroidSlot() {
  const t = PL.rot * Math.PI / 180, d = -PL.ch / 2 + PL.pad + PL.ph / 2; // photo centre relative to card centre
  const x = PL.cx - d * Math.sin(t), y = PL.cy + d * Math.cos(t);
  return { x: x - PL.pw / 2, y: y - PL.ph / 2, w: PL.pw, h: PL.ph, r: 0, rot: PL.rot };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function geometry(frame) {
  switch (frameId(frame)) {
    case 'scan': { const w = 456, h = 342, g = 40, top = 34; return { W: 600, H: top * 2 + 4 * h + 3 * g, slots: [0, 1, 2, 3].map(i => ({ x: 72, y: top + i * (h + g), w, h, r: 6, rot: 0 })) }; }
    case 'polaroid': return { W: PL.W, H: PL.H, slots: [polaroidSlot()] };
    case 'choco': return { W: 600, H: 4 * CHOCO_P, slots: [0, 1, 2, 3].map(i => ({ x: 54, y: i * CHOCO_P + 54, w: 368, h: 276, r: 0, rot: 0 })) };
    default: { const w = 440, h = 330, g = 16, top = 24; return { W: 600, H: top * 2 + 4 * h + 3 * g, slots: [0, 1, 2, 3].map(i => ({ x: 80, y: top + i * (h + g), w, h, r: 0, rot: 0 })) }; }
  }
}

// text turned sideways along the film edge
function vtext(ctx, text, x, y, angle) { ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillText(text, 0, 0); ctx.restore(); }
function wrapLines(ctx, text, maxW) {
  const lines = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
// a yellow flower taped to the film, like a cut-out from a magazine
function flower(ctx, x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.strokeStyle = '#5d5418'; ctx.lineWidth = r * .1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, r * .3); ctx.quadraticCurveTo(r * .15, r * 1.1, -r * .05, r * 1.75); ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * .12; ctx.shadowOffsetY = r * .05;
  for (let k = 0; k < 18; k++) { ctx.save(); ctx.rotate(k * Math.PI * 2 / 18); ctx.fillStyle = k % 2 ? '#F4C51C' : '#E5AE10'; ctx.beginPath(); ctx.ellipse(0, -r * .56, r * .15, r * .44, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#3b2a0e'; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a5216'; for (let k = 0; k < 14; k++) { const a = k * 2.4, d = r * .2 * Math.sqrt((k + .5) / 14); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * .035, 0, Math.PI * 2); ctx.fill(); }
  ctx.save(); ctx.translate(0, r * 1.05); ctx.rotate(-.35); ctx.fillStyle = 'rgba(205,205,198,.78)'; ctx.fillRect(-r * .5, -r * .14, r, r * .28); ctx.restore();
  ctx.restore();
}

const imgCache = new Map();
export function stickerImage(s) {
  const src = s.src || stickerURL(s.id);
  if (!imgCache.has(src)) {
    const p = new Promise((res, rej) => { const i = new Image(); if (/^https?:/.test(src)) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    imgCache.set(src, p.catch(() => null));
  }
  return imgCache.get(src);
}

export async function ensureFonts() {
  if (!document.fonts) return;
  try { await Promise.all(['40px "Dela Gothic One"', '700 40px "Caveat"', '600 20px "Golos Text"', '20px "Press Start 2P"'].map(f => document.fonts.load(f))); } catch (e) { /* fallbacks are fine */ }
}

// frames: array of 4 canvases; opts: { caption, date, site, seed, overlay: [{type:'sticker'|'text', ...}] }
export async function composeStrip(frames, frame, opts = {}, scale = 1) {
  const G = geometry(frame);
  const cv = document.createElement('canvas');
  cv.width = Math.round(G.W * scale); cv.height = Math.round(G.H * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  frame = frameId(frame);
  const rnd = seeded(opts.seed || 7);
  const caption = (opts.caption || '').trim();
  const date = opts.date || '';
  const site = opts.site || '';
  const W = G.W, H = G.H;

  const year = (date.match(/\d{4}/) || [String(new Date().getFullYear())])[0];
  const brand = (site || 'bogomolka').toUpperCase();

  // background
  if (frame === 'film') {
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d9d9d4';
    for (let y = 12; y < H - 10; y += 46) { rr(ctx, 44, y, 26, 18, 3); ctx.fill(); rr(ctx, 530, y, 26, 18, 3); ctx.fill(); }
  }
  if (frame === 'scan') {
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1a120c'); g.addColorStop(.5, '#0d0906'); g.addColorStop(1, '#1c130c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let y = 16; y < H - 20; y += 50) for (const x of [36, 536]) {
      const lit = ctx.createLinearGradient(x, y, x + 28, y + 24); lit.addColorStop(0, `rgba(235,232,224,${.7 + rnd() * .25})`); lit.addColorStop(1, `rgba(170,165,155,${.55 + rnd() * .3})`);
      ctx.fillStyle = lit; rr(ctx, x, y, 28, 24, 6); ctx.fill();
    }
  }
  if (frame === 'polaroid') {
    ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = rnd() > .5 ? `rgba(255,255,255,${rnd() * .07})` : `rgba(0,0,0,${rnd() * .3})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
    ctx.save(); ctx.translate(PL.cx, PL.cy); ctx.rotate(PL.rot * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#F2F1EC'; ctx.fillRect(-PL.cw / 2, -PL.ch / 2, PL.cw, PL.ch);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(120,116,104,.11)'; // embossed paper
    for (let y = -PL.ch / 2 + 4, row = 0; y < PL.ch / 2 - 2; y += 7, row++) for (let x = -PL.cw / 2 + 3 + (row % 2) * 3.5; x < PL.cw / 2 - 2; x += 7) ctx.fillRect(x, y, 1.6, 1.6);
    ctx.restore();
  }
  if (frame === 'choco') {
    ctx.fillStyle = '#F1D98F'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) { ctx.fillStyle = `rgba(${rnd() > .5 ? '140,100,30' : '255,250,230'},${rnd() * .09})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    for (let k = 0; k < 4; k++) {
      const y0 = k * CHOCO_P;
      // dark woven square behind the photo
      ctx.fillStyle = '#1b1915'; ctx.fillRect(36, y0 + 36, 404, 312);
      ctx.save(); ctx.beginPath(); ctx.rect(36, y0 + 36, 404, 312); ctx.clip();
      ctx.strokeStyle = 'rgba(232,218,176,.5)'; ctx.lineWidth = 1.3; ctx.beginPath();
      for (let yy = y0 + 36; yy < y0 + 348; yy += 11) for (let xx = 36; xx < 440; xx += 11) { if (rnd() < .5) { ctx.moveTo(xx, yy + 2); ctx.lineTo(xx + 9, yy + 2); } else { ctx.moveTo(xx + 2, yy); ctx.lineTo(xx + 2, yy + 9); } }
      ctx.stroke(); ctx.restore();
      // printer's colour bar between wrappers
      if (k) ['#E8467C', '#D8C27C', '#C9AE76', '#F5E6AE', '#BBA46E'].forEach((c, n) => { ctx.fillStyle = c; ctx.fillRect(n * 24, y0 - 11, 24, 22); });
    }
  }

  // photos
  G.slots.forEach((s, i) => {
    const f = frames[i % frames.length];
    if (!f) return;
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(s.rot * Math.PI / 180); ctx.translate(-s.w / 2, -s.h / 2);
    if (frame === 'scan') { ctx.shadowColor = 'rgba(255,92,30,.5)'; ctx.shadowBlur = 16; ctx.fillStyle = '#2a1209'; rr(ctx, 0, 0, s.w, s.h, s.r); ctx.fill(); ctx.shadowColor = 'transparent'; }
    rr(ctx, 0, 0, s.w, s.h, s.r); ctx.clip();
    ctx.drawImage(f, 0, 0, s.w, s.h);
    if (frame === 'polaroid') { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, s.w, s.h); }
    if (frame === 'scan') {
      const v = ctx.createRadialGradient(s.w / 2, s.h / 2, s.h * .45, s.w / 2, s.h / 2, s.w * .7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,12,0,.35)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, s.w, s.h);
    }
    ctx.restore();
  });

  // edge print & decorations
  ctx.textBaseline = 'middle';
  if (frame === 'film') {
    ctx.fillStyle = '#ecece8'; ctx.textAlign = 'center';
    G.slots.forEach((s, i) => {
      ctx.font = '600 18px "Golos Text", Arial, sans-serif'; vtext(ctx, brand, 22, s.y + s.h * .7, -Math.PI / 2);
      ctx.font = '600 13px "Golos Text", Arial, sans-serif'; vtext(ctx, `▶ ${year}`, 22, s.y + s.h * .16, -Math.PI / 2);
    });
    ctx.font = '600 15px "Courier New", monospace';
    const tag = caption ? `[ ${caption} ]` : '[ фото ] to go', tw = ctx.measureText(tag).width;
    for (let y = 24 + tw / 2; y < H - tw / 2; y += tw + 34) vtext(ctx, tag, 580, y, Math.PI / 2);
    flower(ctx, 550, G.slots[0].y + G.slots[0].h + 8, 44, .25);
  }
  if (frame === 'scan') {
    ctx.fillStyle = '#E59A38'; ctx.textAlign = 'center';
    const code = (date.match(/^\d+/) || ['6'])[0].padStart(2, '0') + '4';
    G.slots.forEach((s, i) => {
      ctx.font = '700 18px "Golos Text", Arial, sans-serif';
      vtext(ctx, code, 584, s.y + 22, Math.PI / 2);
      vtext(ctx, String(i + 1), 584, s.y + s.h * .55, Math.PI / 2);
      ctx.font = '700 16px "Golos Text", Arial, sans-serif'; vtext(ctx, 'STUDIO', 584, s.y + s.h + 4, Math.PI / 2);
      ctx.font = '700 13px "Golos Text", Arial, sans-serif'; vtext(ctx, `${14 + i * 2}A`, 14, s.y + s.h * .3, Math.PI / 2);
    });
    for (let i = 0; i < 240; i++) { ctx.fillStyle = `rgba(255,248,235,${rnd() * .55})`; const d = .6 + rnd() * 1.8; ctx.fillRect(rnd() * W, rnd() * H, d, d); }
    ctx.strokeStyle = 'rgba(255,248,235,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const x = 90 + rnd() * 400, y = rnd() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 20, y + 10, x - 10, y + 30, x + 14, y + 44); ctx.stroke(); }
  }
  if (frame === 'choco') {
    const name = caption || 'Улыбашка';
    const subs = ['и компания', 'с орешками', 'пористая', 'с изюмом'];
    const kinds = ['молочный шоколад', 'молочный шоколад', 'молочный шоколад', 'горький шоколад'];
    for (let k = 0; k < 4; k++) {
      const y0 = k * CHOCO_P;
      // red oval badge with the studio name
      ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(336, y0 + 388);
      ctx.fillStyle = '#C4161C'; ctx.beginPath(); ctx.ellipse(0, 0, 76, 27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#F6E7B6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 70, 21, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 30px "Caveat", cursive'; ctx.fillText('Богомолка', 0, 1);
      ctx.restore();
      // round seal
      ctx.fillStyle = '#E8D59C'; ctx.strokeStyle = '#6E4C1C'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(434, y0 + 388, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6E4C1C'; ctx.textAlign = 'center'; ctx.font = '700 11px "Golos Text", Arial, sans-serif'; ctx.fillText('100 г', 434, y0 + 389);
      // product name
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = '#7C5A24'; ctx.font = '500 15px "Golos Text", Arial, sans-serif'; ctx.fillText(kinds[k], 58, y0 + 393);
      let fs = 74; ctx.font = `700 ${fs}px "Caveat", cursive`;
      while (ctx.measureText(name).width > 380 && fs > 34) { fs -= 4; ctx.font = `700 ${fs}px "Caveat", cursive`; }
      ctx.fillStyle = '#8A6322'; ctx.fillText(name, 54, y0 + 478);
      ctx.textAlign = 'right'; ctx.font = '700 30px "Caveat", cursive'; ctx.fillText(subs[k], 436, y0 + 518);
      // the small print, sideways
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(108,78,30,.75)'; ctx.font = '500 12.5px "Golos Text", Arial, sans-serif';
      const small = `Шоколад «${name}» ${subs[k]}. Состав: улыбка, ещё одна улыбка, щепотка дерзости, блеск, четыре кадра. Пищевая ценность на 100 г: радость — 99%, ретушь — 0%. Изготовлено в фотобудке ${site || 'bogomolka'}${date ? ', ' + date : ''}. Хранить на стене дня при комнатном настроении.`;
      wrapLines(ctx, small, CHOCO_P - 76).slice(0, 7).forEach((line, n) => vtext(ctx, line, 576 - n * 18, y0 + 38, Math.PI / 2));
    }
  }
  if (frame === 'polaroid') {
    const [ky, km, kd] = (opts.dayKey || '').split('-');
    const now = new Date(), dd = kd || String(now.getDate()).padStart(2, '0'), mm = km || String(now.getMonth() + 1).padStart(2, '0');
    ctx.save(); ctx.translate(PL.cx, PL.cy); ctx.rotate(PL.rot * Math.PI / 180);
    const top = -PL.ch / 2, left = -PL.cw / 2, photoL = left + PL.pad, photoB = top + PL.pad + PL.ph;
    // marker doodles by the photo corners
    ctx.strokeStyle = '#141414'; ctx.lineCap = 'round'; ctx.lineWidth = 7;
    [[photoL + 70, photoB - 80, Math.PI * 1.05], [photoL + PL.pw - 60, top + PL.pad + 150, -Math.PI * .15]].forEach(([x, y, a0]) => {
      for (let k = -1; k <= 1; k++) { const a = a0 + k * .5; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); ctx.lineTo(x + Math.cos(a) * 52, y + Math.sin(a) * 52); ctx.stroke(); }
    });
    // handwritten caption in black marker; long ones break into two staggered lines
    const text = caption || 'фото дня', maxW = 560;
    ctx.fillStyle = '#121212'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const fontAt = fs => `700 ${fs}px "Caveat", cursive`;
    ctx.font = fontAt(150);
    let lines = [text];
    if (ctx.measureText(text).width > maxW && text.includes(' ')) {
      const words = text.split(' '); let best = 1, diff = Infinity;
      for (let k = 1; k < words.length; k++) { const d = Math.abs(ctx.measureText(words.slice(0, k).join(' ')).width - ctx.measureText(words.slice(k).join(' ')).width); if (d < diff) { diff = d; best = k; } }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    lines.forEach((ln, n) => {
      let fs = lines.length > 1 ? 130 : 150; ctx.font = fontAt(fs);
      while (ctx.measureText(ln).width > maxW - n * 60 && fs > 54) { fs -= 6; ctx.font = fontAt(fs); }
      ctx.save(); ctx.translate(left + 64 + n * 110, photoB + (lines.length > 1 ? 104 + n * 128 : 170)); ctx.rotate(-.03 + n * .02); ctx.fillText(ln, 0, 0); ctx.restore();
    });
    // green tape-like label at the top-left corner
    ctx.save(); ctx.translate(left + 150, top + 128); ctx.rotate(-.14);
    const sw = 410, sh = 212;
    const gg = ctx.createLinearGradient(-sw / 2, -sh / 2, sw / 2, sh / 2); gg.addColorStop(0, '#8FEC5A'); gg.addColorStop(.55, '#6CD43C'); gg.addColorStop(1, '#88E553');
    ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
    ctx.fillStyle = gg; rr(ctx, -sw / 2, -sh / 2, sw, sh, 12); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3;
    [[-150, -100, -60, 100], [40, -104, 120, 104], [150, -60, 200, 40]].forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
    ctx.fillStyle = '#17220F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fitFont = (str, font, size, max) => { let fs = size; ctx.font = font(fs); while (ctx.measureText(str).width > max && fs > 18) { fs -= 2; ctx.font = font(fs); } };
    const dela = fs => `${fs}px "Dela Gothic One", "Arial Black", sans-serif`;
    fitFont('ВЫБЕРИ МЕНЯ', dela, 46, sw - 50); ctx.fillText('ВЫБЕРИ МЕНЯ', 0, -58);
    ctx.font = dela(44); const wI = ctx.measureText('И ').width; ctx.font = '700 68px "Caveat", cursive'; const wA = ctx.measureText('всегда').width;
    ctx.textAlign = 'left'; ctx.font = dela(44); ctx.fillText('И ', -(wI + wA) / 2, 4); ctx.font = '700 68px "Caveat", cursive'; ctx.fillText('всегда', -(wI + wA) / 2 + wI, 0);
    ctx.textAlign = 'center'; fitFont('БУДЬ СЧАСТЛИВЕЕ!', dela, 40, sw - 44); ctx.fillText('БУДЬ СЧАСТЛИВЕЕ!', 0, 64);
    ctx.restore();
    // pink round sticker with the date, a little crumpled
    ctx.save(); ctx.translate(left + PL.cw - 64, photoB - 6); ctx.rotate(.12);
    const pg = ctx.createRadialGradient(-34, -44, 10, 0, 0, 132); pg.addColorStop(0, '#FFA6D0'); pg.addColorStop(.7, '#FF62AA'); pg.addColorStop(1, '#EE4699');
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 126, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(30, 20, 84, -.4, .7); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,20,80,.18)'; ctx.beginPath(); ctx.arc(-20, 10, 96, 2.2, 3.3); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 80px "Caveat", cursive'; ctx.fillText(`${dd}/${mm}`, 0, -14);
    ctx.font = '700 60px "Caveat", cursive'; ctx.fillText('~', 0, 26);
    ctx.font = '700 50px "Caveat", cursive'; ctx.fillText('навсегда', 0, 76);
    ctx.restore();
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';

  // user stickers and text (positions are fractions of the strip)
  const base = Math.min(W, H);
  for (const o of opts.overlay || []) {
    ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate((o.rot || 0) * Math.PI / 180);
    if (o.type === 'text') {
      const size = o.size * base;
      ctx.font = o.font === 'display' ? `${size}px "Dela Gothic One", "Arial Black", sans-serif` : `700 ${size * 1.25}px "Caveat", cursive`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.color === '#ffffff' || o.color === '#FFD84A') { ctx.lineWidth = size * .12; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(o.text, 0, 0); }
      ctx.fillStyle = o.color || '#000'; ctx.fillText(o.text, 0, 0);
    } else {
      const img = await stickerImage(o);
      if (img) { const s = o.size * base; const ar = (img.naturalHeight || 100) / (img.naturalWidth || 100); ctx.drawImage(img, -s / 2, -s * ar / 2, s, s * ar); }
    }
    ctx.restore();
  }
  return cv;
}
