/**
 * player.js — Audio engine with shuffle, repeat, Media Session
 */
const Player = (() => {
  const audio = document.getElementById('audio');
  let _tracks = [];       // All track metadata (from DB, no blob)
  let _baseQueue = [];    // Original array of track IDs
  let _queue = [];        // Array of track IDs in current play order
  let _queueIdx = 0;
  let _shuffle = false;
  let _repeat = 'none';   // 'none' | 'one' | 'all'
  let _currentId = null;
  let _objectUrl = null;
  let _context = 'library';
  const _listeners = {};

  // ── Event emitter ────────────────────────
  function on(ev, cb) { (_listeners[ev] = _listeners[ev] || []).push(cb); }
  function emit(ev, data) { (_listeners[ev] || []).forEach(cb => cb(data)); }

  // ── Queue helpers ────────────────────────
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue(startId = null) {
    let q = [..._baseQueue];
    if (_shuffle) {
      q = shuffleArray(q);
      if (startId) {
        const i = q.indexOf(startId);
        if (i > 0) { q.splice(i, 1); q.unshift(startId); }
      }
    }
    _queue = q;
    _queueIdx = startId ? Math.max(0, q.indexOf(startId)) : 0;
  }

  // ── Play ─────────────────────────────────
  async function play(trackId, trackList = null) {
    if (trackList) _tracks = trackList;

    if (trackId && trackId !== _currentId) {
      // Release previous object URL
      if (_objectUrl) { URL.revokeObjectURL(_objectUrl); _objectUrl = null; }

      const trackData = await DB.getTrack(trackId);
      if (!trackData || !trackData.blob) {
        UI.toast('ファイルが見つかりません');
        return;
      }
      _objectUrl = URL.createObjectURL(trackData.blob);
      audio.src = _objectUrl;
      _currentId = trackId;
      _queueIdx = _queue.indexOf(trackId);
      if (_queueIdx < 0) _queueIdx = 0;

      // Update duration in DB if not set
      audio.addEventListener('loadedmetadata', async () => {
        if (!trackData.duration) {
          await DB.updateTrackMeta(trackId, { duration: audio.duration });
        }
      }, { once: true });
    }

    try {
      await audio.play();
      emit('play', _currentId);
      updateMediaSession();
      await DB.setSetting('lastTrackId', _currentId);
    } catch (e) {
      console.error('play error', e);
    }
  }

  function pause() {
    audio.pause();
    emit('pause', _currentId);
  }

  function toggle() {
    if (audio.paused) play(_currentId);
    else pause();
  }

  async function next() {
    if (!_queue.length) return;
    if (_repeat === 'one') { audio.currentTime = 0; await audio.play(); return; }
    _queueIdx++;
    if (_queueIdx >= _queue.length) {
      if (_repeat === 'all') {
        if (_shuffle) {
          _queue = shuffleArray(_queue);
          // 再シャッフル後、先頭が今の曲と同じなら2番目と入れ替える
          if (_queue[0] === _currentId && _queue.length > 1) {
            [_queue[0], _queue[1]] = [_queue[1], _queue[0]];
            
          }
        }
        _queueIdx = 0;
      } else {
        _queueIdx = _queue.length - 1;
        pause();
        return;
      }
    }
    await play(_queue[_queueIdx]);
  }

  async function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    // 1曲目でも巻き戻せるよう末尾へ折り返す
    _queueIdx = (_queueIdx - 1 + _queue.length) % _queue.length;
    await play(_queue[_queueIdx]);
  }

  function seek(ratio) {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = ratio * audio.duration;
  }

  // ── Modes ────────────────────────────────
  async function loadContext(ctx) {
    _context = ctx;
    _shuffle = await DB.getSetting(`shuffleMode_${ctx}`, false);
    _repeat = await DB.getSetting(`repeatMode_${ctx}`, 'none');
    audio.loop = (_repeat === 'one');
    emit('shuffleChange', _shuffle);
    emit('repeatChange', _repeat);
  }

  async function setQueue(ids, startId = null, context = 'library') { 
    if (_context !== context) {
      await loadContext(context);
    }
    _baseQueue = [...ids];
    buildQueue(startId); 
  }

  function setShuffle(on) {
    _shuffle = on;
    if (_baseQueue.length) {
      buildQueue(_currentId);
    }
    DB.setSetting(`shuffleMode_${_context}`, on);
    emit('shuffleChange', on);
  }

  function setRepeat(mode) {
    _repeat = mode;
    audio.loop = (mode === 'one');
    DB.setSetting(`repeatMode_${_context}`, mode);
    emit('repeatChange', mode);
  }

  function toggleShuffle() { setShuffle(!_shuffle); }
  function cycleRepeat() {
    const modes = ['none', 'all', 'one'];
    setRepeat(modes[(modes.indexOf(_repeat) + 1) % modes.length]);
  }

  function currentTrackMeta() { return _tracks.find(t => t.id === _currentId) || null; }
  function getQueue() { return _queue; }


  // ── Audio events ─────────────────────────
  audio.addEventListener('ended', async () => {
    if (_repeat !== 'one') await next();
  });
  audio.addEventListener('timeupdate', () => emit('timeupdate', { current: audio.currentTime, duration: audio.duration }));
  audio.addEventListener('play', () => emit('play', _currentId));
  audio.addEventListener('pause', () => emit('pause', _currentId));

  // ── Media Session ─────────────────────────
  async function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const meta = currentTrackMeta();
    if (!meta) return;

    const artwork = [];
    const cover = await DB.getCover(_currentId);
    if (cover && cover.blob) {
      const url = URL.createObjectURL(cover.blob);
      artwork.push({ src: url, sizes: '512x512', type: cover.blob.type || 'image/jpeg' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.name || 'Unknown',
      artist: meta.artist || '',
      artwork
    });

    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('seekto', d => { audio.currentTime = d.seekTime; });
  }

  // ── Init ─────────────────────────────────
  async function init() {
    await loadContext('library');
  }

  return {
    init, play, pause, toggle, next, prev, seek,
    setQueue, getQueue, setShuffle, setRepeat, toggleShuffle, cycleRepeat,
    updateMediaSession,
    get isPlaying() { return !audio.paused; },
    get currentId() { return _currentId; },
    get shuffle() { return _shuffle; },
    get repeat() { return _repeat; },
    get progress() { return audio.duration ? audio.currentTime / audio.duration : 0; },
    get currentTime() { return audio.currentTime; },
    get duration() { return audio.duration || 0; },
    currentTrackMeta, setTracks(t) { _tracks = t; },
    on
  };
})();
