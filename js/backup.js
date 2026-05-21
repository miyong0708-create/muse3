/**
 * backup.js — JSON export/import (metadata + covers as base64, no audio blobs)
 * v2: 歌詞・再生統計・お気に入りのバックアップに対応
 */
const Backup = (() => {
  async function exportData() {
    const [tracks, playlists, covers, allStats, allLyrics] = await Promise.all([
      DB.getAllTracks(), DB.getAllPlaylists(), DB.getAllCovers(),
      DB.getAllStats(), DB.getAllLyrics()
    ]);

    // Convert cover blobs to base64
    const coversB64 = await Promise.all(covers.map(c => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ trackId: c.trackId, dataUrl: reader.result, type: c.blob.type });
      reader.onerror = () => resolve({ trackId: c.trackId, dataUrl: null });
      reader.readAsDataURL(c.blob);
    })));

    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      tracks: tracks.map(({ id, name, artist, addedAt, duration }) => ({ id, name, artist, addedAt, duration })),
      playlists,
      covers: coversB64.filter(c => c.dataUrl),
      lyrics: allLyrics,
      stats: allStats,
      settings: {
        shuffleMode_library: await DB.getSetting('shuffleMode_library', false),
        repeatMode_library:  await DB.getSetting('repeatMode_library', 'none')
      }
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `muse_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(`エクスポート完了 (${tracks.length}曲)`);
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.tracks) throw new Error('Invalid format');

      let imported = 0, skipped = 0;

      // Import track metadata (no blob — skip if track already has a blob)
      const existingTracks = await DB.getAllTracks();
      const existingIds = new Set(existingTracks.map(t => t.id));

      for (const t of data.tracks) {
        if (existingIds.has(t.id)) {
          // Update metadata only
          await DB.updateTrackMeta(t.id, { name: t.name, artist: t.artist });
          skipped++;
        } else {
          // Create a stub track (no blob — user needs to reimport the file)
          await DB.saveTrack({
            id: t.id, name: t.name, artist: t.artist || '',
            blob: null, size: 0,
            addedAt: t.addedAt || new Date().toISOString(),
            duration: t.duration || null
          });
          imported++;
        }
      }

      // Import playlists
      for (const p of (data.playlists || [])) {
        await DB.savePlaylist(p);
      }

      // Import covers
      for (const c of (data.covers || [])) {
        if (!c.dataUrl) continue;
        const res = await fetch(c.dataUrl);
        const blob = await res.blob();
        await DB.saveCover(c.trackId, blob);
      }

      // Import lyrics（v2以降）
      for (const l of (data.lyrics || [])) {
        if (l.trackId && l.text) {
          await DB.saveLyrics(l.trackId, l.text);
        }
      }

      // Import stats（v2以降）
      for (const s of (data.stats || [])) {
        if (s.trackId) {
          await DB.saveStats(s);
        }
      }

      // Restore settings（コンテキスト付きキーで保存）
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          await DB.setSetting(key, value);
        }
      }

      UI.toast(`インポート完了 (${imported}件追加, ${skipped}件更新)`);
      return true;
    } catch (e) {
      console.error('import error', e);
      UI.toast('インポートに失敗しました');
      return false;
    }
  }

  return { exportData, importData };
})();
