'use strict';
/* ============================================================
   meetme · 双人时间协调
   自由绘制（内部 5 分钟吸附）· GitHub Pages + Supabase
   未配置 Supabase 时进入演示模式（数据仅存本机）
   ============================================================ */

/* ---------- 配置检测 ---------- */
const SUPA_URL = window.SUPABASE_URL || '';
const SUPA_KEY = window.SUPABASE_ANON_KEY || '';
const SITE_URL = window.SITE_URL || '';
const DEMO = !/^https?:\/\/.+/.test(SUPA_URL) || SUPA_URL.includes('YOUR_') ||
             !SUPA_KEY || SUPA_KEY.includes('YOUR_');

/* ---------- 常量 ---------- */
const START_HOUR = 10, END_HOUR = 24;
const SNAP = 5;                                  // 内部吸附网格：5 分钟
const SPAN = (END_HOUR - START_HOUR) * 60;       // 一天总分钟数
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const FIXED_WEEK = '1970-01-05';
const ME_KEY = 'meetme_me', DEMO_KEY = 'meetme_demo_v1', PROF_KEY = 'meetme_profiles_v1';
const NOTIFY_DELAY = 5 * 60 * 1000;              // 改动静默 5 分钟后确认发送

/* ---------- 小工具 ---------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtMin = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const snap = m => Math.round(m / SNAP) * SNAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// 确定性 id：与自然键同源，删除不会落空
const mkId = (u, fixed, week, day, s, e) => `${u}|${fixed ? 'F' : week}|${day}|${s}-${e}`;

/* ---------- 轻提示（替代 alert） ---------- */
function toast(msg, isErr) {
  let box = $('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2400);
}

/* ---------- 弹窗关闭过渡 ---------- */
function closeOverlay(ov) {
  ov.classList.add('closing');
  setTimeout(() => ov.remove(), 190);
}

/* ---------- 数据层 ---------- */
let db;
if (!DEMO) {
  const sb = supabase.createClient(SUPA_URL, SUPA_KEY);
  db = {
    async fetchAll() {
      const { data, error } = await sb.from('slots')
        .select('id,user_name,week_start,is_fixed,day_of_week,start_min,end_min,status,note,sticky_text,has_image');
      if (error) throw error;
      return data || [];
    },
    async upsert(rows) {
      const { error } = await sb.from('slots').upsert(rows);
      if (error) throw error;
    },
    async update(id, fields) {
      const { error } = await sb.from('slots').update(fields).eq('id', id);
      if (error) throw error;
    },
    async remove(ids) {
      const { error } = await sb.from('slots').delete().in('id', ids);
      if (error) throw error;
    },
    async image(id) {
      const { data, error } = await sb.from('slots').select('sticky_image').eq('id', id).single();
      if (error) throw error;
      return data ? data.sticky_image : null;
    },
    async fetchProfiles() {
      const { data, error } = await sb.from('profiles').select('user_name,email');
      if (error) throw error;
      return data || [];
    },
    async saveProfile(name, email) {
      const { error } = await sb.from('profiles').upsert({ user_name: name, email, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    subscribe(cb) {
      sb.channel('slots-ch')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, debounce(cb, 300))
        .subscribe();
    }
  };
} else {
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; } catch (e) { return []; } },
    save(rows) { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); },
    async fetchAll() { return this.load(); },
    async upsert(rows) {
      const all = this.load();
      for (const r of rows) {
        const i = all.findIndex(x => x.id === r.id);
        if (i >= 0) all[i] = { ...all[i], ...r };
        else all.push({ created_at: new Date().toISOString(), note: '', sticky_text: '', has_image: false, ...r });
      }
      this.save(all);
    },
    async update(id, f) {
      const all = this.load(); const i = all.findIndex(x => x.id === id);
      if (i >= 0) all[i] = { ...all[i], ...f };
      this.save(all);
    },
    async remove(ids) { this.save(this.load().filter(x => !ids.includes(x.id))); },
    async image(id) { const r = this.load().find(x => x.id === id); return r ? r.sticky_image : null; },
    async fetchProfiles() {
      try { return JSON.parse(localStorage.getItem(PROF_KEY)) || []; } catch (e) { return []; }
    },
    async saveProfile(name, email) {
      const ps = await this.fetchProfiles();
      const i = ps.findIndex(p => p.user_name === name);
      if (i >= 0) ps[i].email = email; else ps.push({ user_name: name, email });
      localStorage.setItem(PROF_KEY, JSON.stringify(ps));
    },
    subscribe(cb) {
      window.addEventListener('storage', e => { if (e.key === DEMO_KEY) cb(); });
    }
  };
  db = store;
}

