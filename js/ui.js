/**
 * ui.js — UI helpers: toast, modal, view switch, cover canvas
 */
const UI = (() => {
  // ── Toast ────────────────────────────────
  function toast(msg, duration = 2400) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  // ── Modal ────────────────────────────────
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    const sheet = m.querySelector('.modal-sheet');
    if (sheet) {
      sheet.style.animation = 'slideDown .25s ease forwards';
      setTimeout(() => {
        sheet.style.animation = '';
        m.classList.add('hidden');
        document.body.style.overflow = '';
      }, 240);
    } else {
      m.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  // Close on backdrop / data-close buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-close]');
    if (btn) closeModal(btn.dataset.close);
  });

  // ── View Switch ──────────────────────────
  function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewId);
    });
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // ── Default Cover Canvas ─────────────────
  // Generates a gradient placeholder based on track name seed
  const GRADIENTS = [
    ['#8faa96','#c4956a'], ['#b5978a','#8faa96'], ['#c4956a','#b5978a'],
    ['#9bada8','#c4956a'], ['#a99b8a','#8faa96'], ['#b5978a','#c4b29a'],
  ];
  function gradientForId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return GRADIENTS[h % GRADIENTS.length];
  }
  function drawDefaultCover(canvas, trackId, size = 50) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const [c1, c2] = gradientForId(trackId || 'default');
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${size * 0.4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', size / 2, size / 2);
  }
  async function drawCoverFromBlob(canvas, blob, size = 50) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  }

  // ── Format time ──────────────────────────
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Format bytes ─────────────────────────
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  return { toast, openModal, closeModal, switchView, drawDefaultCover, drawCoverFromBlob, formatTime, formatBytes, gradientForId };
})();
