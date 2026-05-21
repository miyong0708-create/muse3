/**
 * db.js — IndexedDB wrapper for Muse
 * Stores: tracks, covers, playlists, settings, lyrics, stats
 */
const DB = (() => {
  const DB_NAME = 'MuseDB';
  const DB_VERSION = 2; // bumped: added lyrics + stats stores
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVer = e.oldVersion;
        if (oldVer < 1) {
          db.createObjectStore('tracks', { keyPath: 'id' });
          db.createObjectStore('covers', { keyPath: 'trackId' });
          db.createObjectStore('playlists', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVer < 2) {
          if (!db.objectStoreNames.contains('lyrics'))
            db.createObjectStore('lyrics', { keyPath: 'trackId' });
          if (!db.objectStoreNames.contains('stats'))
            db.createObjectStore('stats', { keyPath: 'trackId' });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }
  function wrap(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // ── Tracks ──────────────────────────────
  async function getAllTracks() { await open(); return wrap(tx('tracks').getAll()); }
  async function getTrack(id) { await open(); return wrap(tx('tracks').get(id)); }
  async function saveTrack(data) { await open(); return wrap(tx('tracks', 'readwrite').put(data)); }
  async function updateTrackMeta(id, updates) {
    await open();
    const track = await wrap(tx('tracks', 'readwrite').get(id));
    if (!track) return;
    Object.assign(track, updates);
    return wrap(tx('tracks', 'readwrite').put(track));
  }
  async function deleteTrack(id) { await open(); return wrap(tx('tracks', 'readwrite').delete(id)); }

  // ── Covers ──────────────────────────────
  async function getCover(trackId) { await open(); return wrap(tx('covers').get(trackId)); }
  async function saveCover(trackId, blob) { await open(); return wrap(tx('covers', 'readwrite').put({ trackId, blob })); }
  async function deleteCover(trackId) { await open(); return wrap(tx('covers', 'readwrite').delete(trackId)); }
  async function getAllCovers() { await open(); return wrap(tx('covers').getAll()); }

  // ── Playlists ───────────────────────────
  async function getAllPlaylists() { await open(); return wrap(tx('playlists').getAll()); }
  async function getPlaylist(id) { await open(); return wrap(tx('playlists').get(id)); }
  async function savePlaylist(data) { await open(); return wrap(tx('playlists', 'readwrite').put(data)); }
  async function deletePlaylist(id) { await open(); return wrap(tx('playlists', 'readwrite').delete(id)); }

  // ── Settings ─────────────────────────────
  async function getSetting(key, fallback = null) {
    await open();
    const r = await wrap(tx('settings').get(key));
    return r ? r.value : fallback;
  }
  async function setSetting(key, value) { await open(); return wrap(tx('settings', 'readwrite').put({ key, value })); }

  // ── Lyrics ───────────────────────────────
  async function getLyrics(trackId) { await open(); return wrap(tx('lyrics').get(trackId)); }
  async function getAllLyrics() { await open(); return wrap(tx('lyrics').getAll()); }
  async function saveLyrics(trackId, text) {
    await open();
    return wrap(tx('lyrics', 'readwrite').put({ trackId, text, updatedAt: new Date().toISOString() }));
  }
  async function deleteLyrics(trackId) { await open(); return wrap(tx('lyrics', 'readwrite').delete(trackId)); }

  // ── Stats ────────────────────────────────
  async function getStats(trackId) {
    await open();
    return (await wrap(tx('stats').get(trackId))) || { trackId, playCount: 0, lastPlayed: null, favorite: false };
  }
  async function getAllStats() { await open(); return wrap(tx('stats').getAll()); }
  async function saveStats(data) { await open(); return wrap(tx('stats', 'readwrite').put(data)); }
  async function incrementPlayCount(trackId) {
    await open();
    const s = await getStats(trackId);
    s.playCount = (s.playCount || 0) + 1;
    s.lastPlayed = new Date().toISOString();
    return wrap(tx('stats', 'readwrite').put(s));
  }
  async function toggleFavorite(trackId) {
    await open();
    const s = await getStats(trackId);
    s.favorite = !s.favorite;
    await wrap(tx('stats', 'readwrite').put(s));
    return s.favorite;
  }

  // ── Storage estimate ─────────────────────
  async function getStorageInfo() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    return navigator.storage.estimate();
  }

  return {
    open,
    getAllTracks, getTrack, saveTrack, updateTrackMeta, deleteTrack,
    getCover, saveCover, deleteCover, getAllCovers,
    getAllPlaylists, getPlaylist, savePlaylist, deletePlaylist,
    getSetting, setSetting,
    getLyrics, getAllLyrics, saveLyrics, deleteLyrics,
    getStats, getAllStats, saveStats, incrementPlayCount, toggleFavorite,
    getStorageInfo
  };
})();