/* ---------- 状态 ---------- */
let me = localStorage.getItem(ME_KEY) || null;
let monday = mondayOf(new Date());
let brush = { status: 'busy', fixed: false };
let rows = [];                // 全部块
let profiles = [];            // [{user_name, email}]
let PPM = 1;                  // 像素/分钟
let viewDay = (new Date().getDay() + 6) % 7;     // 手机端选中的天（0=周一）
let animateNext = false;      // 下一次渲染播放切周动画
let lastSnapshot = null;      // 上次已通知（或基线）的我的块快照
let notifyTimer = null;
const isMobile = () => matchMedia('(max-width:640px)').matches;

/* ---------- 布局 ---------- */
function calcPPM() {
  if (matchMedia('(pointer:coarse)').matches) {         // 触屏：整体塞进一屏，避免滚动冲突
    return clamp((window.innerHeight - 210) / SPAN, 0.5, 0.9);
  }
  return 0.95;                                          // 桌面
}
const yOf = min => (min - START_HOUR * 60) * PPM;
const minOf = y => clamp(snap(START_HOUR * 60 + y / PPM), START_HOUR * 60, END_HOUR * 60);

function buildLayout() {
  PPM = calcPPM();
  const H = SPAN * PPM;
  const gutter = $('gutter'), days = $('days'), dheads = $('dheads');
  gutter.innerHTML = ''; days.innerHTML = ''; dheads.innerHTML = '';
  gutter.style.height = H + 'px';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const l = document.createElement('div');
    l.className = 'g-label';
    l.style.top = yOf(h * 60) + 'px';
    l.textContent = fmtMin(h * 60);
    gutter.appendChild(l);
  }
  const todayIso = isoDate(new Date());
  const makeCol = d => {
    const date = addDays(monday, d);
    const col = document.createElement('div');
    col.className = 'daycol';
    col.style.height = H + 'px';
    col.dataset.day = d;
    for (let h = START_HOUR + 1; h < END_HOUR; h++) {
      const hl = document.createElement('div');
      hl.className = 'hline';
      hl.style.top = yOf(h * 60) + 'px';
      col.appendChild(hl);
    }
    for (const laneName of ['mine', 'theirs']) {
      const lane = document.createElement('div');
      lane.className = 'lane ' + laneName;
      lane.dataset.lane = laneName;
      lane.dataset.day = d;
      lane.innerHTML = `<span class="lane-lbl">${laneName === 'mine' ? '我' : 'TA'}</span>`;
      col.appendChild(lane);
    }
    return col;
  };
  if (isMobile()) {
    // 单日视图：顶部 7 个日期胶囊点选，画布只显示选中的一天
    viewDay = clamp(viewDay, 0, 6);
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      const chip = document.createElement('button');
      chip.className = 'chip-day' + (d === viewDay ? ' active' : '') + (isoDate(date) === todayIso ? ' today' : '');
      chip.innerHTML = `<span class="cd">${DAYS[d].slice(1)}</span><span class="cdt">${date.getMonth() + 1}/${date.getDate()}</span>`;
      chip.onclick = () => { viewDay = d; buildLayout(); };
      dheads.appendChild(chip);
    }
    days.appendChild(makeCol(viewDay));
  } else {
    const heads = [], cols = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      const head = document.createElement('div');
      head.className = 'dhead' + (isoDate(date) === todayIso ? ' today' : '');
      head.innerHTML = `<b>${DAYS[d].slice(1)}</b>${date.getMonth() + 1}/${date.getDate()}`;
      heads.push(head);
      cols.push(makeCol(d));
    }
    heads.forEach(h => dheads.appendChild(h));   // 表头与日列分开两行，保证刻度严格对齐
    cols.forEach(c => days.appendChild(c));
  }
  renderBlocks();
}

