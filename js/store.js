// Data layer. "cloud" = Supabase (shared by everyone); "local" = this browser only (demo mode until the database is connected).
import { CONFIG } from './config.js';
import { lsGet, lsSet, uid as newId, todayKey, addDays, hashStr, blobToDataURL } from './util.js';

const CLOUD = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const SB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let sb = null;
export const state = { mode: 'local', uid: null, admin: false, email: '', ready: false };
const authSubs = new Set();
export const onAuth = f => { authSubs.add(f); return () => authSubs.delete(f); };
const emitAuth = () => authSubs.forEach(f => { try { f(state); } catch (e) { console.error(e); } });

export class StoreError extends Error { constructor(message, code) { super(message); this.code = code; } }
function friendly(err) {
  const raw = String((err && (err.message || err.error_description || err.msg)) || err || '');
  if (/slow_down/.test(raw)) return new StoreError('Слишком быстро. Подожди минутку и попробуй снова.', 'slow');
  if (/daily_limit/.test(raw)) return new StoreError('Сегодня ты добавил(а) уже много. Оставь место другим и приходи завтра.', 'limit');
  if (/too_long/.test(raw)) return new StoreError('Текст слишком длинный. Уложись в 280 символов.', 'long');
  if (/bad_link/.test(raw)) return new StoreError('Ссылка должна начинаться с https:// или http://', 'link');
  if (/row-level security|violates|permission denied|JWT|not authorized/i.test(raw)) return new StoreError('Это нельзя изменить: это не твоё или день уже в архиве.', 'denied');
  if (/Anonymous sign-ins are disabled/i.test(raw)) return new StoreError('Гостевые публикации выключены в настройках базы.', 'anon');
  if (/maximum allowed size|Payload too large|too large/i.test(raw)) return new StoreError('Картинка слишком большая. Попробуй поменьше.', 'size');
  if (/Invalid login credentials/i.test(raw)) return new StoreError('Неверная почта или пароль.', 'login');
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return new StoreError('Нет связи со студией. Проверь интернет и попробуй ещё раз.', 'network');
  return new StoreError(raw || 'Что-то пошло не так. Попробуй ещё раз.', 'unknown');
}
const must = ({ data, error }) => { if (error) throw friendly(error); return data; };

let demoCache = null;
export async function demo() {
  if (!demoCache) { const r = await fetch('data/demo.json', { cache: 'no-cache' }); demoCache = await r.json(); }
  return demoCache;
}

export async function initStore() {
  if (CLOUD) {
    try {
      const mod = window.__SUPABASE_MOCK__ || await import(SB_URL);
      sb = mod.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { data } = await sb.auth.getSession();
      state.mode = 'cloud';
      await applySession(data && data.session);
      sb.auth.onAuthStateChange((_e, session) => { applySession(session).then(emitAuth); });
    } catch (e) { console.warn('Database unreachable, running in local mode', e); sb = null; state.mode = 'local'; }
  }
  if (state.mode === 'local') {
    let id = lsGet('bg.guest', null);
    if (!id) { id = 'guest-' + newId(); lsSet('bg.guest', id); }
    state.uid = id;
  }
  state.ready = true;
  return state;
}
async function applySession(session) {
  const user = session && session.user;
  state.uid = user ? user.id : null;
  state.email = user && user.email ? user.email : '';
  state.admin = false;
  if (user && user.email) {
    try { const { data } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(); state.admin = !!data; } catch (e) { state.admin = false; }
  }
}
async function ensureGuest() {
  if (state.mode !== 'cloud') return state.uid;
  if (state.uid) return state.uid;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw friendly(error);
  state.uid = data.user.id;
  return state.uid;
}

/* ---------- client-side pacing (the database enforces its own limits too) ---------- */
const pace = { stamps: [] };
function checkPace(day) {
  if (state.admin) return;
  const now = Date.now();
  pace.stamps = pace.stamps.filter(t => now - t < 60000);
  if (pace.stamps.length >= 6) throw new StoreError('Слишком быстро. Подожди минутку и попробуй снова.', 'slow');
  const count = lsGet('bg.count.' + day, 0);
  if (count >= 40) throw new StoreError('Сегодня ты добавил(а) уже много. Оставь место другим и приходи завтра.', 'limit');
}
function notePace(day) { pace.stamps.push(Date.now()); lsSet('bg.count.' + day, lsGet('bg.count.' + day, 0) + 1); }

