(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const MAX = SCHOOLS.length;
  const ANIM = 120;
  const START_UNDOS = 3;
  const DEBUG = new URLSearchParams(location.search).has('debug');
  const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('sdu2048.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) {
      if (DEBUG) return;
      try { localStorage.setItem('sdu2048.' + k, JSON.stringify(v)); } catch { /* 隐私模式等 */ }
    },
  };

  // ---------- 校徽 ----------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function badgeSVG(s) {
    const fs = Math.min(16, (187 / s.en.length - 1) / 0.68).toFixed(1);
    const ink = s.final ? '#f6cf6a' : '#fff';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200">
<defs>
<path id="t" d="M30,100 a70,70 0 1,1 140,0"/>
<path id="b" d="M17,100 a83,83 0 0,0 166,0"/>
<radialGradient id="g" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="100" cy="100" r="97" fill="${s.color}"/>
<circle cx="100" cy="100" r="97" fill="url(#g)"/>
<circle cx="100" cy="100" r="91" fill="none" stroke="${ink}" stroke-width="2.2" opacity=".9"/>
<text fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fs}" letter-spacing="1"><textPath href="#t" xlink:href="#t" startOffset="50%" text-anchor="middle">${esc(s.en)}</textPath></text>
<text fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" letter-spacing="2"><textPath href="#b" xlink:href="#b" startOffset="50%" text-anchor="middle">· ${s.year} ·</textPath></text>
<text x="23" y="105" fill="${ink}" font-size="13" text-anchor="middle">★</text>
<text x="177" y="105" fill="${ink}" font-size="13" text-anchor="middle">★</text>
<circle cx="100" cy="100" r="62" fill="#fff"/>
<circle cx="100" cy="100" r="56" fill="none" stroke="${s.color}" stroke-width="2"/>
<circle cx="100" cy="100" r="51" fill="none" stroke="${s.color}" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>
<text x="100" y="117" text-anchor="middle" font-family="'Songti SC','STSong','SimSun','Noto Serif SC',serif" font-weight="900" font-size="46" fill="${s.color}">${esc(s.short)}</text>
</svg>`;
  }

  const badge = SCHOOLS.map((s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(badgeSVG(s)));

  SCHOOLS.forEach((s, i) => {
    const img = new Image();
    img.onload = () => {
      badge[i] = img.src;
      document.querySelectorAll(`img[data-lv="${i + 1}"]`).forEach((el) => (el.src = img.src));
    };
    img.src = `logos/${s.id}.png`;
  });

  // ---------- DOM ----------
  const boardEl = $('#board');
  const bgEl = $('#grid-bg');
  const tileLayer = $('#tiles');
  const fxLayer = $('#fx');
  const scoreEl = $('#score');
  const bestEl = $('#best');
  const undoBtn = $('#btn-undo');
  const goalEl = $('#goal');
  const ladderEl = $('#ladder');
  const toastEl = $('#toast');
  const unlockEl = $('#unlock');
  const modal = $('#modal');
  const card = $('#modal-card');

  // ---------- 状态 ----------
  let N = store.get('size', 4) === 5 ? 5 : 4;
  let cells = [];
  const tiles = new Map();
  let nextId = 1;
  let score = 0, best = 0, undos = START_UNDOS, maxLv = 1, moves = 0, over = false, won = false;
  let history = [];
  let collection = store.get('collection', 0);
  let soundOn = store.get('sound', true);
  let cell = 0, gap = 0;

  // ---------- 布局 ----------
  const xy = (r, c) => [gap + c * (cell + gap), gap + r * (cell + gap)];
  function place(el, r, c) {
    const [x, y] = xy(r, c);
    el.style.transform = `translate(${x}px,${y}px)`;
  }

  function buildGridBg() {
    bgEl.innerHTML = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.dataset.r = r;
        d.dataset.c = c;
        bgEl.appendChild(d);
      }
    }
  }

  function layout() {
    const W = boardEl.clientWidth;
    gap = Math.round(W * (N === 4 ? 0.028 : 0.022));
    cell = (W - gap * (N + 1)) / N;
    boardEl.style.setProperty('--cell', cell + 'px');
    boardEl.classList.add('no-anim');
    bgEl.childNodes.forEach((d) => place(d, +d.dataset.r, +d.dataset.c));
    tiles.forEach((t) => t.el && place(t.el, t.r, t.c));
    void boardEl.offsetWidth;
    boardEl.classList.remove('no-anim');
  }

  // ---------- 方块 ----------
  function tileEl(lv, anim) {
    const s = SCHOOLS[lv - 1];
    const el = document.createElement('div');
    el.className = 'tile'
      + (lv >= 8 ? ' gold' : '')
      + (lv >= 12 ? ' glow' : '')
      + (lv === MAX ? ' final' : '')
      + (anim ? ' ' + anim : '');
    el.style.setProperty('--c', s.color);
    el.innerHTML = `<div class="tile-inner"><img data-lv="${lv}" src="${badge[lv - 1]}" alt="${s.name}" draggable="false"><span class="val">${2 ** lv}</span></div>`;
    return el;
  }

  function newTile(r, c, lv) {
    const t = { id: nextId++, r, c, lv, el: null, fresh: false };
    cells[r][c] = t;
    tiles.set(t.id, t);
    return t;
  }

  function mount(t, anim) {
    t.el = tileEl(t.lv, anim);
    place(t.el, t.r, t.c);
    tileLayer.appendChild(t.el);
  }

  let pending = [], timer = 0;
  function schedule(fn, delay) {
    pending.push(fn);
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  function flush() {
    clearTimeout(timer);
    const p = pending;
    pending = [];
    p.forEach((f) => f());
  }

  function clearBoard() {
    flush();
    tiles.forEach((t) => t.el && t.el.remove());
    tiles.clear();
    fxLayer.innerHTML = '';
    cells = Array.from({ length: N }, () => Array(N).fill(null));
  }

  const levels = () => cells.flat().map((t) => (t ? t.lv : 0));

  function fromLevels(arr, anim) {
    clearBoard();
    arr.forEach((lv, i) => { if (lv) mount(newTile(Math.floor(i / N), i % N, lv), anim); });
  }

  function spawn() {
    const empty = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!cells[r][c]) empty.push([r, c]);
    if (!empty.length) return null;
    const [r, c] = empty[(Math.random() * empty.length) | 0];
    return newTile(r, c, Math.random() < 0.9 ? 1 : 2);
  }

  function canMove() {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const t = cells[r][c];
        if (!t) return true;
        if (c + 1 < N && cells[r][c + 1]?.lv === t.lv) return true;
        if (r + 1 < N && cells[r + 1][c]?.lv === t.lv) return true;
      }
    }
    return false;
  }

  // ---------- 核心：移动 ----------
  function move(dir) {
    if (over || won || modal.classList.contains('show')) return;
    flush();
    const [dr, dc] = DIRS[dir];
    const prev = { grid: levels(), score, maxLv };
    const order = [...Array(N).keys()];
    const rows = dr === 1 ? [...order].reverse() : order;
    const cols = dc === 1 ? [...order].reverse() : order;
    const merges = [];
    let moved = false, gained = 0;

    for (const r of rows) {
      for (const c of cols) {
        const t = cells[r][c];
        if (!t) continue;
        let pr = r, pc = c, target = null;
        for (;;) {
          const nr = pr + dr, nc = pc + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) break;
          const o = cells[nr][nc];
          if (!o) { pr = nr; pc = nc; continue; }
          if (o.lv === t.lv && !o.fresh && t.lv < MAX) target = o;
          break;
        }
        cells[r][c] = null;
        if (target) {
          tiles.delete(t.id);
          tiles.delete(target.id);
          const nt = newTile(target.r, target.c, t.lv + 1);
          nt.fresh = true;
          place(t.el, target.r, target.c);
          merges.push({ a: t, b: target, nt });
          gained += 2 ** nt.lv;
          moved = true;
        } else {
          cells[pr][pc] = t;
          if (pr !== r || pc !== c) {
            t.r = pr;
            t.c = pc;
            place(t.el, pr, pc);
            moved = true;
          }
        }
      }
    }

    if (!moved) { bump(dr, dc); return; }

    history.push(prev);
    if (history.length > 30) history.shift();
    moves++;
    merges.forEach((m) => (m.nt.fresh = false));
    score += gained;
    if (score > best) { best = score; store.set('best' + N, best); }

    const spawned = spawn();
    const topLv = merges.reduce((m, x) => Math.max(m, x.nt.lv), 0);
    const newMax = topLv > maxLv ? topLv : 0;
    let first = false, bonus = false;
    if (newMax) {
      maxLv = newMax;
      first = newMax > collection;
      if (first) { collection = newMax; store.set('collection', collection); }
      if (newMax >= 6 && newMax < MAX) { undos++; bonus = true; }
    }
    if (maxLv === MAX) won = true;
    else if (!canMove()) over = true;
    save();

    updateStats();
    if (gained) floatScore(gained);
    if (topLv) { sfxMerge(topLv); vibrate(topLv >= 10 ? 30 : 10); } else sfxMove();

    schedule(() => {
      merges.forEach(({ a, b, nt }) => {
        a.el.remove();
        b.el.remove();
        mount(nt, 'merged');
        fx(nt);
      });
      if (spawned) mount(spawned, 'new');
      if (newMax) onNewMax(newMax, first, bonus);
      if (won) setTimeout(() => showWin(true), 500);
      else if (over) setTimeout(showOver, 700);
    }, ANIM);
  }

  function undo() {
    if (!undos || !history.length) {
      toast(undos ? '已经退到最开始了' : '本局撤销次数已用完');
      return;
    }
    flush();
    const p = history.pop();
    undos--;
    score = p.score;
    maxLv = p.maxLv;
    moves = Math.max(0, moves - 1);
    over = won = false;
    fromLevels(p.grid, 'fade');
    save();
    updateUI();
    tone(330, 0.08, 'sine', 0.06);
  }

  function newGame() {
    closeModal();
    clearBoard();
    history = [];
    score = 0;
    undos = START_UNDOS;
    moves = 0;
    over = won = false;
    if (DEBUG) {
      const demo = [14, 13, 13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      demo.forEach((lv, i) => newTile(Math.floor(i / N), i % N, lv));
    } else {
      spawn();
      spawn();
    }
    maxLv = Math.max(...[...tiles.values()].map((t) => t.lv));
    tiles.forEach((t) => mount(t, 'new'));
    save();
    updateUI();
  }

  // ---------- 存档 ----------
  function save() {
    store.set('state' + N, { grid: levels(), score, undos, maxLv, moves, over, won, history: history.slice(-10) });
  }

  function load() {
    const s = store.get('state' + N, null);
    if (!s || !Array.isArray(s.grid) || s.grid.length !== N * N || !s.grid.some(Boolean)) return false;
    fromLevels(s.grid, 'new');
    score = s.score | 0;
    undos = s.undos ?? START_UNDOS;
    maxLv = s.maxLv || 1;
    moves = s.moves | 0;
    over = !!s.over;
    won = !!s.won;
    history = Array.isArray(s.history) ? s.history : [];
    return true;
  }

  // ---------- 界面 ----------
  function updateStats() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    $('#undo-count').textContent = undos;
    undoBtn.disabled = !undos || !history.length;
  }

  function updateUI() {
    updateStats();
    document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', +b.dataset.n === N));
    $('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
    renderProgress(true);
  }

  function renderProgress(scroll) {
    const cur = Math.max(1, maxLv);
    const s = SCHOOLS[cur - 1];
    const nx = SCHOOLS[cur];
    const unlocked = Math.max(collection, maxLv);
    goalEl.innerHTML = `
      <div class="g-item"><img data-lv="${cur}" src="${badge[cur - 1]}" alt=""><div><small>本局最高 · ${2 ** cur}</small><b>${s.name}</b></div></div>
      <span class="g-arrow">➜</span>
      ${nx
        ? `<div class="g-item g-next"><img data-lv="${cur + 1}" src="${badge[cur]}" alt=""><div><small>下一站 · ${2 ** (cur + 1)}</small><b>${nx.name}</b></div></div>`
        : `<div class="g-item g-next done"><div><small>终点 · ${2 ** MAX}</small><b>已登顶山东大学！</b></div></div>`}`;
    $('#goal-prog').style.width = (cur / MAX) * 100 + '%';

    ladderEl.innerHTML = SCHOOLS.map((sc, i) => {
      const lv = i + 1;
      const cls = ['lad', lv > unlocked && 'locked', lv === cur && 'cur', sc.final && 'final'].filter(Boolean).join(' ');
      return `<button class="${cls}" data-lv="${lv}" aria-label="${sc.name}"><img data-lv="${lv}" src="${badge[i]}" alt=""><span>${2 ** lv}</span></button>`;
    }).join('');
    $('#collect-count').textContent = `已解锁 ${unlocked} / ${MAX}`;

    if (scroll) {
      const el = ladderEl.children[cur - 1];
      ladderEl.scrollTo({ left: el.offsetLeft - ladderEl.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }
  }

  function onNewMax(lv, first, bonus) {
    renderProgress(true);
    updateStats();
    if (lv === MAX) return;
    const s = SCHOOLS[lv - 1];
    if (first && lv >= 4) showUnlock(lv, bonus);
    else if (lv >= 3) toast(`<img src="${badge[lv - 1]}" alt="">合成 <em>${s.name}</em>${bonus ? ' · 撤销 +1' : ''}`);
    if (lv >= 3) sfxUnlock(lv);
  }

  function floatScore(n) {
    const p = document.createElement('span');
    p.className = 'plus';
    p.textContent = '+' + n;
    scoreEl.parentNode.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }

  function retrigger(cls) {
    boardEl.classList.remove('bump', 'shake');
    void boardEl.offsetWidth;
    boardEl.classList.add(cls);
  }
  boardEl.addEventListener('animationend', (e) => {
    if (e.target === boardEl) boardEl.classList.remove('bump', 'shake');
  });

  function bump(dr, dc) {
    boardEl.style.setProperty('--bx', dc * 6 + 'px');
    boardEl.style.setProperty('--by', dr * 6 + 'px');
    retrigger('bump');
  }

  function fx(t) {
    const [x, y] = xy(t.r, t.c);
    const cx = x + cell / 2, cy = y + cell / 2;
    const color = SCHOOLS[t.lv - 1].color;
    const n = Math.min(4 + t.lv, 16);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'particle';
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const d = cell * (0.45 + Math.random() * 0.45);
      p.style.cssText = `left:${cx}px;top:${cy}px;background:${i % 3 ? color : '#f2c14e'};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      fxLayer.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
    if (t.lv >= 5) {
      const ring = document.createElement('i');
      ring.className = 'ring';
      ring.style.cssText = `left:${cx}px;top:${cy}px;--c:${t.lv >= 8 ? '#f2c14e' : color}`;
      fxLayer.appendChild(ring);
      ring.addEventListener('animationend', () => ring.remove());
    }
    if (t.lv >= 10) retrigger('shake');
  }

  let toastTimer = 0;
  function toast(html) {
    toastEl.innerHTML = html;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  let unlockTimer = 0;
  function showUnlock(lv, bonus) {
    const s = SCHOOLS[lv - 1];
    unlockEl.innerHTML = `<div class="u-card">
      <div class="u-badge"><i class="u-rays"></i><img src="${badge[lv - 1]}" alt=""></div>
      <small>新校徽解锁 · ${2 ** lv}</small>
      <h3>${s.name}</h3>
      <p>${s.motto}${bonus ? ' · 撤销 +1' : ''}</p>
    </div>`;
    unlockEl.classList.add('show');
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => unlockEl.classList.remove('show'), 1600);
  }

  // ---------- 弹窗 ----------
  function openModal(html, cls = '') {
    card.className = 'modal-card ' + cls;
    card.innerHTML = html;
    card.scrollTop = 0;
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }

  const statsHTML = () => `<div class="stats">
    <div><b>${score}</b><small>得分</small></div>
    <div><b>${moves}</b><small>步数</small></div>
    <div><b>${best}</b><small>最高分</small></div></div>`;

  function showWin(celebrate) {
    if (!won) return;
    if (celebrate) { confetti(); sfxWin(); vibrate([40, 60, 40, 60, 120]); }
    const s = SCHOOLS[MAX - 1];
    openModal(`<img class="big" src="${badge[MAX - 1]}" alt="">
      <h2>恭喜合成${s.name}！</h2>
      <p class="motto">${s.motto}</p>
      <p>你从 ${SCHOOLS[0].name} 一路合成到了 <b>${2 ** MAX}</b></p>
      ${statsHTML()}
      <div class="row"><button class="btn" data-act="close">欣赏棋盘</button><button class="btn primary" data-act="new">再来一局</button></div>`, 'win');
  }

  function showOver() {
    if (!over) return;
    sfxOver();
    const s = SCHOOLS[maxLv - 1];
    const canUndo = undos > 0 && history.length;
    openModal(`<img class="big" src="${badge[maxLv - 1]}" alt="">
      <h2>无路可走啦</h2>
      <p>本局最高：<b>${s.name}</b>（${2 ** maxLv}）<br>距离山东大学还差 <b>${MAX - maxLv}</b> 级</p>
      ${statsHTML()}
      <div class="row">${canUndo ? `<button class="btn" data-act="undo">撤销一步（${undos}）</button>` : ''}<button class="btn primary" data-act="new">再来一局</button></div>`);
  }

  function showInfo(lv) {
    const s = SCHOOLS[lv - 1];
    const unlocked = lv <= Math.max(collection, maxLv);
    openModal(`<img class="big ${unlocked ? '' : 'locked'}" src="${badge[lv - 1]}" alt="">
      <h2>${s.name}</h2>
      <p class="motto">${s.motto}</p>
      <p>第 <b>${lv}</b> / ${MAX} 级 · 方块数值 <b>${2 ** lv}</b><br>创建于 ${s.year} 年 · 在校生约 ${s.students} 万人</p>
      <p>${unlocked ? '✅ 已解锁' : `🔒 合成 ${2 ** lv} 即可解锁`}</p>
      <div class="row"><button class="btn primary" data-act="close">好的</button></div>`);
  }

  function showHelp() {
    const rows = SCHOOLS.map((s, i) => `<tr class="${s.final ? 'final' : ''}"><td>${i + 1}</td><td><img src="${badge[i]}" alt=""> ${s.name}</td><td>${2 ** (i + 1)}</td><td>${s.students}</td></tr>`).join('');
    openModal(`<div class="help">
      <h2>玩法说明</h2>
      <ul>
        <li>滑动屏幕（电脑可用方向键 / WASD）移动所有校徽</li>
        <li>两个<b>相同</b>校徽相撞会合并，升级为下一所学校</li>
        <li>从 <b>${SCHOOLS[0].name}（2）</b>一路合成到 <b>山东大学（2<sup>15</sup> = 32768）</b>即通关</li>
        <li>每局 ${START_UNDOS} 次撤销；本局合成新的第 6 级及以上校徽时奖励 1 次撤销</li>
        <li>4×4 为经典难度，5×5 空间更大更容易</li>
      </ul>
      <h3>合成次序</h3>
      <table><thead><tr><th>级</th><th>学校</th><th>数值</th><th>在校生(万)</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">在校生人数为根据各校公开信息整理的全日制在校生近似值，仅用于排序。</p>
      <div class="row"><button class="btn primary" data-act="close">开始游戏</button></div>
    </div>`);
  }

  modal.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target === modal || act === 'close') closeModal();
    else if (act === 'new') newGame();
    else if (act === 'undo') { closeModal(); undo(); }
  });

  // ---------- 音效 / 震动 ----------
  let ac = null;
  function tone(f, d = 0.12, type = 'triangle', v = 0.12, w = 0) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime + w;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    } catch { /* 不支持音频时静默 */ }
  }
  const noteF = (lv) => 220 * Math.pow(2, (lv * 2) / 12);
  const sfxMove = () => tone(150, 0.05, 'sine', 0.03);
  function sfxMerge(lv) { tone(noteF(lv), 0.14); tone(noteF(lv) * 1.5, 0.1, 'sine', 0.05, 0.03); }
  function sfxUnlock(lv) { [0, 4, 7, 12].forEach((s, i) => tone(noteF(lv) * 2 ** (s / 12), 0.18, 'triangle', 0.09, 0.1 + i * 0.08)); }
  function sfxWin() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i > 4 ? 0.5 : 0.2, 'triangle', 0.12, i * 0.13)); }
  function sfxOver() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'sine', 0.08, i * 0.16)); }
  const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

  // ---------- 彩带 ----------
  function confetti(dur = 4500) {
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth, H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.display = 'block';
    const cols = ['#a6192e', '#f2c14e', '#ffffff', '#d4453c', '#ffd86b', '#5a3a32'];
    const ps = Array.from({ length: 180 }, (_, i) => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.7,
      vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 3,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 9 + Math.random() * 8, c: cols[i % cols.length],
    }));
    const t0 = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.x += p.vx + Math.sin((now + p.r * 500) / 400) * 0.6;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, (-p.h / 2) * Math.cos(p.r * 2), p.w, p.h * Math.cos(p.r * 2));
        ctx.restore();
      }
      if (now - t0 < dur) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); cv.style.display = 'none'; }
    })(t0);
  }

  // ---------- 输入 ----------
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down', h: 'left', l: 'right', k: 'up', j: 'down',
  };
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.ctrlKey) {
      if (k === 'z') { e.preventDefault(); undo(); }
      return;
    }
    if (modal.classList.contains('show')) {
      if (k === 'Escape') closeModal();
      return;
    }
    if (KEYS[k]) { e.preventDefault(); move(KEYS[k]); }
    else if (k === 'z' || k === 'u') undo();
  });

  const wrap = $('#board-wrap');
  let sp = null;
  const swipe = (dx, dy) => move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  wrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sp = { x: e.clientX, y: e.clientY, done: false };
    try { wrap.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!sp || sp.done) return;
    const dx = e.clientX - sp.x, dy = e.clientY - sp.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 26) { sp.done = true; swipe(dx, dy); }
  });
  wrap.addEventListener('pointerup', (e) => {
    if (sp && !sp.done) {
      const dx = e.clientX - sp.x, dy = e.clientY - sp.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) swipe(dx, dy);
    }
    sp = null;
  });
  wrap.addEventListener('pointercancel', () => (sp = null));
  wrap.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  $('#btn-new').addEventListener('click', () => {
    if (moves > 10 && !over && !won) {
      openModal(`<h2>重新开始？</h2><p>当前这局的进度将会丢失</p>
        <div class="row"><button class="btn" data-act="close">继续这局</button><button class="btn primary" data-act="new">重新开始</button></div>`);
    } else newGame();
  });
  undoBtn.addEventListener('click', undo);
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('sound', soundOn);
    $('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
    tone(523, 0.1);
  });
  $('#mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || +b.dataset.n === N) return;
    flush();
    save();
    N = +b.dataset.n;
    store.set('size', N);
    startMode();
  });
  ladderEl.addEventListener('click', (e) => {
    const b = e.target.closest('.lad');
    if (b) showInfo(+b.dataset.lv);
  });

  // ---------- 启动 ----------
  function startMode() {
    best = store.get('best' + N, 0);
    buildGridBg();
    clearBoard();
    layout();
    if (DEBUG || !load()) newGame();
    else {
      updateUI();
      if (won) setTimeout(() => showWin(false), 300);
      else if (over) setTimeout(showOver, 300);
    }
  }

  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(boardEl);
  else addEventListener('resize', layout);
  addEventListener('pagehide', save);

  startMode();
  if (!DEBUG && !store.get('seenHelp', false)) {
    store.set('seenHelp', true);
    setTimeout(showHelp, 300);
  }
})();