/* ---------- 块渲染 ---------- */
const freshIds = new Set();              // 刚创建的块：播放生成动画
function scopeRows(day, lane) {          // 某天某车道在当前周的所有块
  const wk = isoDate(monday);
  const who = lane === 'mine' ? me : null;
  return rows.filter(r =>
    r.day_of_week === day &&
    (lane === 'theirs' ? r.user_name !== me : me && r.user_name === me) &&
    (r.is_fixed || r.week_start === wk)
  ).sort((a, b) => a.start_min - b.start_min || (b.is_fixed ? 1 : 0) - (a.is_fixed ? 1 : 0));
}

function renderBlocks() {
  document.querySelectorAll('.lane').forEach(lane => {
    lane.querySelectorAll('.blk').forEach(b => b.remove());
    const list = scopeRows(+lane.dataset.day, lane.dataset.lane);
    // 先画每周固定（底层），再画本周（顶层覆盖）
    for (const fixed of [true, false]) {
      for (const r of list) {
        if (r.is_fixed !== fixed) continue;
        const b = document.createElement('div');
        const h = Math.max(10, (r.end_min - r.start_min) * PPM - 1);
        b.className = `blk ${lane.dataset.lane === 'mine' ? 'mine' : 'ta'} ${r.status}` +
          (r.is_fixed ? ' fixedw' : '') + (h < 30 ? ' short' : '');
        b.style.top = yOf(r.start_min) + 'px';
        b.style.height = h + 'px';
        b.dataset.id = r.id;
        const time = `<span class="bs">${fmtMin(r.start_min)}</span><span class="be">–${fmtMin(r.end_min)}</span>`;
        let html = `<span class="bt">${r.is_fixed ? '<i class="fx">每周</i>' : ''}${time}</span>`;
        if (r.note) html += `<span class="bn">${esc(r.note)}</span>`;
        if (r.sticky_text || r.has_image) html += '<i class="stk"></i>';
        b.innerHTML = html;
        if (freshIds.has(r.id)) { b.classList.add('spawn'); freshIds.delete(r.id); }
        lane.appendChild(b);
      }
    }
  });
}

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function blockAt(day, min, laneName) {   // 点击命中：本周块优先于每周块
  const list = scopeRows(day, laneName);
  return list.find(r => !r.is_fixed && r.start_min <= min && r.end_min > min) ||
         list.find(r => r.is_fixed && r.start_min <= min && r.end_min > min) || null;
}

/* ---------- 绘制交互 ---------- */
const tip = $('tip');
let draw = null;   // {day, lane, mode:'paint'|'erase', s, e, cur, moved, x0, y0, ghost}

document.getElementById('days').addEventListener('pointerdown', e => {
  const laneEl = e.target.closest('.lane');
  if (!laneEl || e.button > 0) return;
  const rect = laneEl.getBoundingClientRect();
  const min = minOf(e.clientY - rect.top);
  const isMine = laneEl.dataset.lane === 'mine';
  draw = {
    day: +laneEl.dataset.day, laneEl, isMine,
    x0: e.clientX, y0: e.clientY, moved: false,
    mode: null, s: min, e: min, ghost: null
  };
  if (isMine) {
    const hit = blockAt(draw.day, min, 'mine');
    // 起点是自己同类块 → 这次拖动为擦除；否则为绘制
    draw.mode = hit && hit.status === brush.status && hit.is_fixed === brush.fixed ? 'erase' : 'paint';
  }
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!draw) return;
  if (Math.hypot(e.clientX - draw.x0, e.clientY - draw.y0) > 5) draw.moved = true;
  if (!draw.isMine || !draw.moved) return;
  const rect = draw.laneEl.getBoundingClientRect();
  const cur = minOf(e.clientY - rect.top);
  draw.s = Math.min(draw.s, cur); draw.e = Math.max(draw.e, cur);
  draw.s = Math.max(draw.s, START_HOUR * 60); draw.e = Math.min(draw.e, END_HOUR * 60);
  if (draw.e - draw.s < SNAP) {                       // 吸附后至少 5 分钟
    if (cur < draw.s) draw.s = Math.max(START_HOUR * 60, draw.e - SNAP);
    else draw.e = Math.min(END_HOUR * 60, draw.s + SNAP);
  }
  showGhost();
  tip.hidden = false;
  tip.textContent = `${fmtMin(draw.s)} – ${fmtMin(draw.e)} · ${draw.e - draw.s} 分钟` + (draw.mode === 'erase' ? ' · 擦除' : '');
  tip.style.left = e.clientX + 'px';
  tip.style.top = rect.top + yOf((draw.s + draw.e) / 2) + 'px';
});
window.addEventListener('pointerup', e => {
  if (!draw) return;
  const d = draw; draw = null;
  tip.hidden = true;
  if (d.ghost) d.ghost.remove();
  if (!d.moved) {                                     // 单击：编辑块
    if (e.target.closest && e.target.closest('.lane')) {
      const rect = d.laneEl.getBoundingClientRect();
      const min = minOf(e.clientY - rect.top);
      const hit = blockAt(d.day, min, d.isMine ? 'mine' : 'theirs');
      if (hit) openEditor(hit);
    }
    return;
  }
  if (d.isMine && d.e > d.s) commitSweep(d, snap(d.s), snap(d.e));
});
window.addEventListener('pointercancel', () => { if (draw) { draw.ghost && draw.ghost.remove(); tip.hidden = true; draw = null; } });

