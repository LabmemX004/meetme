/**
 * interactions.js · meetme 核心交互层
 * 负责：画格子（自动吸附 5 分钟、自动滚动）、上下边缘 resize、单击/双击区分
 * 暴露 API：initInteractions({ onDraw, onErase, onOpenEditor, onDelete, onResize, snap, drawRangeFor })
 */

export function initInteractions(opts) {
  const {
    onDraw, onErase, onOpenEditor, onDelete, onResize,
    snap, drawRangeFor,
    START_HOUR, END_HOUR, SNAP,
    dayOf, minOfY, yOfMin,
  } = opts;

  const grid = document.getElementById('days');
  const tip = document.getElementById('tip');

  // ---- 状态机 ----
  let phase = 'idle';   // idle | drawing | resizing | maybeClick | maybeDbl
  let S = {};           // 当前会话状态

  // ---- 指针事件 ----
  grid.addEventListener('pointerdown', e => {
    const lane = e.target.closest('.lane');
    if (!lane || e.button > 0) return;
    if (e.target.closest('.blk')) return;   // 点击色块由 click/dblclick 处理

    const day = +lane.dataset.day;
    const isMine = lane.dataset.lane === 'mine';
    const rng = drawRangeFor(day);
    if (!rng && isMine) return;             // 过去的日期不可画

    const rect = lane.getBoundingClientRect();
    const min = minOfY(e.clientY - rect.top);

    S = { day, lane, isMine, rng, x0: e.clientX, y0: e.clientY,
          s: min, e: min, ghost: null, mode: null, moved: false };
    phase = 'drawing';
    grid.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  grid.addEventListener('pointermove', e => {
    if (phase === 'drawing') {
      S.moved = true;
      // 屏幕边缘自动滚动
      const EDGE = 60;
      if (e.clientY > window.innerHeight - EDGE) {
        window.scrollBy(0, Math.min(10, (e.clientY - (window.innerHeight - EDGE)) / 3 + 3));
      } else if (e.clientY < EDGE && window.scrollY > 0) {
        window.scrollBy(0, -Math.min(10, (EDGE - e.clientY) / 3 + 3));
      }
      const rect = S.lane.getBoundingClientRect();
      const cur = clamp(minOfY(e.clientY - rect.top), S.rng.min, S.rng.max);
      S.s = clamp(Math.min(S.s, cur), S.rng.min, S.rng.max);
      S.e = clamp(Math.max(S.e, cur), S.rng.min, S.rng.max);
      if (S.e - S.s < SNAP) { S.e = S.s + SNAP; if (S.e > S.rng.max) { S.e = S.rng.max; S.s = S.e - SNAP; } }
      showGhost();
      showTip(e.clientX, e.clientY);
    } else if (phase === 'resizing') {
      const rect = S.lane.getBoundingClientRect();
      const ppm = rect.height / 840;
      const newMin = snap((e.clientY - rect.top) / ppm + 600);
      if (S.edge === 'start') {
        S.row.start_min = clamp(newMin, S.rng.min, S.row.end_min - SNAP);
      } else {
        S.row.end_min = clamp(newMin, S.row.start_min + SNAP, S.rng.max);
      }
      opts.renderBlocks();
    }
  });

  grid.addEventListener('pointerup', e => {
    if (phase === 'drawing') {
      const s = snap(S.s), en = snap(S.e);
      hideGhost(); hideTip();
      grid.releasePointerCapture(e.pointerId);
      if (S.isMine && S.moved && en > s) {
        const d = { ...S, s, e: en };
        if (S.mode === 'erase') onErase(d); else onDraw(d);
      }
      phase = 'idle';
    } else if (phase === 'resizing') {
      grid.releasePointerCapture(e.pointerId);
      const r = S;
      if (r.changed) {
        onResize(r.row, r.day);
      }
      phase = 'idle';
    }
  });

  // ---- 双击 / 单击 ----
  let clickTimer = null, lastBlk = null, lastAt = 0;
  grid.addEventListener('click', e => {
    const blk = e.target.closest('.blk.mine');
    if (!blk) return;
    const row = blk._row;
    if (!row) return;
    const now = Date.now();
    if (lastBlk === blk && now - lastAt < 250) {   // 双击 → 删除
      clearTimeout(clickTimer); lastBlk = null; lastAt = 0;
      onDelete(row);
    } else {                                        // 可能单击 → 260ms 后决定
      lastBlk = blk; lastAt = now;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { lastBlk = null; lastAt = 0; onOpenEditor(row); }, 260);
    }
  });

  // ---- 双击触发 resize（色块上下边缘） ----
  grid.addEventListener('pointerdown', e => {
    const blk = e.target.closest('.blk.mine');
    if (!blk || e.button > 0) return;
    const row = blk._row;
    if (!row) return;
    const day = +blk.closest('.lane').dataset.day;
    const rng = drawRangeFor(day);
    if (!rng) return;
    const rect = blk.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const scopeWk = row.is_fixed ? FIXED_WEEK : isoDate(row.week_start);
    if (row.week_start !== scopeWk) return;
    const EDGE = 10;
    if (relY >= 0 && relY <= EDGE) {
      S = { row, edge: 'start', day, rng, lane: blk.closest('.lane'), changed: false };
      phase = 'resizing';
      grid.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (relY >= rect.height - EDGE && relY <= rect.height) {
      S = { row, edge: 'end', day, rng, lane: blk.closest('.lane'), changed: false };
      phase = 'resizing';
      grid.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  // ---- 辅助 ----
  function showGhost() {
    if (!S.ghost) {
      S.ghost = document.createElement('div');
      S.ghost.className = 'blk ghost ' + (S.mode === 'erase' ? 'mine free' : 'mine ' + S.status);
      S.lane.appendChild(S.ghost);
    }
    S.ghost.style.top = yOfMin(S.s) + 'px';
    S.ghost.style.height = Math.max(6, (S.e - S.s) * (S.lane.getBoundingClientRect().height / 840) - 1) + 'px';
  }
  function hideGhost() { if (S.ghost) { S.ghost.remove(); S.ghost = null; } }
  function showTip(x, y) {
    tip.hidden = false;
    tip.textContent = `${fmtMin(S.s)} – ${fmtMin(S.e)} · ${S.e - S.s} 分钟` + (S.mode === 'erase' ? ' · 擦除' : '');
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtMin(m) { return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
  function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  const FIXED_WEEK = '1970-01-05';
}
