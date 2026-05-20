/**
 * stats.js — Play count, last played, favorites, ranking
 */
const Stats = (() => {
  // Called on every track play
  async function recordPlay(trackId) {
    await DB.incrementPlayCount(trackId);
  }

  // Toggle favorite, returns new boolean
  async function toggleFavorite(trackId) {
    const isFav = await DB.toggleFavorite(trackId);
    // Update heart icons everywhere
    document.querySelectorAll(`[data-fav-id="${trackId}"]`).forEach(el => {
      el.classList.toggle('fav-active', isFav);
      el.setAttribute('aria-label', isFav ? 'お気に入り解除' : 'お気に入り');
    });
    UI.toast(isFav ? '❤️ お気に入りに追加' : 'お気に入りを解除');
    return isFav;
  }

  async function getFavoriteStatus(trackId) {
    const s = await DB.getStats(trackId);
    return s.favorite;
  }

  async function renderStatsView() {
    const [allStats, allTracks] = await Promise.all([DB.getAllStats(), DB.getAllTracks()]);
    const trackMap = Object.fromEntries(allTracks.map(t => [t.id, t]));

    // ── Ranking ──────────────────────────────
    const ranked = [...allStats]
      .filter(s => s.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);

    const rankList = document.getElementById('stats-rank-list');
    if (rankList) {
      rankList.innerHTML = '';
      if (!ranked.length) {
        rankList.innerHTML = '<li class="stats-empty">まだ再生記録がありません</li>';
      } else {
        ranked.forEach((s, idx) => {
          const t = trackMap[s.trackId];
          if (!t) return;
          const medal = ['🥇', '🥈', '🥉'][idx] || `${idx + 1}`;
          const li = document.createElement('li');
          li.className = 'stats-item';
          li.innerHTML = `
            <span class="stats-rank">${medal}</span>
            <div class="stats-meta">
              <p class="stats-name">${escHtml(t.name || 'Unknown')}</p>
              <p class="stats-artist">${escHtml(t.artist || '')}</p>
            </div>
            <span class="stats-count">${s.playCount}<small>回</small></span>`;
          rankList.appendChild(li);
        });
      }
    }

    // ── Favorites ────────────────────────────
    const favs = allStats.filter(s => s.favorite);
    const favList = document.getElementById('stats-fav-list');
    if (favList) {
      favList.innerHTML = '';
      if (!favs.length) {
        favList.innerHTML = '<li class="stats-empty">❤️ お気に入りがありません</li>';
      } else {
        favs.forEach(s => {
          const t = trackMap[s.trackId];
          if (!t) return;
          const li = document.createElement('li');
          li.className = 'stats-item';
          li.innerHTML = `
            <span class="stats-rank">❤️</span>
            <div class="stats-meta">
              <p class="stats-name">${escHtml(t.name || 'Unknown')}</p>
              <p class="stats-artist">${escHtml(t.artist || '')}</p>
            </div>
            <span class="stats-count">${s.playCount}<small>回</small></span>`;
          favList.appendChild(li);
        });
      }
    }
  }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { recordPlay, toggleFavorite, getFavoriteStatus, renderStatsView };
})();