function showGhost() {
  const d = draw;
  if (!d.ghost) {
    d.ghost = document.createElement('div');
    d.ghost.className = 'blk ghost ' + (d.mode === 'erase' ? 'mine free' : 'mine ' + brush.status);
    d.laneEl.appendChild(d.ghost);
  }
  d.ghost.style.top = yOf(d.s) + 'px';
  d.ghost.style.height = Math.max(6, (d.e - d.s) * PPM - 1) + 'px';
}

/* ---------- 提交：合并 / 擦除 ---------- */
function subtractInterval(list, s, e) {
  const out = [];
  for (const b of list) {
    if (b.end_min <= s || b.start_min >= e) { out.push(b); continue; }
    if (b.start_min < s) out.push({ ...b, end_min: s });
    if (b.end_min > e) out.push({ ...b, start_min: e });
  }
  return out;
}

async function commitSweep(d, s, e) {
  const fixed = brush.fixed, week = fixed ? FIXED_WEEK : isoDate(monday);
  const mine = rows.filter(r => r.user_name === me && r.day_of_week === d.day &&
                               r.is_fixed === fixed && r.week_start === week);
  const removedIds = mine.map(r => r.id);
  let pieces;
  if (d.mode === 'erase') {
    // 只从同类块里减去扫过的区间
    const same = mine.filter(r => r.status === brush.status);
    const other = mine.filter(r => r.status !== brush.status);
    pieces = [...subtractInterval(same, s, e), ...other];
  } else {
    // 扫过区域统一为当前类型；扫过区间之外的旧块保留，与新区块相接的同类型块吸收合并
    let cs = s, ce = e;
    const trimmed = subtractInterval(mine, s, e);
    const same = trimmed.filter(p => p.status === brush.status);
    const other = trimmed.filter(p => p.status !== brush.status);
    const absorbed = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of same) {
        if (absorbed.includes(p)) continue;
        if (p.end_min === cs) { cs = p.start_min; absorbed.push(p); changed = true; }
        else if (p.start_min === ce) { ce = p.end_min; absorbed.push(p); changed = true; }
      }
    }
    const keptSame = same.filter(p => !absorbed.includes(p));
    pieces = [...other, ...keptSame, { status: brush.status, start_min: cs, end_min: ce }];
  }
  const newRows = pieces.filter(p => p.end_min > p.start_min).map(p => ({
    id: mkId(me, fixed, week, d.day, p.start_min, p.end_min),
    user_name: me, week_start: week, is_fixed: fixed, day_of_week: d.day,
    start_min: p.start_min, end_min: p.end_min, status: p.status,
    note: p.note || '', sticky_text: p.sticky_text || '',
    has_image: p.has_image || false, sticky_image: p.sticky_image ?? null
  }));
  rows = rows.filter(r => !removedIds.includes(r.id)).concat(newRows);
  newRows.forEach(r => freshIds.add(r.id));
  renderBlocks();
  try {
    if (removedIds.length) await db.remove(removedIds);
    if (newRows.length) await db.upsert(newRows.map(r => ({
      id: r.id, user_name: r.user_name, week_start: r.week_start, is_fixed: r.is_fixed,
      day_of_week: r.day_of_week, start_min: r.start_min, end_min: r.end_min, status: r.status,
      note: r.note, sticky_text: r.sticky_text, has_image: r.has_image
    })));
  } catch (err) { toast('保存失败：' + err.message, true); await refresh(); }
  scheduleNotify();
}

