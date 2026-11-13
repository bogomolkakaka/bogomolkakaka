// Strip composer: takes four filtered 4:3 frames and draws them into one of the six frames.
import { BUILTIN, stickerURL } from './stickers.js';
import { loadImg } from './util.js';

export const FRAMES = [
  { id: 'classic', name: 'Classic photostrip' },
  { id: 'blue', name: 'Minimal blue' },
  { id: 'vintage', name: 'Vintage photo booth' },
  { id: 'stickers', name: 'Sticker explosion' },
  { id: 'idcard', name: 'Designer ID card' },
  { id: 'clear', name: 'Transparent border' }
];
const ROLES = ['Senior Pixel Pusher', 'Head of Kerning', 'Chief Sticker Officer', 'Gradient Whisperer', 'Lead Undo Engineer', 'Director of More Pop'];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function geometry(frame) {
  switch (frame) {
    case 'vintage': { const w = 500, h = 375, g = 22, top = 118; return { W: 600, H: top + 4 * h + 3 * g + 130, slots: [0, 1, 2, 3].map(i => ({ x: 50, y: top + i * (h + g), w, h, r: 14, rot: 0 })) }; }
    case 'stickers': { const w = 480, h = 360, g = 48, top = 80; return { W: 640, H: top + 4 * h + 3 * g + 170, slots: [0, 1, 2, 3].map(i => ({ x: 80, y: top + i * (h + g), w, h, r: 4, rot: i % 2 ? 2.4 : -2.4 })) }; }
    case 'idcard': return { W: 1200, H: 760, slots: [{ x: 56, y: 160, w: 440, h: 330, r: 18, rot: 0 }, ...[0, 1, 2].map(k => ({ x: 56 + k * 152, y: 520, w: 136, h: 102, r: 10, rot: 0 }))] };
    case 'clear': { const w = 552, h = 414, g = 16, top = 24; return { W: 600, H: top * 2 + 4 * h + 3 * g, slots: [0, 1, 2, 3].map(i => ({ x: 24, y: top + i * (h + g), w, h, r: 26, rot: 0 })) }; }
    case 'blue': { const w = 520, h = 390, g = 16, top = 40; return { W: 600, H: top + 4 * h + 3 * g + 130, slots: [0, 1, 2, 3].map(i => ({ x: 40, y: top + i * (h + g), w, h, r: 0, rot: 0 })) }; }
    default: { const w = 520, h = 390, g = 18, top = 40; return { W: 600, H: top + 4 * h + 3 * g + 140, slots: [0, 1, 2, 3].map(i => ({ x: 40, y: top + i * (h + g), w, h, r: 0, rot: 0 })) }; }
  }
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
  const rnd = seeded(opts.seed || 7);
  const caption = (opts.caption || '').trim();
  const date = opts.date || '';
  const site = opts.site || '';
  const W = G.W, H = G.H;

  // background
  if (frame === 'classic') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  if (frame === 'blue') { ctx.fillStyle = '#244EE7'; ctx.fillRect(0, 0, W, H); }
  if (frame === 'vintage') {
    ctx.fillStyle = '#EDE3D1'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(${rnd() > .5 ? '90,60,30' : '255,255,255'},${rnd() * .08})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    ctx.fillStyle = '#C8321F'; ctx.font = '30px "Dela Gothic One", "Arial Black", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PHOTO  ·  BOOTH', W / 2, 74);
    ctx.fillStyle = 'rgba(200,50,31,.6)'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(W / 2 - 160 + i * 40, 96, 3.5, 0, 7); ctx.fill(); }
  }
  if (frame === 'stickers') {
    ctx.fillStyle = '#FFB8D9'; ctx.fillRect(0, 0, W, H);
    const cols = ['#FFD84A', '#244EE7', '#E8291F', '#fff', '#CFE0FF'];
    for (let i = 0; i < 140; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 5, 0, 7); ctx.fill(); }
  }
  if (frame === 'idcard') {
    ctx.save(); rr(ctx, 0, 0, W, H, 40); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#244EE7'; ctx.fillRect(0, 0, W, 118);
    ctx.fillStyle = '#FFD84A'; ctx.fillRect(0, 118, W, 10);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '50px "Dela Gothic One", "Arial Black", sans-serif'; ctx.fillText('DESIGNER ID', 56, 78);
    ctx.textAlign = 'right'; ctx.font = '600 24px "Golos Text", Arial, sans-serif'; ctx.fillText(site, W - 56, 72);
    ctx.restore();
  }

  // photos
  G.slots.forEach((s, i) => {
    const f = frames[i % frames.length];
    if (!f) return;
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(s.rot * Math.PI / 180); ctx.translate(-s.w / 2, -s.h / 2);
    if (frame === 'stickers') { ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; ctx.fillRect(-14, -14, s.w + 28, s.h + 28); ctx.shadowColor = 'transparent'; }
    rr(ctx, 0, 0, s.w, s.h, s.r); ctx.clip();
    ctx.drawImage(f, 0, 0, s.w, s.h);
    if (frame === 'vintage') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(240,214,170,.38)'; ctx.fillRect(0, 0, s.w, s.h); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(60,40,20,.25)'; ctx.lineWidth = 6; rr(ctx, 0, 0, s.w, s.h, s.r); ctx.stroke(); }
    ctx.restore();
  });

  // captions & decorations
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (frame === 'classic') {
    const y = G.slots[3].y + G.slots[3].h;
    ctx.fillStyle = '#000'; ctx.font = '34px "Dela Gothic One", "Arial Black", sans-serif'; ctx.fillText(caption || site, W / 2, y + 74);
    ctx.font = '500 18px "Golos Text", Arial, sans-serif'; ctx.fillStyle = '#555B69'; ctx.fillText(date, W / 2, y + 108);
  }
  if (frame === 'blue') {
    const y = G.slots[3].y + G.slots[3].h;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '30px "Dela Gothic One", "Arial Black", sans-serif'; ctx.fillText(caption || site, 40, y + 70);
    ctx.textAlign = 'right'; ctx.font = '500 18px "Golos Text", Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(date, W - 40, y + 68);
  }
  if (frame === 'vintage') {
    const y = G.slots[3].y + G.slots[3].h;
    ctx.fillStyle = '#5a3b22'; ctx.font = '700 38px "Caveat", cursive'; ctx.fillText(caption || '4 poses, 1 strip', W / 2, y + 70);
    ctx.font = '600 16px "Golos Text", Arial, sans-serif'; ctx.fillStyle = 'rgba(90,59,34,.75)'; ctx.fillText(date.toUpperCase(), W / 2, y + 102);
  }
  if (frame === 'stickers') {
    const y = G.slots[3].y + G.slots[3].h;
    ctx.fillStyle = '#000'; ctx.font = '700 46px "Caveat", cursive'; ctx.fillText(caption || 'best day ever', W / 2, y + 96);
    ctx.font = '600 16px "Golos Text", Arial, sans-serif'; ctx.fillText(date, W / 2, y + 128);
    const ids = BUILTIN.map(b => b.id);
    const spots = [];
    for (let i = 0; i < 22; i++) {
      const edge = i % 4;
      const x = edge === 0 ? rnd() * 90 + 10 : edge === 1 ? W - 10 - rnd() * 90 : rnd() * W;
      const yy = edge < 2 ? rnd() * H : (edge === 2 ? rnd() * 60 + 10 : H - 10 - rnd() * 110);
      spots.push({ id: ids[Math.floor(rnd() * ids.length)], x, y: yy, size: 64 + rnd() * 54, rot: (rnd() - .5) * 60 });
    }
    for (const sp of spots) {
      const img = await stickerImage({ id: sp.id });
      if (!img) continue;
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot * Math.PI / 180);
      const ar = (img.naturalHeight || 100) / (img.naturalWidth || 100);
      ctx.drawImage(img, -sp.size / 2, -sp.size * ar / 2, sp.size, sp.size * ar); ctx.restore();
    }
  }
  if (frame === 'idcard') {
    const x = 540;
    const role = ROLES[Math.floor(rnd() * ROLES.length)];
    const rows = [['NAME', caption || 'Guest designer'], ['ROLE', role], ['KERNING', '★★★★☆'], ['ISSUED', date], ['VALID', 'until the next revision']];
    ctx.textAlign = 'left';
    rows.forEach(([k, v], i) => {
      const y = 190 + i * 74;
      ctx.fillStyle = '#555B69'; ctx.font = '600 16px "Golos Text", Arial, sans-serif'; ctx.fillText(k, x, y);
      ctx.fillStyle = '#000'; ctx.font = i === 0 ? '34px "Dela Gothic One", "Arial Black", sans-serif' : '500 28px "Golos Text", Arial, sans-serif';
      let text = v; while (ctx.measureText(text).width > W - x - 60 && text.length > 3) text = text.slice(0, -2) + '…';
      ctx.fillText(text, x, y + 38);
    });
    ctx.fillStyle = '#000';
    let bx = x;
    for (let i = 0; i < 64 && bx < W - 60; i++) { const bw = 2 + Math.floor(rnd() * 5); if (rnd() > .35) ctx.fillRect(bx, 590, bw, 100); bx += bw + 2; }
    ctx.fillStyle = '#244EE7'; ctx.font = '700 44px "Caveat", cursive'; ctx.save(); ctx.translate(W - 300, 720); ctx.rotate(-.06); ctx.fillText(caption ? caption.split(' ')[0] : 'signed', 0, 0); ctx.restore();
    ctx.strokeStyle = '#D3D8E3'; ctx.lineWidth = 2; rr(ctx, 1, 1, W - 2, H - 2, 40); ctx.stroke();
  }

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
