/**
 * lyrics.js — Lyrics storage + display overlay
 */
const Lyrics = (() => {
  let _visible = false;
  let _currentTrackId = null;

  async function openEditor(trackId) {
    _currentTrackId = trackId;
    const data = await DB.getLyrics(trackId);
    document.getElementById('lyrics-track-id').value = trackId;
    document.getElementById('lyrics-textarea').value = data ? data.text : '';
    UI.openModal('modal-lyrics');
  }

  async function save() {
    const trackId = document.getElementById('lyrics-track-id').value;
    const text = document.getElementById('lyrics-textarea').value.trim();
    await DB.saveLyrics(trackId, text);
    UI.closeModal('modal-lyrics');
    UI.toast('歌詞を保存しました ✓');
    // Refresh overlay if showing
    if (_visible && _currentTrackId === trackId) await _refreshOverlay(trackId);
  }

  async function _refreshOverlay(trackId) {
    const data = await DB.getLyrics(trackId);
    const el = document.getElementById('lyrics-content');
    el.textContent = data && data.text ? data.text : '（歌詞未登録）';
  }

  async function showOverlay(trackId) {
    _currentTrackId = trackId;
    await _refreshOverlay(trackId);
    document.getElementById('lyrics-overlay').classList.remove('hidden');
    _visible = true;
    document.getElementById('fp-lyrics-btn').classList.add('active');
    const coverEdit = document.getElementById('fp-cover-edit');
    if (coverEdit) coverEdit.style.display = 'none';
  }

  function hideOverlay() {
    document.getElementById('lyrics-overlay').classList.add('hidden');
    _visible = false;
    document.getElementById('fp-lyrics-btn').classList.remove('active');
    const coverEdit = document.getElementById('fp-cover-edit');
    if (coverEdit) coverEdit.style.display = 'flex';
  }

  async function toggle(trackId) {
    if (_visible) hideOverlay();
    else await showOverlay(trackId);
  }

  async function onTrackChange(trackId) {
    _currentTrackId = trackId;
    if (_visible) await _refreshOverlay(trackId);
  }

  return { openEditor, save, showOverlay, hideOverlay, toggle, onTrackChange };
})();