/* ---------- 编辑器 ---------- */
function openEditor(row) {
  const own = row.user_name === me;
  const d = addDays(monday, row.day_of_week);
  let localImg = null, imgChanged = false, imgRemoved = false;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = own ? `
  <div class="modal">
    <h3>${DAYS[row.day_of_week]} ${d.getMonth() + 1}/${d.getDate()} · ${fmtMin(row.start_min)}–${fmtMin(row.end_min)}</h3>
    <div class="row"><span>类型</span>
      <label><input type="radio" name="st" value="busy" ${row.status === 'busy' ? 'checked' : ''}> 有事</label>
      <label><input type="radio" name="st" value="free" ${row.status === 'free' ? 'checked' : ''}> 没事</label>
    </div>
    <div class="row"><span>重复</span>
      <label><input type="checkbox" id="m-fixed" ${row.is_fixed ? 'checked' : ''}> 每周重复</label>
    </div>
    <div class="row"><span>备注</span>
      <input id="m-note" maxlength="60" placeholder="直接显示在色块上" value="${esc(row.note)}">
    </div>
    <div class="sticky-box">
      <textarea id="m-sticky" placeholder="便签：想写多长写多长，还可以贴图…"></textarea>
      <div class="imgrow">
        <img id="m-img" alt="" hidden>
        <input type="file" id="m-file" accept="image/*" hidden>
        <button class="btn ghost sm" id="m-upload">🖼 贴张图</button>
        <button class="btn ghost sm" id="m-imgdel" hidden>移除图片</button>
      </div>
    </div>
    <div class="btnrow">
      <button class="btn" id="m-save">保存</button>
      <button class="btn danger" id="m-del">删除</button>
      <button class="btn ghost" id="m-close">关闭</button>
    </div>
  </div>` : `
  <div class="modal">
    <h3>${row.user_name} · ${DAYS[row.day_of_week]} ${fmtMin(row.start_min)}–${fmtMin(row.end_min)}</h3>
    <p class="muted">${row.status === 'busy' ? '有事' : '没事'}${row.is_fixed ? ' · 每周重复' : ''}${row.note ? ' · ' + esc(row.note) : ''}</p>
    <div class="sticky-box" id="t-box" hidden>
      <textarea id="m-sticky" readonly></textarea>
      <div class="imgrow"><img id="m-img" alt="" hidden></div>
    </div>
    <div class="btnrow"><button class="btn ghost" id="m-close">关闭</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => closeOverlay(overlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });

  const stickyEl = overlay.querySelector('#m-sticky');
  const imgEl = overlay.querySelector('#m-img');

  if (!own) {   // 只读查看对方的便签
    if (row.sticky_text || row.has_image) {
      overlay.querySelector('#t-box').hidden = false;
      stickyEl.value = row.sticky_text || '';
      if (row.has_image) db.image(row.id).then(src => {
        if (src && document.body.contains(overlay)) { imgEl.src = src; imgEl.hidden = false; }
      }).catch(() => {});
    }
    overlay.querySelector('#m-close').onclick = close;
    return;
  }

  stickyEl.value = row.sticky_text || '';
  const imgDelEl = overlay.querySelector('#m-imgdel');
  const fileEl = overlay.querySelector('#m-file');
  if (row.has_image) {
    db.image(row.id).then(src => {
      if (!src || !document.body.contains(overlay)) return;
      localImg = src; imgEl.src = src; imgEl.hidden = false; imgDelEl.hidden = false;
    }).catch(() => {});
  }
  overlay.querySelector('#m-upload').onclick = () => fileEl.click();
  fileEl.onchange = async () => {
    const f = fileEl.files[0];
    if (!f) return;
    try {
      localImg = await compressImage(f);
      imgChanged = true; imgRemoved = false;
      imgEl.src = localImg; imgEl.hidden = false; imgDelEl.hidden = false;
    } catch (e) { toast('图片读取失败', true); }
  };
  imgDelEl.onclick = () => {
    imgRemoved = true; imgChanged = false; localImg = null;
    imgEl.hidden = true; imgDelEl.hidden = true; fileEl.value = '';
  };
  overlay.querySelector('#m-close').onclick = close;
  overlay.querySelector('#m-del').onclick = async () => {
    try { await db.remove([row.id]); } catch (err) { toast('删除失败：' + err.message, true); }
    rows = rows.filter(r => r.id !== row.id);
    renderBlocks(); scheduleNotify(); close();
  };
  overlay.querySelector('#m-save').onclick = async () => {
    const status = overlay.querySelector('input[name=st]:checked').value;
    const fixed = overlay.querySelector('#m-fixed').checked;
    const note = overlay.querySelector('#m-note').value.trim();
    const stickyText = stickyEl.value;
    const fields = { status, note, sticky_text: stickyText };
    if (imgRemoved) { fields.has_image = false; fields.sticky_image = null; }
    else if (imgChanged) { fields.has_image = true; fields.sticky_image = localImg; }
    try {
      if (fixed !== row.is_fixed) {          // 换作用域：删旧建新，内容带过去
        let img = imgRemoved ? null : (imgChanged ? localImg : undefined);
        if (img === undefined && row.has_image) img = localImg || await db.image(row.id);
        const week = fixed ? FIXED_WEEK : isoDate(monday);
        const nid = mkId(me, fixed, week, row.day_of_week, row.start_min, row.end_min);
        await db.remove([row.id]);
        await db.upsert([{
          id: nid,
          user_name: me, week_start: week, is_fixed: fixed,
          day_of_week: row.day_of_week, start_min: row.start_min, end_min: row.end_min,
          status, note, sticky_text: stickyText,
          has_image: !imgRemoved && !!img, sticky_image: imgRemoved ? null : (img || null)
        }]);
        rows = rows.filter(r => r.id !== row.id);
        freshIds.add(nid);
        await refresh();
      } else {
        await db.update(row.id, fields);
        Object.assign(row, fields);
        renderBlocks();
      }
      scheduleNotify(); close();
    } catch (err) { await refresh(); toast('保存失败：' + err.message, true); }
  };
}

function compressImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900, sc = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = rej;
      img.src = r.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ---------- 邮箱通知：快照 diff + 5 分钟静默确认 ---------- */
const snapMine = () => JSON.stringify(rows.filter(r => r.user_name === me)
  .map(r => [r.id, r.status, r.is_fixed, r.start_min, r.end_min, r.note, r.sticky_text || r.has_image]).sort());

function scheduleNotify() {
  if (DEMO || !me) return;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(sendNotify, NOTIFY_DELAY);   // 5 分钟内继续改动会不断顺延
}

async function sendNotify() {
  try {
    const cur = snapMine();
    if (cur === lastSnapshot) return;                    // 改动被撤销/无实质变化：不发
    const other = profiles.find(p => p.user_name !== me && p.email);
    if (!other) { lastSnapshot = cur; return; }
    const lines = diffLines(JSON.parse(lastSnapshot || '[]'), JSON.parse(cur));
    if (!lines.length) { lastSnapshot = cur; return; }
    const subject = `meetme · ${me} 更新了时间安排`;
    const text = `${me} 刚刚更新了这一周的时间安排（改动完成 5 分钟后发送）：\n\n` +
      lines.join('\n') + '\n\n打开查看：' + (SITE_URL || '(网站地址见 config.js)') +
      '\n\n— meetme 自动发送';
    const res = await fetch(`${SUPA_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY },
      body: JSON.stringify({ to: other.email, subject, text })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    lastSnapshot = cur;                                  // 成功后才更新基线，失败下次再试
  } catch (e) { console.warn('通知发送失败（稍后改动会重试）:', e); }
}