/* ---------- files ---------- */
export async function upload(bucket, blob, ext) {
  if (state.mode !== 'cloud') return blobToDataURL(blob);
  await ensureGuest();
  const path = (bucket === 'wall' ? `${state.uid}/${todayKey()}/` : `${bucket === 'media' ? 'm' : bucket}/`) + newId() + '.' + ext;
  must(await sb.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' }));
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ---------- wall ---------- */
const LKEY = d => 'bg.wall.' + d;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('bg-wall') : null;
const localSubs = new Set();
if (bc) bc.onmessage = e => localSubs.forEach(f => f(e.data));
const localItems = day => lsGet(LKEY(day), null);
function saveLocal(day, items) {
  if (!lsSet(LKEY(day), items)) throw new StoreError('В браузере закончилось место для стены. Убери пару картинок и попробуй снова.', 'quota');
}
function normItem(r) {
  return { id: r.id, day: r.day, kind: r.kind, x: +r.x || 0, y: +r.y || 0, w: +r.w || 200, h: +r.h || 200, rot: +r.rot || 0, z: +r.z || 0, data: r.data || {}, owner: r.owner, hidden: !!r.hidden, created_at: r.created_at };
}
async function demoDay(day) {
  const d = await demo();
  const off = Math.round((Date.parse(day) - Date.parse(todayKey())) / 864e5);
  const entry = (d.archive || []).find(a => a.offset === off);
  return entry ? entry.items.map((it, i) => normItem({ ...it, id: `demo-${day}-${i}`, day, owner: 'demo', z: i })) : [];
}

export const wall = {
  async list(day) {
    if (state.mode === 'cloud') {
      const rows = must(await sb.from('wall_items').select('*').eq('day', day).order('z', { ascending: true }).limit(1500));
      return rows.map(normItem);
    }
    const own = localItems(day);
    return own ? own.map(normItem) : (day === todayKey() ? [] : demoDay(day));
  },
  async listRange(from, to) {
    if (state.mode === 'cloud') {
      const rows = must(await sb.from('wall_items').select('id,day,kind,x,y,w,h,rot,z,data').gte('day', from).lte('day', to).order('z', { ascending: true }).limit(5000));
      return rows.map(normItem);
    }
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(...await this.list(d));
    return out;
  },
  async add(item) {
    const day = item.day;
    checkPace(day);
    if (state.mode === 'cloud') {
      await ensureGuest();
      const row = must(await sb.from('wall_items').insert({ day, kind: item.kind, x: item.x, y: item.y, w: item.w, h: item.h, rot: item.rot || 0, z: item.z || 0, data: item.data, owner: state.uid }).select().single());
      notePace(day);
      return normItem(row);
    }
    const items = localItems(day) || [];
    const row = normItem({ ...item, id: newId(), owner: state.uid, created_at: new Date().toISOString() });
    items.push(row); saveLocal(day, items); notePace(day);
    bc && bc.postMessage({ day, type: 'INSERT', item: row });
    return row;
  },
  async update(id, day, patch) {
    if (state.mode === 'cloud') {
      const rows = must(await sb.from('wall_items').update(patch).eq('id', id).select());
      if (!rows || !rows.length) throw new StoreError('Это нельзя изменить: это не твоё или день уже в архиве.', 'denied');
      return normItem(rows[0]);
    }
    const items = localItems(day) || [];
    const i = items.findIndex(x => x.id === id);
    if (i < 0) throw new StoreError('Этого уже нет на стене.', 'gone');
    items[i] = { ...items[i], ...patch }; saveLocal(day, items);
    bc && bc.postMessage({ day, type: 'UPDATE', item: items[i] });
    return normItem(items[i]);
  },
  async remove(id, day) {
    if (state.mode === 'cloud') { must(await sb.from('wall_items').delete().eq('id', id)); return; }
    const items = (localItems(day) || []).filter(x => x.id !== id);
    saveLocal(day, items);
    bc && bc.postMessage({ day, type: 'DELETE', item: { id } });
  },
  async report(id, reason) {
    if (state.mode === 'cloud') {
      await ensureGuest();
      const { error } = await sb.from('wall_reports').insert({ item_id: id, reason: String(reason || '').slice(0, 200), reporter: state.uid });
      if (error && !/duplicate|unique/i.test(error.message || '')) throw friendly(error);
      return;
    }
    const hidden = lsGet('bg.reported', []); hidden.push(id); lsSet('bg.reported', hidden);
  },
  reportedLocally() { return new Set(lsGet('bg.reported', [])); },
  subscribe(day, cb) {
    if (state.mode === 'cloud') {
      const ch = sb.channel('wall-' + day)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wall_items', filter: 'day=eq.' + day }, p => {
          const type = p.eventType;
          if (type === 'DELETE') cb({ type, item: { id: p.old && p.old.id } });
          else if (p.new && p.new.day === day) cb({ type, item: normItem(p.new) });
        })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) { /* ignore */ } };
    }
    const f = m => { if (m.day === day) cb({ type: m.type, item: m.type === 'DELETE' ? m.item : normItem(m.item) }); };
    localSubs.add(f);
    return () => localSubs.delete(f);
  }
};

