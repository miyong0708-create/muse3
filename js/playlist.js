/**
 * playlist.js — Playlist CRUD + touch drag-to-reorder
 */
const PlaylistManager = (() => {
  let _playlists = [];
  let _currentPlaylistId = null;

  // ── Render playlist list ─────────────────
  async function renderPlaylists() {
    _playlists = await DB.getAllPlaylists();
    const list = document.getElementById('playlist-list');
    const empty = document.getElementById('playlists-empty');
    list.innerHTML = '';
    if (!_playlists.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    _playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className = 'playlist-item';
      li.innerHTML = `
        <div class="playlist-icon">🎵</div>
        <div class="playlist-item-meta">
          <p class="playlist-item-name">${escHtml(pl.name)}</p>
          <p class="playlist-item-count">${pl.trackIds.length}曲</p>
        </div>
        <div class="playlist-item-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>`;
      li.addEventListener('click', () => openPlaylistDetail(pl.id));
      list.appendChild(li);
    });
  }

  // ── Playlist detail ──────────────────────
  async function openPlaylistDetail(id) {
    _currentPlaylistId = id;
    const pl = await DB.getPlaylist(id);
    if (!pl) return;
    document.getElementById('playlist-detail-name').textContent = pl.name;
    const detailEl = document.getElementById('playlist-detail');
    detailEl.dataset.currentId = id;  // store for app.js to read
    detailEl.classList.remove('hidden');
    await renderDetailTracks(pl);
  }

  async function renderDetailTracks(pl) {
    const allTracks = await DB.getAllTracks();
    const trackMap = Object.fromEntries(allTracks.map(t => [t.id, t]));
    const ul = document.getElementById('playlist-detail-tracks');
    ul.innerHTML = '';
    pl.trackIds.forEach((tid, idx) => {
      const t = trackMap[tid];
      if (!t) return;
      const li = document.createElement('li');
      li.className = 'track-item sortable-item';
      li.dataset.trackId = tid;
      li.dataset.idx = idx;
      li.innerHTML = `
        <div class="drag-handle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h6M9 12h6M9 18h6"/></svg>
        </div>
        <div class="track-cover"><canvas width="50" height="50"></canvas></div>
        <div class="track-meta">
          <p class="track-name">${escHtml(t.name || 'Unknown')}</p>
          <p class="track-artist">${escHtml(t.artist || '')}</p>
        </div>
        <button class="track-menu-btn" data-remove="${tid}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>`;
      // Draw cover
      const canvas = li.querySelector('canvas');
      DB.getCover(tid).then(cover => {
        if (cover && cover.blob) UI.drawCoverFromBlob(canvas, cover.blob, 50);
        else UI.drawDefaultCover(canvas, tid, 50);
      });
      // Remove from playlist
      li.querySelector('[data-remove]').addEventListener('click', async e => {
        e.stopPropagation();
        await removeTrackFromPlaylist(pl.id, tid);
      });
      // Play on click (not drag handle)
      li.addEventListener('click', async e => {
        if (e.target.closest('.drag-handle') || e.target.closest('[data-remove]')) return;
        await playPlaylistFrom(pl.id, tid, allTracks);
        document.dispatchEvent(new CustomEvent('requestOpenFullPlayer'));
      });
      ul.appendChild(li);
    });
    initDragSort(ul, pl.id);
  }

  async function removeTrackFromPlaylist(plId, trackId) {
    const pl = await DB.getPlaylist(plId);
    if (!pl) return;
    pl.trackIds = pl.trackIds.filter(id => id !== trackId);
    await DB.savePlaylist(pl);
    await renderDetailTracks(pl);
    renderPlaylists();
  }

  // ── Touch & Mouse drag-to-reorder ────────────────
  function initDragSort(ul, plId) {
    let dragEl = null, placeholder = null, startY = 0;

    const moveDrag = (e) => {
      if (!dragEl) return;
      e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragEl.style.position = 'fixed';
      dragEl.style.left = ul.getBoundingClientRect().left + 'px';
      dragEl.style.width = ul.clientWidth + 'px';
      dragEl.style.top = (clientY - startY) + 'px';
      dragEl.style.zIndex = '1000';
      dragEl.style.background = 'var(--surface)';

      const els = [...ul.querySelectorAll('.sortable-item:not(.dragging)')];
      const after = els.find(el => {
        const box = el.getBoundingClientRect();
        return clientY < box.top + box.height / 2;
      });
      if (after) ul.insertBefore(placeholder, after);
      else ul.appendChild(placeholder);
    };

    const endDrag = async () => {
      if (!dragEl) return;
      document.removeEventListener('touchmove', moveDrag);
      document.removeEventListener('mousemove', moveDrag);
      document.removeEventListener('touchend', endDrag);
      document.removeEventListener('mouseup', endDrag);

      dragEl.style.position = '';
      dragEl.style.left = '';
      dragEl.style.width = '';
      dragEl.style.top = '';
      dragEl.style.zIndex = '';
      dragEl.style.background = '';
      dragEl.classList.remove('dragging');
      ul.insertBefore(dragEl, placeholder);
      placeholder.remove();
      placeholder = null;

      const newOrder = [...ul.querySelectorAll('.sortable-item')].map(el => el.dataset.trackId);
      const pl = await DB.getPlaylist(plId);
      if (pl) { pl.trackIds = newOrder; await DB.savePlaylist(pl); }
      dragEl = null;
    };

    ul.querySelectorAll('.drag-handle').forEach(handle => {
      const startDrag = (e) => {
        dragEl = handle.closest('.sortable-item');
        const rect = dragEl.getBoundingClientRect();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startY = clientY - rect.top;
        dragEl.classList.add('dragging');
        placeholder = document.createElement('li');
        placeholder.style.height = rect.height + 'px';
        placeholder.style.opacity = '0';
        placeholder.style.margin = '0';
        placeholder.style.padding = '0';
        ul.insertBefore(placeholder, dragEl.nextSibling);
        if (e.cancelable) e.preventDefault();
        
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('mousemove', moveDrag, { passive: false });
        document.addEventListener('touchend', endDrag);
        document.addEventListener('mouseup', endDrag);
      };

      handle.addEventListener('touchstart', startDrag, { passive: false });
      handle.addEventListener('mousedown', startDrag);
    });
  }

  // ── Play from playlist ────────────────────
  async function playPlaylistFrom(plId, startTrackId, trackList) {
    const pl = await DB.getPlaylist(plId);
    if (!pl || !pl.trackIds.length) return;
    await Player.setQueue(pl.trackIds, startTrackId, plId);
    await Player.play(startTrackId, trackList);
  }

  // ── Create playlist ───────────────────────
  async function createPlaylist(name) {
    if (!name.trim()) return;
    const pl = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), name: name.trim(), trackIds: [], createdAt: new Date().toISOString() };
    await DB.savePlaylist(pl);
    await renderPlaylists();
    UI.toast(`"${pl.name}" を作成しました`);
  }

  async function addTrackToPlaylist(plId, trackId) {
    const pl = await DB.getPlaylist(plId);
    if (!pl) return;
    if (pl.trackIds.includes(trackId)) { UI.toast('すでに追加済みです'); return; }
    pl.trackIds.push(trackId);
    await DB.savePlaylist(pl);
    await renderPlaylists();
    UI.toast('プレイリストに追加しました ✓');
  }

  async function deletePlaylist(id) {
    await DB.deletePlaylist(id);
    await renderPlaylists();
    UI.toast('プレイリストを削除しました');
  }

  function getAllPlaylists() { return _playlists; }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { renderPlaylists, openPlaylistDetail, createPlaylist, addTrackToPlaylist, deletePlaylist, playPlaylistFrom, getAllPlaylists };
})();
