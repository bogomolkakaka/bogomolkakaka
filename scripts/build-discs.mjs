// Builds data/discs.json: the 30-second Apple Music previews for every CD in the player.
// Runs on GitHub's servers (see .github/workflows/discs.yml), because the Apple catalogue
// often does not open from Russia. The site then only reads this ready list.
// Only links are stored here, never the audio itself.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DISCS, lookupDisc } from '../js/discs.js';

import { pathToFileURL } from 'node:url';
const OUT = process.env.DISCS_OUT ? pathToFileURL(process.env.DISCS_OUT) : new URL('../data/discs.json', import.meta.url);
const API = process.env.ITUNES_API || 'https://itunes.apple.com/search';
const GAP = Number(process.env.ITUNES_GAP_MS ?? 3500); // Apple allows about 20 requests a minute
const sleep = ms => new Promise(r => setTimeout(r, ms));

let last = 0, asked = 0;
async function search(params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + GAP - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now(); asked++;
    const url = `${API}?${new URLSearchParams({ ...params, media: 'music', entity: 'song', country: 'us' })}`;
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return JSON.parse(await r.text()).results || [];
      console.warn(`  HTTP ${r.status} for "${params.term}", trying again`);
    } catch (e) {
      console.warn(`  ${e.message} for "${params.term}", trying again`);
    }
    await sleep(Math.max(GAP, 1000) * 4 * (attempt + 1));
  }
  console.warn(`  gave up on "${params.term}"`);
  return [];
}

let old = {};
try { old = JSON.parse(await readFile(OUT, 'utf8')).discs || {}; } catch { /* first run */ }

const discs = {};
let total = 0;
for (const disc of DISCS) {
  const list = await lookupDisc(disc, search);
  const prev = old[disc.id] || [];
  // a bad day at Apple should not empty a disc that worked before
  if (list.length < Math.ceil(disc.tracks.length / 2) && prev.length > list.length) {
    console.warn(`${disc.id}: only ${list.length} of ${disc.tracks.length} found, keeping the previous ${prev.length}`);
    discs[disc.id] = prev;
  } else {
    discs[disc.id] = list;
  }
  total += discs[disc.id].length;
  console.log(`${disc.id}: ${discs[disc.id].length} of ${disc.tracks.length}`);
}
console.log(`${asked} requests, ${total} songs`);
if (!total) { console.error('No songs found at all. Not writing the file.'); process.exit(1); }

// the date only changes when the songs do, so an unchanged list makes no new commit
const same = JSON.stringify(old) === JSON.stringify(discs);
let updated = new Date().toISOString().slice(0, 10);
if (same) { try { updated = JSON.parse(await readFile(OUT, 'utf8')).updated || updated; } catch { /* keep today */ } }
await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated, source: 'Apple Music previews (iTunes Search API)', discs }, null, 1) + '\n');
console.log(same ? 'No changes.' : `Wrote ${OUT.pathname}`);