/* ---------- collections edited by the owner: objects (figurines), works (portfolio) ---------- */
function collection(table, demoKey) {
  return {
    async list() {
      if (state.mode === 'cloud') {
        const rows = must(await sb.from(table).select('id,sort,draft,data').order('sort', { ascending: true }));
        return rows.map(r => ({ ...(r.data || {}), id: r.id, order: r.sort, draft: !!r.draft }));
      }
      const d = await demo();
      return (d[demoKey] || []).map((x, i) => ({ ...x, order: x.order != null ? x.order : (i + 1) * 10 }));
    },
    async save(obj) {
      if (state.mode !== 'cloud') throw new StoreError('Сначала подключи базу: редактирование заработает, когда сайт будет связан с Supabase (см. README).', 'local');
      const { id, order, draft, ...data } = obj;
      must(await sb.from(table).upsert({ id, sort: order, draft: !!draft, data, updated_at: new Date().toISOString() }));
    },
    async setOrder(id, order) {
      if (state.mode !== 'cloud') throw new StoreError('Сначала подключи базу.', 'local');
      must(await sb.from(table).update({ sort: order }).eq('id', id));
    },
    async remove(id) {
      if (state.mode !== 'cloud') throw new StoreError('Сначала подключи базу.', 'local');
      must(await sb.from(table).delete().eq('id', id));
    }
  };
}
export const objects = collection('objects', 'objects');
export const works = collection('works', 'works');

/* ---------- site config, prompts, stickers ---------- */
export const config = {
  async all() {
    const base = { contacts: { ...CONFIG.CONTACTS }, timezone: CONFIG.TIMEZONE, frames_off: [], objects_intro: '', stuff_intro: '' };
    if (state.mode !== 'cloud') return base;
    try {
      const rows = must(await sb.from('site_config').select('key,value'));
      for (const r of rows) base[r.key] = r.value;
    } catch (e) { console.warn(e); }
    return base;
  },
  async set(key, value) {
    if (state.mode !== 'cloud') throw new StoreError('Сначала подключи базу.', 'local');
    must(await sb.from('site_config').upsert({ key, value }));
  }
};

export const prompts = {
  async list() {
    if (state.mode === 'cloud') return must(await sb.from('prompts').select('*').order('id', { ascending: true }));
    const d = await demo();
    return d.prompts.map((text, i) => ({ id: i + 1, text, active: true, day: null }));
  },
  async add(text, day) { must(await sb.from('prompts').insert({ text, day: day || null, active: true })); },
  async setActive(id, active) { must(await sb.from('prompts').update({ active }).eq('id', id)); },
  async remove(id) { must(await sb.from('prompts').delete().eq('id', id)); },
  pick(day, list) {
    const exact = list.find(p => p.day === day);
    if (exact) return exact.text;
    const act = list.filter(p => p.active !== false && !p.day);
    if (!act.length) return 'Оставь что-нибудь незнакомцу.';
    return act[hashStr(day) % act.length].text;
  }
};

export const stickers = {
  async list(all = false) {
    if (state.mode !== 'cloud') return [];
    let q = sb.from('stickers').select('*').order('sort', { ascending: true });
    if (!all) q = q.eq('active', true);
    try { return must(await q); } catch (e) { return []; }
  },
  async add(url, name) { must(await sb.from('stickers').insert({ url, name, active: true, sort: Date.now() / 1000 })); },
  async setActive(id, active) { must(await sb.from('stickers').update({ active }).eq('id', id)); },
  async remove(id) { must(await sb.from('stickers').delete().eq('id', id)); }
};

