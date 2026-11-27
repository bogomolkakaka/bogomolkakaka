// MY MUSIC: songs a visitor loads into the CD player from their phone or computer.
// Everything stays in this browser (IndexedDB): nothing is uploaded anywhere, and only the
// person who added the songs hears them. Two stores: light descriptions for the shelf
// ("meta") and the sound itself ("audio"), read only when a song starts.

const DB_NAME = 'bg-music';
const MAX_BYTES = 80 * 1024 * 1024;
const TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus', flac: 'audio/flac', webm: 'audio/webm' };
export const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm';

let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) { rej(new Error('noidb')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('audio', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  }).catch(e => { dbp = null; throw e; });
  return dbp;
}
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });
const ask = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const byOrder = (a, b) => (a.added - b.added) || ((parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0)) || String(a.title).localeCompare(String(b.title));
export async function listTracks() {
  const t = (await db()).transaction('meta', 'readonly');
  // tidy on the way out too, so songs added before the cleanup also lose download-site marks
  return (await ask(t.objectStore('meta').getAll())).map(m => ({ ...m, title: tidy(m.title) || m.title, artist: tidy(m.artist), album: tidy(m.album) })).sort(byOrder);
}
export async function getSound(id) {
  const t = (await db()).transaction('audio', 'readonly');
  const rec = await ask(t.objectStore('audio').get(id));
  return rec ? new Blob([rec.buf], { type: rec.type || 'audio/mpeg' }) : null;
}
export async function removeTrack(id) {
  const t = (await db()).transaction(['meta', 'audio'], 'readwrite');
  t.objectStore('meta').delete(id); t.objectStore('audio').delete(id);
  await done(t);
}

/* ---------- adding a file ---------- */
const ext = name => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const probe = document.createElement('audio');
// The type to play the file with: the one the browser says it can play, from the file or its extension.
export function typeOf(file) {
  const all = [file.type, TYPES[ext(file.name)]].filter(t => t && /^(audio|video)\//.test(t));
  return all.find(t => probe.canPlayType && probe.canPlayType(t)) || all[0] || '';
}
// Why a file cannot go in, in words for the visitor, or '' when it can.
export function problem(file) {
  const all = [file.type, TYPES[ext(file.name)]].filter(t => t && /^(audio\/|video\/(mp4|webm|ogg))/.test(t));
  if (!all.length) return 'это не музыкальный файл';
  if (file.size > MAX_BYTES) return 'файл больше 80 МБ';
  if (probe.canPlayType && !all.some(t => probe.canPlayType(t))) return 'этот формат браузер не играет, лучше mp3 или m4a';
  return '';
}
export async function addFile(file, order) {
  const buf = await file.arrayBuffer();
  const tags = readTags(new Uint8Array(buf)) || {};
  const fromName = nameParts(file.name);
  const meta = {
    id: (crypto.randomUUID ? crypto.randomUUID() : 'm-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
    title: clean(tags.title) || fromName.title,
    artist: clean(tags.artist) || clean(tags.albumArtist) || fromName.artist,
    album: clean(tags.album),
    no: clean(tags.no).split('/')[0],
    cover: tags.cover ? await coverURL(tags.cover).catch(() => '') : '',
    type: typeOf(file), size: file.size, added: order
  };
  const t = (await db()).transaction(['meta', 'audio'], 'readwrite');
  t.objectStore('audio').put({ id: meta.id, buf, type: meta.type });
  t.objectStore('meta').put(meta);
  await done(t);
  return meta;
}
// ask the browser to keep the songs even when space runs low (it may say no; that is fine)
export function keepSafe() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* older browsers */ } }

const clean = s => tidy(String(s || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, 120));
// Music download sites stamp their address into the tags: "Britney Spears [drivemusic.me]",
// album "drivemusic.me", "Toxic - muzofond.fm". Those marks are removed.
const SITE = '(?:https?:\\/\\/)?(?:www\\.)?[a-z0-9][a-z0-9-]*\\.(?:me|ru|com|net|org|info|biz|cc|tv|fm|su|io|to|club|pro|site|online|xyz|top|band|mobi|ws|in|ua|by|kz|eu|de|uk|co|pw|life|live|today|music)';
const SITE_ONLY = new RegExp(`^${SITE}\\/?$`, 'i');
const SITE_TAG = new RegExp(`\\s*[\\[\\(\\{]\\s*${SITE}\\/?\\s*[\\]\\)\\}]`, 'gi');
const SITE_TAIL = new RegExp(`\\s*[-–—|:]+\\s*${SITE}\\/?\\s*$`, 'i');
const SITE_HEAD = new RegExp(`^\\s*${SITE}\\/?\\s*[-–—|:]+\\s*`, 'i');
export function tidy(v) {
  let s = String(v || '').trim();
  if (!s || SITE_ONLY.test(s)) return '';
  s = s.replace(SITE_TAG, '').replace(SITE_TAIL, '').replace(SITE_HEAD, '').replace(/\s+/g, ' ').trim();
  return SITE_ONLY.test(s) ? '' : s;
}
function nameParts(name) {
  let base = tidy(String(name).replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim());
  base = base.replace(/^\d{1,3}[\s.\-)]+(?=\S)/, '');
  const k = base.indexOf(' - ');
  if (k > 0) return { artist: base.slice(0, k).trim(), title: base.slice(k + 3).trim() || base };
  return { artist: '', title: base || 'Без названия' };
}
async function coverURL({ mime, bytes }) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const s = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL('image/jpeg', .82);
}

