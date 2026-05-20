/**
 * effects.js — Particle sparkles only (no EQ)
 */
const Effects = (() => {
  let _particles = [], _raf = null, _playing = false;
  const COLORS = ['#8faa96', '#c4956a', '#b5978a', '#d4b48a', '#a8c4af', '#e8d5c0'];

  function _spawn(canvas) {
    return {
      x: Math.random() * canvas.width,
      y: canvas.height * (0.5 + Math.random() * 0.5),
      size: Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -(Math.random() * 1.8 + 0.6),
      life: 1,
      decay: Math.random() * 0.012 + 0.005,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      star: Math.random() > 0.5
    };
  }

  function _drawStar(ctx, x, y, r) {
    const spikes = 4, step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const rr = i % 2 === 0 ? r * 2.2 : r * 0.9;
      ctx.lineTo(x + Math.cos(rot) * rr, y + Math.sin(rot) * rr);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  function _loop() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) { _raf = null; return; }
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 280;
    const H = canvas.offsetHeight || 280;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    if (_playing && Math.random() < 0.28 && _particles.length < 35)
      _particles.push(_spawn(canvas));

    _particles = _particles.filter(p => p.life > 0);
    for (const p of _particles) {
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 0.85);
      ctx.fillStyle = p.color;
      if (p.star) _drawStar(ctx, p.x, p.y, p.size);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    _raf = requestAnimationFrame(_loop);
  }

  function start() {
    _playing = true;
    if (!_raf) _loop();
  }

  function pause() {
    _playing = false;
    // Let existing particles fade out, don't stop loop
  }

  function stop() {
    _playing = false;
    _particles = [];
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    const c = document.getElementById('particle-canvas');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  // No-op for API compatibility
  function initIdle() {}

  return { start, pause, stop, initIdle };
})();
