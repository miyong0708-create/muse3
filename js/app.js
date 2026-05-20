/**
 * app.js — Main coordinator: wires all modules, manages UI state
 */
(() => {
  let _tracks = [];

  // ── Helpers ─────────────────────────────
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function $(id) { return document.getElementById(id); }

  // ── Library rendering ────────────────────
  async function renderLibrary(filter = '') {
    _tracks = await DB.getAllTracks();
    Player.setTracks(_tracks);
    const list = $('track-list');
    const empty = $('library-empty');
    const term = filter.toLowerCase();
    const visible = term ? _tracks.filter(t =>
      t.name.toLowerCase().includes(term) || (t.artist || '').toLowerCase().includes(term)
    ) : _tracks;

    list.innerHTML = '';
    if (!visible.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    visible.forEach(t => {
      const li = document.createElement('li');
      li.className = 'track-item' + (Player.currentId === t.id ? ' playing' : '');
      li.dataset.trackId = t.id;
      li.innerHTML = `
        <div class="track-cover"><canvas width="50" height="50"></canvas></div>
        <div class="track-meta">
          <p class="track-name">${escHtml(t.name || 'Unknown')}</p>
          <p class="track-artist">${escHtml(t.artist || 'Unknown Artist')}</p>
        </div>
        <span class="track-duration" id="dur-${t.id}">${t.duration ? UI.formatTime(t.duration) : ''}</span>
        <button class="track-menu-btn" data-menu="${t.id}" aria-label="メニュー">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>
        </button>`;
      // Draw cover async
      const canvas = li.querySelector('canvas');
      DB.getCover(t.id).then(cover => {
        if (cover && cover.blob) UI.drawCoverFromBlob(canvas, cover.blob, 50);
        else UI.drawDefaultCover(canvas, t.id, 50);
      });
      // Play on tap
      li.addEventListener('click', async e => {
        if (e.target.closest('[data-menu]')) return;
        await Player.setQueue(_tracks.map(tr => tr.id), t.id, 'library');
        await Player.play(t.id, _tracks);
        openFullPlayer();
      });
      list.appendChild(li);
    });

    // Menu buttons
    list.querySelectorAll('[data-menu]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openTrackMenu(btn.dataset.menu);
      });
    });
  }

  // ── Track menu ───────────────────────────
  function openTrackMenu(trackId) {
    const track = _tracks.find(t => t.id === trackId);
    if (!track) return;
    $('menu-track-title').textContent = track.name || 'Unknown';
    $('menu-track-id').value = trackId;
    UI.openModal('modal-track-menu');
  }

  function openEditTrackModal(id) {
    const t = _tracks.find(tr => tr.id === id);
    if (!t) return;
    $('edit-track-id').value = id;
    $('edit-track-name').value = t.name || '';
    $('edit-track-artist').value = t.artist || '';
    UI.openModal('modal-edit-track');
  }

  $('menu-edit').addEventListener('click', () => {
    const id = $('menu-track-id').value;
    UI.closeModal('modal-track-menu');
    openEditTrackModal(id);
  });

  $('menu-lyrics').addEventListener('click', () => {
    const id = $('menu-track-id').value;
    UI.closeModal('modal-track-menu');
    Lyrics.openEditor(id);
  });

  $('btn-save-edit').addEventListener('click', async () => {
    const id = $('edit-track-id').value;
    const name = $('edit-track-name').value.trim();
    const artist = $('edit-track-artist').value.trim();
    await DB.updateTrackMeta(id, { name, artist });
    UI.closeModal('modal-edit-track');
    UI.toast('保存しました ✓');
    await renderLibrary($('search-input').value);
    if (Player.currentId === id) updatePlayerUI();
  });

  $('menu-add-playlist').addEventListener('click', async () => {
    const id = $('menu-track-id').value;
    $('add-playlist-track-id').value = id;
    const playlists = PlaylistManager.getAllPlaylists();
    const ul = $('add-playlist-list');
    ul.innerHTML = '';
    if (!playlists.length) {
      ul.innerHTML = '<li style="padding:16px;color:var(--text-sub);text-align:center">プレイリストがありません</li>';
    } else {
      playlists.forEach(pl => {
        const li = document.createElement('li');
        li.className = 'add-playlist-item';
        li.innerHTML = `<span class="playlist-icon" style="font-size:18px">🎵</span><span>${escHtml(pl.name)}</span>`;
        li.addEventListener('click', async () => {
          await PlaylistManager.addTrackToPlaylist(pl.id, id);
          UI.closeModal('modal-track-menu');
          UI.closeModal('modal-add-playlist');
        });
        ul.appendChild(li);
      });
    }
    UI.closeModal('modal-track-menu');
    UI.openModal('modal-add-playlist');
  });

  $('menu-delete').addEventListener('click', async () => {
    const id = $('menu-track-id').value;
    if (!confirm('この曲を削除しますか？')) return;
    if (Player.currentId === id) Player.pause();
    await DB.deleteTrack(id);
    await DB.deleteCover(id);
    UI.closeModal('modal-track-menu');
    UI.toast('削除しました');
    await renderLibrary($('search-input').value);
    updateMiniPlayer();
  });

  // ── Full Player UI ───────────────────────
  function openFullPlayer() { $('full-player').classList.remove('hidden'); }
  function closeFullPlayer() { $('full-player').classList.add('hidden'); }
  document.addEventListener('requestOpenFullPlayer', openFullPlayer);
  $('fp-back').addEventListener('click', closeFullPlayer);
  $('mini-tap-area').addEventListener('click', e => {
    if (!e.target.closest('.mini-btns')) openFullPlayer();
  });

  async function updatePlayerUI() {
    const id = Player.currentId;
    if (!id) return;
    const t = _tracks.find(tr => tr.id === id) || await DB.getTrack(id);
    if (!t) return;

    // Update track list highlight
    document.querySelectorAll('.track-item').forEach(el => {
      el.classList.toggle('playing', el.dataset.trackId === id);
    });

    // Update mini player
    $('mini-name').textContent = t.name || 'Unknown';
    $('mini-artist-label').textContent = t.artist || '';
    const miniCanvas = $('mini-cover-canvas');
    const cover = await DB.getCover(id);
    if (cover && cover.blob) await UI.drawCoverFromBlob(miniCanvas, cover.blob, 44);
    else UI.drawDefaultCover(miniCanvas, id, 44);
    $('mini-player').classList.remove('hidden');

    // Update full player
    $('fp-track-name').textContent = t.name || 'Unknown';
    $('fp-artist').textContent = t.artist || '';
    const fpCanvas = $('fp-cover-canvas');
    const size = Math.min(280, window.innerWidth * 0.72);
    if (cover && cover.blob) await UI.drawCoverFromBlob(fpCanvas, cover.blob, size);
    else UI.drawDefaultCover(fpCanvas, id, size);

    // Shuffle/repeat UI
    updateModeButtons();
    await Player.updateMediaSession();
  }

  function updateModeButtons() {
    $('fp-shuffle').classList.toggle('active', Player.shuffle);
    const ri = $('fp-repeat');
    ri.querySelector('.repeat-all-icon').classList.toggle('hidden', Player.repeat === 'one');
    ri.querySelector('.repeat-one-icon').classList.toggle('hidden', Player.repeat !== 'one');
    ri.classList.toggle('active', Player.repeat !== 'none');
  }

  function updateMiniPlayer() {
    if (!Player.currentId) { $('mini-player').classList.add('hidden'); return; }
    const pct = Player.progress * 100;
    $('mini-prog').style.width = pct + '%';
    const playIcon = $('mini-play').querySelector('.icon-play');
    const pauseIcon = $('mini-play').querySelector('.icon-pause');
    const fpPlayIcon = $('fp-play').querySelector('.icon-play');
    const fpPauseIcon = $('fp-play').querySelector('.icon-pause');
    if (Player.isPlaying) {
      playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden');
      fpPlayIcon.classList.add('hidden'); fpPauseIcon.classList.remove('hidden');
    } else {
      playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden');
      fpPlayIcon.classList.remove('hidden'); fpPauseIcon.classList.add('hidden');
    }
  }

  // ── Player events ─────────────────────────
  Player.on('play', async id => {
    updateMiniPlayer();
    if (id) {
      await updatePlayerUI();
      await Stats.recordPlay(id);
      Effects.start();
      Lyrics.onTrackChange(id);
      // Update fav button
      const isFav = await Stats.getFavoriteStatus(id);
      const btn = $('fp-fav-btn');
      btn.dataset.favId = id;
      btn.setAttribute('data-fav-id', id);
      btn.classList.toggle('fav-active', isFav);
    }
  });
  Player.on('pause', () => { updateMiniPlayer(); Effects.pause(); });
  Player.on('timeupdate', ({ current, duration }) => {
    if (!isFinite(duration)) return;
    const pct = current / duration;
    $('mini-prog').style.width = (pct * 100) + '%';
    $('fp-progress-fill').style.width = (pct * 100) + '%';
    $('fp-progress-thumb').style.left = (pct * 100) + '%';
    $('fp-current-time').textContent = UI.formatTime(current);
    $('fp-duration').textContent = UI.formatTime(duration);
    // Update duration in track list
    const durEl = $('dur-' + Player.currentId);
    if (durEl && !durEl.textContent) durEl.textContent = UI.formatTime(duration);
  });
  Player.on('shuffleChange', () => updateModeButtons());
  Player.on('repeatChange', () => updateModeButtons());

  // ── Player controls ───────────────────────
  $('mini-play').addEventListener('click', () => Player.toggle());
  $('mini-prev').addEventListener('click', () => Player.prev());
  $('mini-next').addEventListener('click', () => Player.next());
  $('fp-play').addEventListener('click', () => Player.toggle());
  $('fp-prev').addEventListener('click', () => Player.prev());
  $('fp-next').addEventListener('click', () => Player.next());
  $('fp-shuffle').addEventListener('click', () => Player.toggleShuffle());
  $('fp-repeat').addEventListener('click', () => Player.cycleRepeat());

  // ── Seek bar ─────────────────────────────
  const progBg = $('fp-progress-bg');
  let _seeking = false;
  function seekTo(e) {
    const rect = progBg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    Player.seek(ratio);
  }
  progBg.addEventListener('mousedown', e => { _seeking = true; seekTo(e); });
  progBg.addEventListener('touchstart', e => { _seeking = true; seekTo(e); e.preventDefault(); }, { passive: false });
  document.addEventListener('mousemove', e => { if (_seeking) seekTo(e); });
  document.addEventListener('touchmove', e => { if (_seeking) seekTo(e); }, { passive: false });
  document.addEventListener('mouseup', () => { _seeking = false; });
  document.addEventListener('touchend', () => { _seeking = false; });

  // Cover edit from full player
  $('fp-cover-edit').addEventListener('click', () => {
    if (Player.currentId) Cover.openEditor(Player.currentId);
  });

  // 3-dot menu in full player
  $('fp-menu-btn').addEventListener('click', () => {
    if (!Player.currentId) return;
    openTrackMenu(Player.currentId);
  });

  // Lyrics toggle (show/hide overlay)
  $('fp-lyrics-btn').addEventListener('click', () => {
    if (Player.currentId) Lyrics.toggle(Player.currentId);
  });

  // Save lyrics (from modal)
  $('btn-save-lyrics').addEventListener('click', () => Lyrics.save());

  // Favorite button
  $('fp-fav-btn').addEventListener('click', async () => {
    const id = Player.currentId;
    if (!id) return;
    await Stats.toggleFavorite(id);
    await Stats.renderStatsView();
  });


  // ── Upload ────────────────────────────────
  $('btn-open-upload').addEventListener('click', () => UI.openModal('modal-upload'));
  $('btn-upload-empty').addEventListener('click', () => UI.openModal('modal-upload'));
  $('upload-drop-zone').addEventListener('click', () => $('file-input').click());
  $('upload-drop-zone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  $('upload-drop-zone').addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));
  $('upload-drop-zone').addEventListener('drop', e => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });
  $('file-input').addEventListener('change', e => { handleFiles(Array.from(e.target.files)); e.target.value = ''; });

  async function handleFiles(files) {
    const m4aFiles = files.filter(f => f.name.toLowerCase().endsWith('.m4a') || f.type.includes('audio'));
    if (!m4aFiles.length) { UI.toast('M4Aファイルを選択してください'); return; }
    const progList = $('upload-progress-list');
    const items = {};
    m4aFiles.forEach(f => {
      const div = document.createElement('div');
      div.className = 'upload-progress-item';
      div.innerHTML = `<span class="upload-prog-name">${escHtml(f.name)}</span><span class="upload-prog-status">保存中...</span>`;
      progList.appendChild(div);
      items[f.name] = div;
    });
    await Uploader.uploadFiles(m4aFiles, ({ name, status }) => {
      const item = items[name];
      if (!item) return;
      const s = item.querySelector('.upload-prog-status');
      if (status === 'done') { s.textContent = '✓'; s.className = 'upload-prog-status done'; }
      if (status === 'error') { s.textContent = 'エラー'; s.className = 'upload-prog-status error'; }
    });
    await renderLibrary($('search-input').value);
    UI.toast(`${m4aFiles.length}曲を追加しました`);
    setTimeout(() => { progList.innerHTML = ''; UI.closeModal('modal-upload'); }, 1500);
  }

  // ── Playlists ─────────────────────────────
  $('btn-create-playlist').addEventListener('click', () => { $('playlist-name-input').value = ''; UI.openModal('modal-create-playlist'); });
  $('btn-save-playlist').addEventListener('click', async () => {
    await PlaylistManager.createPlaylist($('playlist-name-input').value);
    UI.closeModal('modal-create-playlist');
  });
  $('playlist-name-input').addEventListener('keydown', async e => {
    // e.isComposing が true の間は IME変換中なのでスキップ
    if (e.key === 'Enter' && !e.isComposing) {
      await PlaylistManager.createPlaylist(e.target.value);
      UI.closeModal('modal-create-playlist');
    }
  });

  // Playlist detail back
  $('playlist-detail-back').addEventListener('click', () => {
    $('playlist-detail').classList.add('hidden');
    PlaylistManager.renderPlaylists();
  });

  // Playlist detail play all
  $('playlist-play-all').addEventListener('click', async () => {
    const id = $('playlist-detail').dataset.currentId;
    const pl = await DB.getPlaylist(id);
    if (!pl || !pl.trackIds.length) return;
    await Player.setQueue(pl.trackIds, pl.trackIds[0], id);
    Player.setShuffle(false);
    await Player.play(pl.trackIds[0], _tracks);
    openFullPlayer();
  });

  $('playlist-play-shuffle').addEventListener('click', async () => {
    const id = $('playlist-detail').dataset.currentId;
    const pl = await DB.getPlaylist(id);
    if (!pl || !pl.trackIds.length) return;
    await Player.setQueue(pl.trackIds, null, id);
    Player.setShuffle(true);
    await Player.play(Player.getQueue()[0], _tracks);
    openFullPlayer();
  });

  // Add tracks to playlist from playlist detail (select from library)
  let _selectTracksTimer;
  $('playlist-add-tracks').addEventListener('click', () => {
    const plId = $('playlist-detail').dataset.currentId;
    if (!plId) return;
    $('select-tracks-search').value = '';
    renderSelectTracksList();
    UI.openModal('modal-select-tracks');
  });

  $('select-tracks-search').addEventListener('input', e => {
    clearTimeout(_selectTracksTimer);
    _selectTracksTimer = setTimeout(() => renderSelectTracksList(e.target.value), 200);
  });

  async function renderSelectTracksList(query = '') {
    const list = $('select-tracks-list');
    list.innerHTML = '';
    const plId = $('playlist-detail').dataset.currentId;
    const pl = await DB.getPlaylist(plId);
    const existingIds = pl ? pl.trackIds : [];
    
    const visible = query ? _tracks.filter(t => 
      (t.name||'').toLowerCase().includes(query.toLowerCase()) ||
      (t.artist||'').toLowerCase().includes(query.toLowerCase())
    ) : _tracks;

    if (!visible.length) {
      list.innerHTML = '<li style="padding:16px;text-align:center;color:var(--text-sub)">曲が見つかりません</li>';
      return;
    }

    visible.forEach(t => {
      const isAlreadyAdded = existingIds.includes(t.id);
      const li = document.createElement('li');
      li.className = 'select-track-item';
      li.innerHTML = `
        <input type="checkbox" value="${t.id}" ${isAlreadyAdded ? 'checked disabled' : ''}>
        <div class="track-cover" style="width:40px;height:40px;border-radius:8px;"><canvas width="40" height="40"></canvas></div>
        <div class="select-track-meta">
          <p class="select-track-name">${escHtml(t.name || 'Unknown')}</p>
          <p class="select-track-artist">${escHtml(t.artist || 'Unknown Artist')}</p>
        </div>
      `;
      // Draw cover async
      const canvas = li.querySelector('canvas');
      DB.getCover(t.id).then(cover => {
        if (cover && cover.blob) UI.drawCoverFromBlob(canvas, cover.blob, 40);
        else UI.drawDefaultCover(canvas, t.id, 40);
      });

      if (!isAlreadyAdded) {
        li.addEventListener('click', (e) => {
          if (e.target.tagName !== 'INPUT') {
            const cb = li.querySelector('input');
            cb.checked = !cb.checked;
          }
        });
      } else {
        li.style.opacity = '0.5';
      }
      list.appendChild(li);
    });
  }

  $('btn-add-selected-tracks').addEventListener('click', async () => {
    const plId = $('playlist-detail').dataset.currentId;
    if (!plId) return;
    const checkboxes = document.querySelectorAll('#select-tracks-list input[type="checkbox"]:checked:not(:disabled)');
    const idsToAdd = Array.from(checkboxes).map(cb => cb.value);
    
    if (idsToAdd.length > 0) {
      const pl = await DB.getPlaylist(plId);
      if (pl) {
        pl.trackIds.push(...idsToAdd);
        await DB.savePlaylist(pl);
        PlaylistManager.renderPlaylists();
        PlaylistManager.openPlaylistDetail(plId);
        UI.toast(`${idsToAdd.length}曲を追加しました`);
      }
    }
    UI.closeModal('modal-select-tracks');
  });

  // Playlist detail menu (delete)
  $('playlist-detail-menu').addEventListener('click', async () => {
    const plId = $('playlist-detail').dataset.currentId;
    if (!plId) return;
    if (confirm('このプレイリストを削除しますか？')) {
      await PlaylistManager.deletePlaylist(plId);
      $('playlist-detail').classList.add('hidden');
    }
  });

  // ── Settings ──────────────────────────────
  $('btn-export').addEventListener('click', () => Backup.exportData());

  $('btn-import').addEventListener('click', () => $('import-json-input').click());
  $('import-json-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    await Backup.importData(file);
    await renderLibrary();
    await PlaylistManager.renderPlaylists();
    e.target.value = '';
  });

  $('btn-reimport').addEventListener('click', () => $('reimport-audio-input').click());
  $('reimport-audio-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const { matched, skipped } = await Uploader.reimportFiles(files);
    UI.toast(`${matched}曲を再インポート (未マッチ: ${skipped})`);
    await renderLibrary();
    e.target.value = '';
  });

  async function updateStorageInfo() {
    const info = await DB.getStorageInfo();
    if (!info) return;
    const used = UI.formatBytes(info.usage || 0);
    const total = UI.formatBytes(info.quota || 0);
    $('storage-text').textContent = `${used} / ${total}`;
    const pct = info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;
    $('storage-bar-fill').style.width = pct + '%';
  }

  // ── Search ────────────────────────────────
  let _searchTimer;
  $('search-input').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => renderLibrary(e.target.value), 200);
  });

  // ── Cover updated event ───────────────────
  document.addEventListener('coverUpdated', async e => {
    const { trackId } = e.detail;
    if (Player.currentId === trackId) await updatePlayerUI();
    await renderLibrary($('search-input').value);
  });

  // ── Service Worker ────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }

  // ── Init ──────────────────────────────────
  async function init() {
    await DB.open();
    await Player.init();
    await renderLibrary();
    await PlaylistManager.renderPlaylists();
    await updateStorageInfo();
    await Stats.renderStatsView();
    Effects.initIdle();

    // Restore last track (metadata only, no auto-play)
    const lastId = await DB.getSetting('lastTrackId');
    if (lastId) {
      const t = await DB.getTrack(lastId);
      if (t) {
        _tracks = await DB.getAllTracks();
        Player.setTracks(_tracks);
        await Player.setQueue(_tracks.map(tr => tr.id), lastId, 'library');
        // Preload UI but don't auto-play (iOS requires user gesture)
        const cover = await DB.getCover(lastId);
        $('mini-name').textContent = t.name || 'Unknown';
        $('mini-artist-label').textContent = t.artist || '';
        const mc = $('mini-cover-canvas');
        if (cover && cover.blob) await UI.drawCoverFromBlob(mc, cover.blob, 44);
        else UI.drawDefaultCover(mc, lastId, 44);
        $('mini-player').classList.remove('hidden');
      }
    }

    updateModeButtons();

    // Splash fade out
    const splash = $('splash');
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; $('app').classList.remove('hidden'); }, 500);
  }

  init();
})();