function diffLines(oldL, newL) {
  const oldMap = new Map(oldL.map(a => [a[0], a]));
  const newMap = new Map(newL.map(a => [a[0], a]));
  const line = a => {
    const parts = a[0].split('|');
    const day = +parts[2] || 0;
    const range = (parts[3] || '').split('-').filter(Boolean).map(x => fmtMin(+x)).join('–');
    return `${a[1] === 'busy' ? '有事' : '没事'} ${DAYS[day]} ${range}${a[2] ? '（每周重复）' : ''}${a[5] ? ' 「' + a[5] + '」' : ''}`;
  };
  const out = [];
  for (const [id, a] of newMap) if (!oldMap.has(id)) out.push('＋ ' + line(a));
  for (const [id, a] of oldMap) {
    if (!newMap.has(id)) out.push('－ ' + line(a));
    else if (JSON.stringify(a) !== JSON.stringify(newMap.get(id))) out.push('～ ' + line(a));
  }
  return out.slice(0, 14);
}

/* ---------- 刷新 ---------- */
function setBanner(text, isErr) {
  const b = $('banner');
  if (!text) { b.hidden = true; return; }
  b.hidden = false;
  b.className = isErr ? 'error' : '';
  b.textContent = text;
}

async function refresh() {
  try {
    rows = await db.fetchAll();
    if (!DEMO) profiles = await db.fetchProfiles().catch(() => profiles);
    setBanner(DEMO ? '演示模式 · 配置 Supabase 后即可双人同步与邮件通知（见 README）' : '');
  } catch (e) {
    setBanner('加载数据失败：' + e.message, true);
  }
  if (!draw) renderWeek();          // 拖动进行中不打断重建
  if (lastSnapshot === null) lastSnapshot = snapMine();   // 基线快照：启动时的状态
}

