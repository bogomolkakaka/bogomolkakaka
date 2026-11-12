// Built-in sticker set (original drawings). Used in the photo booth, on the wall and in easter eggs.
const W = (body, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
const OUT = 'stroke="#000" stroke-width="4" stroke-linejoin="round"';
export const BUILTIN = [
  { id: 'star', name: 'Star', svg: W(`<path d="M50 6l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 37l30-3z" fill="#FFD84A" ${OUT}/><circle cx="42" cy="50" r="3.5"/><circle cx="58" cy="50" r="3.5"/><path d="M44 60q6 5 12 0" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`) },
  { id: 'heart', name: 'Heart', svg: W(`<path d="M50 88C20 66 8 50 8 33 8 20 18 11 30 11c9 0 16 5 20 12 4-7 11-12 20-12 12 0 22 9 22 22 0 17-12 33-42 55z" fill="#E8291F" ${OUT}/><path d="M24 30q4-9 13-9" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`) },
  { id: 'smile', name: 'Smile', svg: W(`<circle cx="50" cy="50" r="42" fill="#244EE7" ${OUT}/><ellipse cx="37" cy="42" rx="5" ry="8" fill="#fff"/><ellipse cx="63" cy="42" rx="5" ry="8" fill="#fff"/><path d="M30 60q20 22 40 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`) },
  { id: 'sparkle', name: 'Sparkle', svg: W(`<path d="M50 4c4 26 20 42 46 46-26 4-42 20-46 46-4-26-20-42-46-46 26-4 42-20 46-46z" fill="#FFB8D9" ${OUT}/><path d="M82 10c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" fill="#FFD84A" stroke="#000" stroke-width="3"/>`) },
  { id: 'flower', name: 'Flower', svg: W(`${[0, 72, 144, 216, 288].map(a => `<ellipse cx="50" cy="26" rx="15" ry="20" fill="#FFB8D9" ${OUT} transform="rotate(${a} 50 50)"/>`).join('')}<circle cx="50" cy="50" r="15" fill="#FFD84A" ${OUT}/>`) },
  { id: 'wow', name: 'WOW', svg: W(`<path d="M50 3l9 15 17-8-1 18 19 2-11 14 13 13-18 5 5 18-18-4-6 18-11-14-15 11-1-19-19-3 11-15-14-12 18-6-6-18 18 3z" fill="#FFD84A" ${OUT}/><text x="50" y="60" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="26" fill="#000">WOW</text>`) },
  { id: 'pop', name: 'Make it pop', svg: W(`<path d="M10 14h100a8 8 0 018 8v42a8 8 0 01-8 8H46l-20 18 4-18H10a8 8 0 01-8-8V22a8 8 0 018-8z" fill="#fff" ${OUT}/><text x="60" y="38" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="17" fill="#244EE7">MAKE IT</text><text x="60" y="61" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="22" fill="#E8291F">POP!</text>`, '0 0 120 96') },
  { id: 'cursor', name: 'Cursor', svg: W(`<path d="M18 8l64 34-28 7-12 28z" fill="#244EE7" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><path d="M18 8l64 34-28 7-12 28z" fill="none" ${OUT}/>`) },
  { id: 'aplus', name: 'A+', svg: W(`<circle cx="50" cy="50" r="40" fill="#fff" stroke="#E8291F" stroke-width="7"/><text x="48" y="64" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="40" fill="#E8291F">A+</text>`) },
  { id: 'bolt', name: 'Bolt', svg: W(`<path d="M58 4L18 56h24l-8 40 46-58H54z" fill="#FFD84A" ${OUT}/>`) },
  { id: 'cloud', name: 'Cloud', svg: W(`<path d="M28 78a18 18 0 01-2-36 24 24 0 0146-8 18 18 0 0110 44z" fill="#CFE0FF" ${OUT}/><circle cx="42" cy="56" r="3.5"/><circle cx="60" cy="56" r="3.5"/><ellipse cx="34" cy="64" rx="5" ry="3" fill="#FFB8D9"/><ellipse cx="68" cy="64" rx="5" ry="3" fill="#FFB8D9"/>`) },
  { id: 'pug', name: 'Grumpy pug', svg: W(`<path d="M22 30c-14 2-18 22-8 30l10-8z" fill="#8f949e" ${OUT}/><path d="M78 30c14 2 18 22 8 30l-10-8z" fill="#8f949e" ${OUT}/><ellipse cx="50" cy="54" rx="34" ry="32" fill="#c4c8d0" ${OUT}/><path d="M30 40l12 6M70 40l-12 6" stroke="#000" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="52" r="5"/><circle cx="62" cy="52" r="5"/><ellipse cx="50" cy="68" rx="14" ry="11" fill="#8f949e" stroke="#000" stroke-width="3"/><ellipse cx="50" cy="63" rx="5" ry="3.5"/><path d="M44 74q6-4 12 0" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>`) },
  { id: 'coffee', name: 'Coffee', svg: W(`<path d="M20 34h52l-6 50H26z" fill="#fff" ${OUT}/><path d="M72 44h6a10 10 0 010 20h-9" fill="none" ${OUT}/><path d="M20 46h52" stroke="#244EE7" stroke-width="7"/><path d="M38 24q-6-8 0-16M52 24q-6-8 0-16" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`) },
  { id: 'ok', name: 'OK stamp', svg: W(`<rect x="8" y="24" width="84" height="52" rx="8" fill="#fff" stroke="#E8291F" stroke-width="6" transform="rotate(-8 50 50)"/><text x="50" y="64" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="34" fill="#E8291F" transform="rotate(-8 50 50)">OK!</text>`) },
  { id: 'eye', name: 'Eye', svg: W(`<path d="M4 50q46-46 92 0-46 46-92 0z" fill="#fff" ${OUT}/><circle cx="50" cy="50" r="18" fill="#244EE7" stroke="#000" stroke-width="3.5"/><circle cx="50" cy="50" r="8"/><circle cx="56" cy="44" r="4" fill="#fff"/>`) },
  { id: 'bun', name: 'Bunny', svg: W(`<path d="M36 40c-4-16-6-30 2-32s10 16 8 32M64 40c4-16 6-30-2-32s-10 16-8 32" fill="#FF9CC8" ${OUT}/><ellipse cx="50" cy="64" rx="32" ry="28" fill="#FF9CC8" ${OUT}/><circle cx="40" cy="60" r="4"/><circle cx="60" cy="60" r="4"/><ellipse cx="32" cy="70" rx="6" ry="4" fill="#E8291F" opacity=".5"/><ellipse cx="68" cy="70" rx="6" ry="4" fill="#E8291F" opacity=".5"/>`) }
];
const cache = new Map();
export function stickerURL(id) {
  if (cache.has(id)) return cache.get(id);
  const s = BUILTIN.find(x => x.id === id);
  if (!s) return '';
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg);
  cache.set(id, url);
  return url;
}
// Medal artwork for Designer Run winners.
export function medalSVG({ title = 'SHIPPED', coins = 0 } = {}) {
  const t = String(title).replace(/[<&>"]/g, '').slice(0, 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150"><path d="M38 0h18l10 46H48zM82 0H64l-10 46h18z" fill="#244EE7" stroke="#000" stroke-width="3"/><circle cx="60" cy="92" r="48" fill="#FFD84A" stroke="#000" stroke-width="4"/><circle cx="60" cy="92" r="38" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="4 5"/><text x="60" y="86" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="13" fill="#000">${t}</text><text x="60" y="108" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="20" fill="#E8291F">★ ${Math.max(0, coins | 0)}</text></svg>`;
}
export const svgURL = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