/* ---------- tags: ID3 (mp3) and MP4 atoms (m4a, the usual iPhone format) ---------- */
const dec = (b, enc) => { try { return new TextDecoder(enc).decode(b); } catch (e) { return ''; } };
// Old Russian mp3s often store Cyrillic as Windows-1251 inside "Latin-1" frames.
function oneByte(b) {
  let hi = 0, letters = 0;
  for (const x of b) { if (x >= 0x41) letters++; if (x >= 0xC0) hi++; }
  return dec(b, hi && hi / letters > .3 ? 'windows-1251' : 'iso-8859-1');
}
function text(b, enc) {
  if (enc === 0) return oneByte(b);
  if (enc === 1) {
    if (b[0] === 0xFE && b[1] === 0xFF) return dec(b.subarray(2), 'utf-16be');
    if (b[0] === 0xFF && b[1] === 0xFE) return dec(b.subarray(2), 'utf-16le');
    return dec(b, 'utf-16le');
  }
  if (enc === 2) return dec(b, 'utf-16be');
  return dec(b, 'utf-8');
}
const syncsafe = (u, p) => ((u[p] & 0x7f) << 21) | ((u[p + 1] & 0x7f) << 14) | ((u[p + 2] & 0x7f) << 7) | (u[p + 3] & 0x7f);
const be32 = (u, p) => ((u[p] << 24) >>> 0) + (u[p + 1] << 16) + (u[p + 2] << 8) + u[p + 3];
const ID3_KEYS = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'albumArtist', TP2: 'albumArtist', TALB: 'album', TAL: 'album', TRCK: 'no', TRK: 'no' };
function id3(u) {
  if (u.length < 10 || u[0] !== 0x49 || u[1] !== 0x44 || u[2] !== 0x33) return null;
  const ver = u[3], flags = u[5], end = Math.min(u.length, 10 + syncsafe(u, 6));
  let p = 10;
  if (flags & 0x40 && ver > 2) p += ver === 4 ? syncsafe(u, p) : be32(u, p) + 4;
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10, out = {};
  while (p + hdr <= end) {
    const id = String.fromCharCode(...u.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const sz = ver === 2 ? (u[p + 3] << 16 | u[p + 4] << 8 | u[p + 5]) : ver === 4 ? syncsafe(u, p + 4) : be32(u, p + 4);
    if (sz <= 0) break;
    const body = u.subarray(p + hdr, Math.min(end, p + hdr + sz));
    p += hdr + sz;
    const key = ID3_KEYS[id];
    if (key && body.length > 1 && !out[key]) out[key] = text(body.subarray(1), body[0]).split('\u0000')[0];
    else if ((id === 'APIC' || id === 'PIC') && !out.cover) out.cover = picture(body, ver);
  }
  return out;
}
function picture(b, ver) {
  const enc = b[0];
  let p = 1, mime = 'image/jpeg';
  if (ver === 2) { if (String.fromCharCode(b[1], b[2], b[3]).toLowerCase() === 'png') mime = 'image/png'; p = 4; }
  else {
    let e = p; while (e < b.length && b[e] !== 0) e++;
    const m = String.fromCharCode(...b.subarray(p, e)).toLowerCase();
    mime = m.includes('png') ? 'image/png' : 'image/jpeg'; p = e + 1;
  }
  p++; // picture type
  if (enc === 1 || enc === 2) { while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2; p += 2; }
  else { while (p < b.length && b[p] !== 0) p++; p++; }
  return p < b.length - 16 ? { mime, bytes: b.subarray(p) } : null;
}
function id3v1(u) {
  if (u.length < 128) return null;
  const t = u.subarray(u.length - 128);
  if (t[0] !== 0x54 || t[1] !== 0x41 || t[2] !== 0x47) return null;
  const f = (a, b) => oneByte(t.subarray(a, b)).split('\u0000')[0];
  return { title: f(3, 33), artist: f(33, 63), album: f(63, 93) };
}
const MP4_KEYS = { '©nam': 'title', '©ART': 'artist', aART: 'albumArtist', '©alb': 'album' };
function mp4(u) {
  if (u.length < 12 || String.fromCharCode(u[4], u[5], u[6], u[7]) !== 'ftyp') return null;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = {};
  const type = p => String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
  const kids = (s, e, cb) => {
    let p = s;
    while (p + 8 <= e) {
      let sz = dv.getUint32(p), h = 8;
      if (sz === 1) { if (p + 16 > e) break; sz = Number(dv.getBigUint64(p + 8)); h = 16; } else if (sz === 0) sz = e - p;
      if (sz < h || p + sz > e) break;
      cb(type(p + 4), p + h, p + sz);
      p += sz;
    }
  };
  const walk = (s, e, inList) => kids(s, e, (t, a, b) => {
    if (t === 'moov' || t === 'udta') walk(a, b, false);
    else if (t === 'meta') walk(type(a + 8) === 'hdlr' ? a + 4 : a, b, false); // usually a "full box" with 4 bytes of version first
    else if (t === 'ilst') walk(a, b, true);
    else if (inList) kids(a, b, (t2, a2, b2) => {
      if (t2 !== 'data' || b2 - a2 < 8) return;
      const kind = dv.getUint32(a2) & 0xffffff, payload = u.subarray(a2 + 8, b2);
      if (MP4_KEYS[t] && !out[MP4_KEYS[t]]) out[MP4_KEYS[t]] = dec(payload, 'utf-8');
      else if (t === 'trkn' && payload.length >= 4 && !out.no) out.no = String(dv.getUint16(a2 + 10));
      else if (t === 'covr' && !out.cover && payload.length > 16) out.cover = { mime: kind === 14 ? 'image/png' : 'image/jpeg', bytes: payload };
    });
  });
  walk(0, u.length, false);
  return out;
}
export function readTags(u) {
  try { return id3(u) || mp4(u) || id3v1(u); } catch (e) { return null; }
}