/* ---------- film & series recommendations (guests suggest, the owner approves) ---------- */
const RKEY = 'bg.recs';
function normRec(r) {
  const links = Array.isArray(r.links) ? r.links.filter(l => l && /^https?:\/\/[^\s"'<>]+$/i.test(l.url)).slice(0, 3).map(l => ({ url: String(l.url).slice(0, 500), label: String(l.label || '').slice(0, 40) })) : [];
  return { id: String(r.id), kind: r.kind === 'series' ? 'series' : 'film', title: String(r.title || '').slice(0, 120), year: String(r.year || '').slice(0, 9), genre: String(r.genre || '').slice(0, 40),
    note: String(r.note || '').slice(0, 600), author: String(r.author || '').slice(0, 40), links, by_owner: !!r.by_owner, status: ['approved', 'pending', 'rejected'].includes(r.status) ? r.status : 'pending',
    owner: r.owner, demo: !!r.demo, created_at: r.created_at || '' };
}
export const recs = {
  async list() {
    if (state.mode === 'cloud') return must(await sb.from('recs').select('*').order('created_at', { ascending: false }).limit(500)).map(normRec);
    const d = await demo();
    const mine = lsGet(RKEY, []);
    return [...mine, ...(d.recs || []).map((r, i) => ({ ...r, id: 'demo-rec-' + i, status: 'approved', demo: true, owner: 'demo' }))].map(normRec);
  },
  async add(rec) {
    const now = Date.now();
    const stamps = lsGet('bg.rec.stamps', []).filter(t => now - t < 864e5);
    if (!state.admin && stamps.filter(t => now - t < 6e5).length >= 3) throw new StoreError('Слишком быстро. Подожди несколько минут и попробуй снова.', 'slow');
    if (!state.admin && stamps.length >= 10) throw new StoreError('На сегодня хватит советов. Приходи завтра.', 'limit');
    const row = { kind: rec.kind, title: rec.title, year: rec.year, genre: rec.genre, note: rec.note, author: rec.author, links: rec.links };
    let out;
    if (state.mode === 'cloud') { await ensureGuest(); out = normRec(must(await sb.from('recs').insert({ ...row, owner: state.uid }).select().single())); }
    else { out = normRec({ ...row, id: newId(), status: 'pending', owner: state.uid, created_at: new Date().toISOString() }); lsSet(RKEY, [out, ...lsGet(RKEY, [])]); }
    lsSet('bg.rec.stamps', [...stamps, now]);
    return out;
  },
  async update(id, patch) { must(await sb.from('recs').update(patch).eq('id', id)); },
  async remove(id) {
    if (state.mode === 'cloud') { must(await sb.from('recs').delete().eq('id', id)); return; }
    lsSet(RKEY, lsGet(RKEY, []).filter(r => r.id !== id));
  },
  async report(id, reason) {
    if (state.mode === 'cloud') {
      await ensureGuest();
      const { error } = await sb.from('rec_reports').insert({ rec_id: id, reason: String(reason || '').slice(0, 200), reporter: state.uid });
      if (error && !/duplicate|unique/i.test(error.message || '')) throw friendly(error);
      return;
    }
    const hidden = lsGet('bg.reported', []); hidden.push(id); lsSet('bg.reported', hidden);
  },
  async pending() { return must(await sb.from('recs').select('*').eq('status', 'pending').order('created_at', { ascending: true })).map(normRec); },
  async setStatus(id, status) { must(await sb.from('recs').update({ status }).eq('id', id)); },
  async reports() {
    const reps = must(await sb.from('rec_reports').select('rec_id,reason,created_at').order('created_at', { ascending: false }).limit(300));
    const ids = [...new Set(reps.map(r => r.rec_id))];
    const items = ids.length ? must(await sb.from('recs').select('*').in('id', ids)) : [];
    return { reports: reps, items: items.map(normRec) };
  },
  async clearReports(id) { must(await sb.from('rec_reports').delete().eq('rec_id', id)); }
};

/* ---------- admin ---------- */
export const admin = {
  async signIn(email, password) {
    if (state.mode !== 'cloud') throw new StoreError('Сначала подключи базу (см. README).', 'local');
    must(await sb.auth.signInWithPassword({ email, password }));
    const { data } = await sb.auth.getSession();
    await applySession(data.session); emitAuth();
    if (!state.admin) throw new StoreError('Вход выполнен, но этого аккаунта ещё нет в таблице admins (README, шаг 4).', 'notadmin');
  },
  async signOut() { if (sb) await sb.auth.signOut(); await applySession(null); emitAuth(); },
  async reports() {
    const reps = must(await sb.from('wall_reports').select('item_id,reason,created_at').order('created_at', { ascending: false }).limit(300));
    const ids = [...new Set(reps.map(r => r.item_id))];
    const items = ids.length ? must(await sb.from('wall_items').select('*').in('id', ids)) : [];
    return { reports: reps, items: items.map(normItem) };
  },
  async dayItems(day) { return must(await sb.from('wall_items').select('*').eq('day', day).order('created_at', { ascending: false })).map(normItem); },
  async setHidden(id, hidden) { must(await sb.from('wall_items').update({ hidden }).eq('id', id)); },
  async removeItem(id) { must(await sb.from('wall_items').delete().eq('id', id)); },
  async clearReports(id) { must(await sb.from('wall_reports').delete().eq('item_id', id)); }
};