function renderWeek() {
  const end = addDays(monday, 6);
  $('week-label').textContent =
    `${monday.getMonth() + 1}/${monday.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`;
  $('me-chip').innerHTML = me ? `<b>${esc(me)}</b> · ✉️` : '';
  buildLayout();
  if (animateNext) {                       // 切周时列级渐入
    animateNext = false;
    const d = $('days');
    d.classList.add('enter');
    setTimeout(() => d.classList.remove('enter'), 700);
  }
}

/* ---------- 事件 ---------- */
$('prev').onclick = () => { monday = addDays(monday, -7); animateNext = true; renderWeek(); };
$('next').onclick = () => { monday = addDays(monday, 7); animateNext = true; renderWeek(); };
$('today').onclick = () => { monday = mondayOf(new Date()); animateNext = true; renderWeek(); };
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') $('prev').click();
  if (e.key === 'ArrowRight') $('next').click();
});
$('b-busy').onclick = () => { brush.status = 'busy'; syncBrushUI(); };
$('b-free').onclick = () => { brush.status = 'free'; syncBrushUI(); };
$('b-fixed').onclick = () => { brush.fixed = !brush.fixed; syncBrushUI(); };
function syncBrushUI() {
  $('b-busy').classList.toggle('on', brush.status === 'busy');
  $('b-free').classList.toggle('on', brush.status === 'free');
  $('b-fixed').classList.toggle('on', brush.fixed);
}
$('me-chip').onclick = () => openProfile();

function openProfile() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const mineP = profiles.find(p => p.user_name === me);
  overlay.innerHTML = `
  <div class="modal small">
    <h3>${esc(me || '')}</h3>
    <p class="muted">填写邮箱后，对方的时间更新会在 5 分钟确认后邮件通知你</p>
    <input id="p-email" type="email" placeholder="你的邮箱" value="${esc(mineP ? mineP.email : '')}">
    <div class="btnrow">
      <button class="btn pink" id="p-save">保存</button>
      <button class="btn ghost" id="p-switch">换个名字</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const pclose = () => closeOverlay(overlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) pclose(); });
  overlay.querySelector('#p-save').onclick = async () => {
    const email = overlay.querySelector('#p-email').value.trim();
    try {
      await db.saveProfile(me, email);
      profiles = await db.fetchProfiles();
      pclose();
    } catch (err) { toast('保存失败：' + err.message, true); }
  };
  overlay.querySelector('#p-switch').onclick = () => {
    localStorage.removeItem(ME_KEY);
    location.reload();
  };
}

/* ---------- 首次使用 ---------- */
function showName() {
  const ov = $('name-overlay');
  ov.hidden = false;
  const input = $('name-input');
  input.focus();
  const ok = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    me = v;
    localStorage.setItem(ME_KEY, v);
    const email = $('email-input').value.trim();
    if (email) {
      try { await db.saveProfile(v, email); profiles = await db.fetchProfiles(); } catch (e) {}
    }
    ov.hidden = true;
    lastSnapshot = null;          // 让下一次 refresh 重新取基线
    renderWeek();
    refresh();
  };
  $('name-ok').onclick = ok;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
}

/* ---------- 启动 ---------- */
db.subscribe(refresh);
setInterval(refresh, 45000);
let rsz; window.addEventListener('resize', debounce(() => { buildLayout(); }, 150));
if (!me) showName();
refresh();
