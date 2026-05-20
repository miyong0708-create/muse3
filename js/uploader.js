/**
 * uploader.js — M4A file upload to IndexedDB
 */
const Uploader = (() => {
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanName(filename) {
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
  }

  async function uploadFiles(files, onProgress) {
    const results = [];
    for (const file of files) {
      const id = generateId();
      onProgress && onProgress({ id, name: file.name, status: 'saving' });
      try {
        const track = {
          id,
          name: cleanName(file.name),
          artist: '',
          blob: file,
          size: file.size,
          addedAt: new Date().toISOString(),
          duration: null
        };
        await DB.saveTrack(track);
        results.push({ id, name: track.name, ok: true });
        onProgress && onProgress({ id, name: file.name, status: 'done' });
      } catch (e) {
        console.error('upload error', e);
        onProgress && onProgress({ id, name: file.name, status: 'error' });
        results.push({ id, name: file.name, ok: false });
      }
    }
    return results;
  }

  // Re-import: match by filename to existing track ID
  async function reimportFiles(files) {
    const allTracks = await DB.getAllTracks();
    let matched = 0, skipped = 0;
    for (const file of files) {
      const cleanedName = cleanName(file.name);
      const track = allTracks.find(t =>
        t.name === cleanedName ||
        t.name.toLowerCase() === cleanedName.toLowerCase()
      );
      if (track) {
        track.blob = file;
        track.size = file.size;
        await DB.saveTrack(track);
        matched++;
      } else {
        skipped++;
      }
    }
    return { matched, skipped };
  }

  return { uploadFiles, reimportFiles };
})();
