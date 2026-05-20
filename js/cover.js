/**
 * cover.js — Cover art editor (Canvas crop/resize)
 */
const Cover = (() => {
  let _trackId = null;
  let _img = null;
  let _canvas = null;
  let _ctx = null;
  let _zoom = 1;
  let _offsetX = 0;
  let _offsetY = 0;
  let _isDragging = false;
  let _lastX = 0, _lastY = 0;
  let _lastPinchDist = 0;
  let _eventsBound = false;

  function getSize() { return _canvas ? _canvas.clientWidth : 280; }

  function draw() {
    if (!_ctx || !_img) return;
    const size = getSize();
    _canvas.width = size;
    _canvas.height = size;
    _ctx.clearRect(0, 0, size, size);
    _ctx.drawImage(_img, _offsetX, _offsetY, _img.width * _zoom, _img.height * _zoom);
  }

  function clampOffset() {
    const size = getSize();
    _offsetX = Math.min(0, Math.max(size - _img.width * _zoom, _offsetX));
    _offsetY = Math.min(0, Math.max(size - _img.height * _zoom, _offsetY));
  }

  function initFit() {
    const size = getSize();
    const minZoom = Math.max(size / _img.width, size / _img.height);
    _zoom = minZoom;
    const slider = document.getElementById('cover-zoom-slider');
    slider.min = minZoom;
    slider.max = Math.max(minZoom * 3, 3);
    slider.value = minZoom;
    _offsetX = (size - _img.width * _zoom) / 2;
    _offsetY = (size - _img.height * _zoom) / 2;
    clampOffset();
    draw();
  }

  function loadImage(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.src = url;
    });
  }

  function ensureCanvas() {
    if (!_canvas) {
      _canvas = document.getElementById('cover-editor-canvas');
      _ctx = _canvas.getContext('2d');
    }
  }

  function bindEvents() {
    if (_eventsBound) return;
    _eventsBound = true;
    const slider = document.getElementById('cover-zoom-slider');
    slider.oninput = () => {
      const size = getSize();
      const oldZoom = _zoom;
      _zoom = parseFloat(slider.value);
      _offsetX = size / 2 - (_zoom / oldZoom) * (size / 2 - _offsetX);
      _offsetY = size / 2 - (_zoom / oldZoom) * (size / 2 - _offsetY);
      clampOffset(); draw();
    };
    _canvas.onmousedown = e => { _isDragging = true; _lastX = e.clientX; _lastY = e.clientY; };
    _canvas.onmousemove = e => {
      if (!_isDragging) return;
      _offsetX += e.clientX - _lastX; _offsetY += e.clientY - _lastY;
      _lastX = e.clientX; _lastY = e.clientY;
      clampOffset(); draw();
    };
    _canvas.onmouseup = () => { _isDragging = false; };
    _canvas.ontouchstart = e => {
      e.preventDefault();
      if (e.touches.length === 1) { _isDragging = true; _lastX = e.touches[0].clientX; _lastY = e.touches[0].clientY; }
      else if (e.touches.length === 2) { _isDragging = false; _lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    };
    _canvas.ontouchmove = e => {
      e.preventDefault();
      if (e.touches.length === 1 && _isDragging) {
        _offsetX += e.touches[0].clientX - _lastX; _offsetY += e.touches[0].clientY - _lastY;
        _lastX = e.touches[0].clientX; _lastY = e.touches[0].clientY;
        clampOffset(); draw();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const ratio = dist / _lastPinchDist;
        const oldZoom = _zoom;
        _zoom = Math.max(parseFloat(slider.min || 0.5), Math.min(3, _zoom * ratio));
        const size = getSize();
        _offsetX = size / 2 - (_zoom / oldZoom) * (size / 2 - _offsetX);
        _offsetY = size / 2 - (_zoom / oldZoom) * (size / 2 - _offsetY);
        clampOffset();
        document.getElementById('cover-zoom-slider').value = _zoom;
        _lastPinchDist = dist; draw();
      }
    };
    _canvas.ontouchend = () => { _isDragging = false; };
  }

  async function openEditor(trackId) {
    _trackId = trackId;
    ensureCanvas();
    const cover = await DB.getCover(trackId);
    if (cover && cover.blob) {
      _img = await loadImage(cover.blob);
    } else {
      _img = null;
    }
    bindEvents();
    UI.openModal('modal-cover-editor');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    
    if (_img) {
      initFit();
    } else {
      const size = getSize();
      _ctx.fillStyle = 'var(--surface)';
      _ctx.fillRect(0, 0, size, size);
      _ctx.fillStyle = 'var(--text-sub)';
      _ctx.font = '16px sans-serif';
      _ctx.textAlign = 'center';
      _ctx.fillText('画像がありません', size / 2, size / 2);
    }
  }

  async function saveCover() {
    if (!_canvas || !_trackId) return;
    const out = document.createElement('canvas');
    out.width = 512; out.height = 512;
    const octx = out.getContext('2d');
    const ds = getSize();
    octx.drawImage(_canvas, 0, 0, ds, ds, 0, 0, 512, 512);
    return new Promise(resolve => {
      out.toBlob(async blob => {
        if (blob) { await DB.saveCover(_trackId, blob); UI.toast('カバーを保存しました ✓'); resolve(blob); }
        else { UI.toast('保存に失敗しました'); resolve(null); }
      }, 'image/jpeg', 0.9);
    });
  }

  document.getElementById('cover-pick-new').addEventListener('click', () => {
    document.getElementById('cover-file-input').click();
  });

  document.getElementById('cover-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    ensureCanvas();
    _img = await loadImage(file);
    bindEvents();
    // Open modal FIRST so canvas becomes visible with proper dimensions
    if (document.getElementById('modal-cover-editor').classList.contains('hidden')) {
      UI.openModal('modal-cover-editor');
    }
    // Wait for browser to render the modal before reading canvas size
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    initFit();
    e.target.value = '';
  });

  document.getElementById('btn-save-cover').addEventListener('click', async () => {
    await saveCover();
    UI.closeModal('modal-cover-editor');
    document.dispatchEvent(new CustomEvent('coverUpdated', { detail: { trackId: _trackId } }));
  });

  return { openEditor };
})();
