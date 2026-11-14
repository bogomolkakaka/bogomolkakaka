// The discs in the CD player and how a song is matched in the Apple Music catalogue.
// Plain data and pure functions: the site and the GitHub job that builds data/discs.json both use this file.
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

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const SKIP = /karaoke|instrumental|remix|\blive\b|acoustic|re-?recorded|tribute|made famous|originally performed|cover|edit\)|mix[)\]]|version\)/i;

// The original studio recording: right artist, right title, no karaoke or remixes, earliest release wins.
export function best(results, artist, title) {
  const a = norm(artist), t = norm(title);
  const ok = (results || []).filter(r => r.previewUrl && r.kind === 'song' && norm(r.artistName).includes(a) && norm(r.trackName).startsWith(t) && (SKIP.test(title) || !SKIP.test(r.trackName + ' ' + (r.collectionName || ''))));
  ok.sort((x, y) => String(x.releaseDate).localeCompare(String(y.releaseDate)));
  const r = ok[0];
  return r ? { title: r.trackName, artist: r.artistName, src: r.previewUrl, url: r.trackViewUrl || '', year: String(r.releaseDate || '').slice(0, 4) } : null;
}

// One song by name; if covers and karaoke crowd it out, ask again by the song title alone.
async function one(artist, title, search) {
  const name = artist.replace('*', '');
  return best(await search({ term: `${name} ${title}`, limit: 25 }), artist, title)
    || best(await search({ term: title, attribute: 'songTerm', limit: 200 }), artist, title);
}

// Every catalogue question a disc needs, in order. `search(params)` returns the raw results array.
export async function lookupDisc(disc, search) {
  if (disc.mix) {
    const list = [];
    for (const [artist, title] of disc.tracks) list.push(await one(artist, title, search));
    return list.filter(Boolean);
  }
  const name = disc.artist.replace('*', '');
  const list = disc.tracks.map(() => null);
  const all = await search({ term: name, attribute: 'artistTerm', limit: 200 });
  disc.tracks.forEach((title, k) => { list[k] = best(all, disc.artist, title); });
  // a hit missing from the artist's top 200: ask for it by name
  for (let k = 0; k < list.length; k++) if (!list[k]) list[k] = await one(disc.artist, disc.tracks[k], search);
  return list.filter(Boolean);
}
