// Small canvas preview of a wall (desk board, calendar cells).
import { stickerURL } from './stickers.js';
export const WORLD = { w: 2400, h: 1600 };
export const NOTE_COLORS = { yellow: '#FFE45C', pink: '#FFC2DD', blue: '#CFE0FF', white: '#FFFFFF', red: '#FF6A5C', cobalt: '#244EE7' };
const imgCache = new Map();
function getImg(src, onload) {
  if (!src) return null;
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image(); img.decoding = 'async';
    e = { img, ok: false, waiters: [] };
    img.onload = () => { e.ok = true; e.waiters.forEach(f => f()); e.waiters = []; };
    img.src = src; imgCache.set(src, e);
  }
  if (!e.ok && onload) e.waiters.push(onload);
  return e.ok ? e.img : null;
}
export function drawMini(cv, items, { bg = '#ffffff', redraw, fit } = {}) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // view box in world units: the whole wall, or (fit: 'content') the part that has things on it
  let bx = 0, by = 0, bw = WORLD.w, bh = WORLD.h;
  if (fit === 'content' && items.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); }
    const pad = 80; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    bw = Math.max(x1 - x0, 900); bh = Math.max(y1 - y0, 900 * H / W);
    if (bw / bh > W / H) bh = bw * H / W; else bw = bh * W / H;
    bx = (x0 + x1) / 2 - bw / 2; by = (y0 + y1) / 2 - bh / 2;
  }
  const s = Math.min(W / bw, H / bh);
  const ox = (W - bw * s) / 2 - bx * s, oy = (H - bh * s) / 2 - by * s;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  let pending = false;
  const again = () => { if (!pending) { pending = true; requestAnimationFrame(() => drawMini(cv, items, { bg, redraw, fit })); } };
  for (const it of [...items].sort((a, b) => a.z - b.z)) {
    ctx.save();
    ctx.translate(ox + (it.x + it.w / 2) * s, oy + (it.y + it.h / 2) * s);
    ctx.rotate(it.rot * Math.PI / 180);
    const w = it.w * s, h = it.h * s;
    const d = it.data || {};
    if (it.kind === 'note' || it.kind === 'whisper') {
      ctx.fillStyle = NOTE_COLORS[d.color] || (it.kind === 'whisper' ? '#fff' : NOTE_COLORS.yellow);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (w > 18) {
        ctx.fillStyle = d.color === 'cobalt' ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.45)';
        const lines = Math.min(4, Math.max(1, Math.floor(h / 10)));
        for (let i = 0; i < lines; i++) ctx.fillRect(-w / 2 + w * .12, -h / 2 + h * (.25 + i * .16), w * (.55 + ((i * 37) % 30) / 100), Math.max(1, h * .045));
      }
    } else if (it.kind === 'drawing') {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const p of d.paths || []) {
        ctx.strokeStyle = p.c || '#000'; ctx.globalAlpha = p.a || 1; ctx.lineWidth = Math.max(.6, (p.s || 6) * s);
        ctx.beginPath();
        const pts = p.p || [];
        for (let i = 0; i < pts.length; i += 2) { const px = (pts[i] - .5) * w, py = (pts[i + 1] - .5) * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      const src = it.kind === 'sticker' ? (d.src || stickerURL(d.sticker)) : d.src;
      const img = getImg(src, redraw ? again : null);
      if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
      else { ctx.fillStyle = it.kind === 'strip' ? '#fff' : '#d9deea'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    }
    ctx.restore();
  }
}
