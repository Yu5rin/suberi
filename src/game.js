// すべり石 — ブラウザ版の画面・操作・描画
(async function () {
  'use strict';
  const S = window.Suberi;
  const $ = (id) => document.getElementById(id);

  // ---- 章・本 ----
  const CHAPTERS = [
    null,
    { name: 'すべり石', desc: '石は岩か壁に当たるまで止まらない。朱の石を的に入れる' },
    { name: '子石', desc: '墨の子石も動かせる。当てて止まる場所をつくる' },
    { name: '雪だまり', desc: '雪だまりに入った石は、そこでぴたりと止まる' },
    { name: '薄氷', desc: '薄氷は石が通ると割れて穴になる。子石を落とすと穴は埋まる' },
    { name: '風の道', desc: '風の床に入った石は、矢の向きへ曲がって滑りつづける' },
    { name: '門と踏み板', desc: '石が踏み板の上で止まるたびに、門が開いたり閉じたりする' },
    { name: '詰め手', desc: '長い手順の面。子石の置き場所から考える' },
    { name: 'ないまぜ', desc: 'これまでの仕掛けがまざって出てくる' },
  ];
  const BOOKS = [{ name: 'はじめの池', ch: [1, 2, 3, 4] }, { name: '奥の池', ch: [5, 6, 7, 8] }];
  const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const UNLOCK_PER_CHAPTER = 30; // 章 c は 印 30×(c-1) で開く
  const MAX_HINTS = 3;

  // ---- 面データ ----
  async function loadText(id, url) {
    const el = $(id);
    if (el && el.textContent.trim()) return el.textContent;
    return (await fetch(url)).text();
  }
  const LEVELS = S.parseLevels(await loadText('levels', 'levels.txt'));
  const byId = new Map(LEVELS.map((l, i) => [l.id, i]));

  // ---- 記録 ----
  const SAVE_KEY = 'suberi-save-v1';
  let save = { stars: {}, best: {}, last: null, sound: 1, buzz: 1, fast: 0, hintTotal: 0 }; // hintTotal: ヒントを見た累計回数
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 保存不可でも遊べる */ }
  const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* noop */ } };
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
  const chapterStars = (c) => LEVELS.filter((l) => l.ch === c).reduce((a, l) => a + (save.stars[l.id] || 0), 0);
  const needFor = (c) => UNLOCK_PER_CHAPTER * (c - 1);
  const isOpen = (c) => totalStars() >= needFor(c);

  // ---- 音 ----
  const SND = ['tap', 'slide', 'knock', 'snow', 'wind', 'crack', 'plop', 'splash', 'gate', 'goal', 'stamp', 'undo'];
  let actx = null; const buffers = {};
  // data: URI は fetch を使わずに復号する（埋め込み版・CSP対策）
  function b64buf(u) { const bin = atob(u.slice(u.indexOf(',') + 1)); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }
  function audioInit() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      for (const n of SND) {
        const inl = document.getElementById('snd-' + n);
        const src = inl ? inl.textContent.trim() : 'sounds/' + n + '.wav';
        (src.startsWith('data:') ? Promise.resolve(b64buf(src)) : fetch(src).then((r) => r.arrayBuffer())).then((b) => actx.decodeAudioData(b)).then((buf) => { buffers[n] = buf; }).catch(() => {});
      }
    } catch (e) { actx = null; }
  }
  function play(n, vol = 1) {
    if (!save.sound || !actx || !buffers[n]) return;
    if (actx.state === 'suspended') actx.resume();
    const s = actx.createBufferSource(); s.buffer = buffers[n];
    const g = actx.createGain(); g.gain.value = vol; s.connect(g).connect(actx.destination); s.start();
  }
  const buzz = (ms) => { if (save.buzz && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* noop */ } };
  document.addEventListener('pointerdown', audioInit, { once: false, capture: true });
  document.addEventListener('keydown', audioInit, { capture: true });

  // ---- 画面切り替え ----
  let screen = 'title';
  function show(id) {
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
    screen = id;
    if (id === 'title') renderTitle();
    if (id === 'select') renderSelect();
    if (id === 'conf') renderConf();
    if (id === 'game') requestAnimationFrame(resize);
  }
  const on = (id, fn) => $(id).addEventListener('click', () => { play('tap', 0.6); fn(); });
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }

  // ---- タイトル ----
  function renderTitle() {
    const t = totalStars();
    const lines = [];
    if (t) lines.push(`集めた印 ${t} / ${LEVELS.length * 3}`);
    if (save.hintTotal) lines.push(`ヒントを見た回数 累計 ${save.hintTotal}`);
    $('tStars').textContent = lines.join('　');
    $('tContinue').textContent = save.last ? `つづきから（${save.last}）` : 'はじめる';
  }
  on('tContinue', () => openLevel(save.last && byId.has(save.last) ? byId.get(save.last) : firstUnsolved()));
  on('tSelect', () => show('select'));
  on('tHow', () => show('how'));
  on('tConf', () => show('conf'));
  function firstUnsolved() {
    const i = LEVELS.findIndex((l) => !save.stars[l.id] && isOpen(l.ch));
    return i < 0 ? 0 : i;
  }

  // ---- 面をえらぶ ----
  let book = 0;
  function renderSelect() {
    $('sStars').textContent = `印 ${totalStars()}`;
    const tabs = $('tabs'); tabs.innerHTML = '';
    BOOKS.forEach((b, i) => {
      const bt = document.createElement('button'); bt.textContent = b.name; bt.className = i === book ? 'on' : '';
      bt.onclick = () => { play('tap', 0.6); book = i; renderSelect(); }; tabs.appendChild(bt);
    });
    const box = $('chapters'); box.innerHTML = '';
    for (const c of BOOKS[book].ch) {
      const open = isOpen(c);
      const d = document.createElement('div'); d.className = 'chap' + (open ? '' : ' lock');
      const lvls = LEVELS.filter((l) => l.ch === c);
      d.innerHTML = `<h3>${KANJI[c]}の章　${CHAPTERS[c].name}<small>この章の印 ${chapterStars(c)} / ${lvls.length * 3}</small></h3>
        <p>${open ? CHAPTERS[c].desc : `印が ${needFor(c)} 集まると開きます(いま ${totalStars()})`}</p>`;
      const g = document.createElement('div'); g.className = 'grid';
      for (const l of lvls) {
        const b = document.createElement('button'); const st = save.stars[l.id] || 0;
        b.innerHTML = `${l.no}<span class="st">${'●'.repeat(st)}</span>`;
        b.disabled = !open; b.setAttribute('aria-label', `${l.id} 印${st}`);
        b.onclick = () => { play('tap', 0.6); openLevel(byId.get(l.id)); };
        g.appendChild(b);
      }
      d.appendChild(g); box.appendChild(d);
    }
  }
  on('sBack', () => show('title'));

  // ---- 設定 ----
  let resetArmed = false;
  function renderConf() {
    for (const o of document.querySelectorAll('.opts')) {
      for (const b of o.querySelectorAll('button')) b.classList.toggle('on', String(save[o.dataset.key]) === b.dataset.v);
    }
    resetArmed = false; $('fReset').textContent = '記録を消す';
  }
  for (const o of document.querySelectorAll('.opts')) {
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      save[o.dataset.key] = +b.dataset.v; store(); renderConf(); play('tap', 0.6);
      if (o.dataset.key === 'buzz' && save.buzz) buzz(30);
    });
  }
  on('fReset', () => {
    if (!resetArmed) { resetArmed = true; $('fReset').textContent = 'もう一度押すと消えます'; return; }
    save.stars = {}; save.best = {}; save.last = null; save.hintTotal = 0; store(); renderConf(); toast('消しました');
  });
  on('fBack', () => show('title'));
  on('hBack', () => show('title'));

  // ---- ゲーム本体 ----
  let L = null, li = 0, state = null, history = [], moves = 0, sel = 0;
  let anim = null, hint = null, hintsUsed = 0, hintToken = 0, busy = false;
  const hintsByLevel = {};

  function openLevel(i) {
    li = i; L = LEVELS[i];
    if (!isOpen(L.ch)) { toast('次の章はあと印 ' + (needFor(L.ch) - totalStars())); show('select'); return; }
    save.last = L.id; store();
    hintsUsed = hintsByLevel[L.id] || 0;
    $('gId').textContent = L.id; $('gName').textContent = `${KANJI[L.ch]}の章　${CHAPTERS[L.ch].name}`;
    $('gPar').textContent = L.par + ' 手';
    $('clear').classList.remove('on');
    resetLevel(true);
    show('game');
    setMsg(L.no === 1 ? CHAPTERS[L.ch].desc : '');
  }
  function resetLevel(silent) {
    state = S.initState(L); history = []; moves = 0; sel = 0; anim = null; hint = null; hintToken++; busy = false;
    if (!silent) { play('undo', 0.7); setMsg(''); }
    updateHud(); draw();
  }
  function setMsg(t, warn) { const m = $('msg'); m.textContent = t || ''; m.classList.toggle('warn', !!warn); }
  function updateHud() {
    $('gMoves').textContent = moves;
    $('gUndo').disabled = !history.length;
    $('gHintLeft').textContent = `のこり ${MAX_HINTS - hintsUsed}・累計 ${save.hintTotal || 0}`;
  }
  on('gList', () => { hintToken++; show('select'); });
  on('gUndo', undo);
  on('gReset', () => { if (!anim) resetLevel(false); });
  on('gHint', doHint);
  on('cNext', () => {
    $('clear').classList.remove('on');
    const n = li + 1;
    if (n >= LEVELS.length) { show('select'); return; }
    if (!isOpen(LEVELS[n].ch)) { toast('次の章はあと印 ' + (needFor(LEVELS[n].ch) - totalStars())); show('select'); return; }
    openLevel(n);
  });
  on('cAgain', () => { $('clear').classList.remove('on'); resetLevel(true); });
  on('cList', () => { $('clear').classList.remove('on'); show('select'); });

  function undo() {
    if (anim || !history.length) return;
    state = history.pop(); moves--; hint = null; hintToken++;
    play('undo', 0.7); setMsg(''); updateHud(); draw();
  }

  function tryMove(idx, dir) {
    if (anim || state.won || busy) return;
    const r = S.move(state, idx, dir);
    if (r.result === 'none') { play('knock', 0.35); buzz(8); return; }
    const followed = hint && hint.idx === idx && hint.dir === dir;
    hint = null; hintToken++;
    sel = idx;
    play('slide', 0.7);
    const speed = save.fast ? 34 : 17; // 升/秒
    anim = { idx, r, prev: state, t0: performance.now(), dur: Math.max(120, (r.path.length - 1) / speed * 1000), fired: 0, followed };
    requestAnimationFrame(tick);
  }

  function fireEvents(upto) {
    const p = anim.r.path;
    for (let i = anim.fired + 1; i <= upto && i < p.length; i++) {
      const ev = p[i].ev;
      if (anim.prev.grid[p[i - 1].y][p[i - 1].x] === '~') play('crack', 0.6);
      if (ev === 'wind') play('wind', 0.6);
      anim.fired = i;
    }
  }

  function tick(now) {
    if (!anim) return;
    const k = Math.max(0, Math.min(1, (now - anim.t0) / anim.dur));
    anim.k = k;
    const n = anim.r.path.length - 1;
    fireEvents(Math.floor(k * n));
    draw();
    if (k < 1) { requestAnimationFrame(tick); return; }
    if (!anim.fallT) finishMove(now);
    else if (now - anim.fallT < 420) { requestAnimationFrame(tick); }
    else { // 朱の石が落ちた：一手もどす
      anim = null; draw(); play('undo', 0.6);
      setMsg('朱の石が穴に落ちました。一手もどします', true);
    }
  }

  function finishMove(now) {
    const r = anim.r; const last = r.path[r.path.length - 1];
    if (r.result === 'fall') { play('splash'); buzz([30, 40, 30]); anim.fallT = now; requestAnimationFrame(tick); return; }
    if (last.ev === 'plop') { play('plop'); buzz(20); }
    else if (last.ev === 'snow') play('snow', 0.8);
    else if (r.result !== 'goal') { play('knock', 0.8); buzz(12); }
    if (last.ev === 'gate') setTimeout(() => play('gate', 0.8), 60);
    history.push(anim.prev); state = r.state; moves++;
    const followed = anim.followed;
    anim = null; updateHud(); draw();
    if (r.result === 'goal') { onGoal(); return; }
    setMsg(followed ? 'ヒント通りです' : '');
  }

  function onGoal() {
    play('goal'); buzz([20, 60, 40]);
    let st = moves <= L.par ? 3 : moves <= L.par + 2 ? 2 : 1;
    if (hintsUsed > 0) st = Math.min(st, 2);
    const prevOpen = BOOKS.flatMap((b) => b.ch).filter(isOpen).length;
    save.stars[L.id] = Math.max(save.stars[L.id] || 0, st);
    save.best[L.id] = Math.min(save.best[L.id] || 999, moves);
    store();
    const nowOpen = BOOKS.flatMap((b) => b.ch).filter(isOpen).length;
    setTimeout(() => {
      $('cSeal').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= st ? '' : 'off'}">印</span>`).join('');
      let t = `${moves} 手 / 最短 ${L.par} 手`;
      if (moves <= L.par) t += hintsUsed ? '　最短です(ヒントあり)' : '　最短の手順です';
      else t += `　あと ${moves - L.par} 手縮められます`;
      if (nowOpen > prevOpen) t += '\n次の章が開きました';
      $('cText').textContent = t; $('cText').style.whiteSpace = 'pre-line';
      $('clear').classList.add('on'); play('stamp', 0.8);
      $('cNext').focus({ preventScroll: true });
    }, 450);
  }

  // ---- ヒント ----
  // まず収録の最短手順に乗っているかを調べ、外れていればワーカーで探索する
  let worker = null, workerFail = false;
  async function getWorker() {
    if (worker || workerFail) return worker;
    try {
      const src = await loadText('engine', 'engine.js');
      const code = src + '\nself.onmessage=(e)=>{const S=self.Suberi||globalThis.Suberi;const r=S.solve(e.data.state,e.data.limit,e.data.lv);self.postMessage({id:e.data.id,sol:r});};';
      worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    } catch (e) { workerFail = true; worker = null; }
    return worker;
  }
  function solveAsync(st) {
    return new Promise(async (res) => {
      const w = await getWorker();
      if (!w) { setTimeout(() => res(S.solve(st, 300000, L)), 30); return; }
      const id = Math.random();
      const h = (e) => { if (e.data.id === id) { w.removeEventListener('message', h); w.removeEventListener('error', fail); res(e.data.sol); } };
      // ワーカーが使えない環境（CSP等）では画面側で探索する
      const fail = () => { w.removeEventListener('message', h); workerFail = true; worker = null; setTimeout(() => res(S.solve(st, 300000, L)), 30); };
      w.addEventListener('message', h); w.addEventListener('error', fail);
      w.postMessage({ id, state: st, limit: 600000, lv: L });
    });
  }
  async function doHint() {
    if (anim || state.won || busy) return;
    if (hint) { setMsg(`ヒント：あと最短 ${hint.left} 手`); return; }
    if (hintsUsed >= MAX_HINTS) { setMsg('この面のヒントは使い切りました', true); return; }
    const token = ++hintToken;
    busy = true; $('gHint').disabled = true;
    const slow = setTimeout(() => setMsg('考え中…'), 150);
    const sol = await solveAsync(state);
    clearTimeout(slow); busy = false; $('gHint').disabled = false;
    if (token !== hintToken || screen !== 'game') return;
    if (sol === 'limit') { setMsg('手順を見つけきれませんでした。少しもどしてから、もう一度どうぞ', true); return; }
    if (!sol || !sol.length) { setMsg('この形からは解けません。もどすか、やりなおしてください', true); return; }
    hintsUsed++; hintsByLevel[L.id] = hintsUsed;
    save.hintTotal = (save.hintTotal || 0) + 1; store(); // 累計はブラウザを閉じても残る
    hint = { idx: sol[0][0], dir: sol[0][1], left: sol.length, t0: performance.now() };
    sel = hint.idx;
    setMsg(`ヒント：あと最短 ${sol.length} 手`);
    updateHud(); requestAnimationFrame(hintLoop);
  }
  function hintLoop() { if (hint && screen === 'game' && !anim) { draw(); requestAnimationFrame(hintLoop); } }

  // ---- 描画 ----
  const cv = $('board'); const ctx = cv.getContext('2d');
  let geo = { cs: 40, ox: 0, oy: 0, dpr: 1 };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let C = {};
  function readColors() {
    C = {
      paper: css('--paper'), paper2: css('--paper2'), ink: css('--ink'), ink2: css('--ink2'), ink3: css('--ink3'),
      shu: css('--shu'), shu2: css('--shu2'), rock: css('--rock'), rock2: css('--rock2'), ice: css('--ice'), ice2: css('--ice2'), line: css('--line'),
    };
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  readColors();

  function resize() {
    const r = $('stage').getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (L) {
      const cs = Math.floor(Math.min(r.width / (L.w + 0.3), r.height / (L.h + 0.3)));
      geo = { cs, ox: (r.width - cs * L.w) / 2, oy: (r.height - cs * L.h) / 2, dpr };
    }
    draw();
  }
  window.addEventListener('resize', resize);

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function drawCell(c, x, y, s, gateOpen) {
    const cs = geo.cs; const px = geo.ox + x * cs, py = geo.oy + y * cs; const m = cs / 2;
    // 氷
    ctx.fillStyle = C.ice; ctx.fillRect(px, py, cs, cs);
    ctx.strokeStyle = C.ice2; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
    if (c === '#') {
      ctx.fillStyle = C.rock;
      rr(px + cs * 0.06, py + cs * 0.08, cs * 0.88, cs * 0.84, cs * 0.22); ctx.fill();
      ctx.fillStyle = C.rock2; rr(px + cs * 0.12, py + cs * 0.12, cs * 0.7, cs * 0.6, cs * 0.18); ctx.fill();
      ctx.strokeStyle = C.rock; ctx.lineWidth = Math.max(1, cs * 0.03);
      ctx.beginPath(); ctx.moveTo(px + cs * 0.3, py + cs * 0.35); ctx.lineTo(px + cs * 0.48, py + cs * 0.3); ctx.stroke();
    } else if (c === '~') { // 薄氷
      ctx.fillStyle = C.paper; ctx.globalAlpha = 0.55; ctx.fillRect(px + 2, py + 2, cs - 4, cs - 4); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ice2; ctx.lineWidth = Math.max(1, cs * 0.03);
      ctx.beginPath();
      ctx.moveTo(px + cs * 0.2, py + cs * 0.3); ctx.lineTo(px + cs * 0.45, py + cs * 0.45); ctx.lineTo(px + cs * 0.8, py + cs * 0.35);
      ctx.moveTo(px + cs * 0.45, py + cs * 0.45); ctx.lineTo(px + cs * 0.5, py + cs * 0.8);
      ctx.stroke();
    } else if (c === 'o') { // 穴
      ctx.fillStyle = C.ink; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(px + m, py + m, cs * 0.4, cs * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = C.ice; ctx.lineWidth = Math.max(1, cs * 0.03);
      ctx.beginPath(); ctx.ellipse(px + m, py + m, cs * 0.22, cs * 0.15, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (c === '*') { // 雪だまり
      ctx.fillStyle = '#fbfbf8';
      ctx.beginPath();
      ctx.arc(px + cs * 0.35, py + cs * 0.58, cs * 0.24, 0, Math.PI * 2);
      ctx.arc(px + cs * 0.62, py + cs * 0.52, cs * 0.27, 0, Math.PI * 2);
      ctx.arc(px + cs * 0.5, py + cs * 0.68, cs * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ice2; ctx.lineWidth = 1; ctx.stroke();
    } else if ('<>^v'.includes(c)) { // 風の床
      const ang = { '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[c];
      ctx.save(); ctx.translate(px + m, py + m); ctx.rotate(ang);
      ctx.strokeStyle = C.ink3; ctx.lineWidth = Math.max(1.5, cs * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const ofs of [-0.16, 0.12]) {
        ctx.beginPath(); ctx.moveTo(cs * (ofs - 0.08), -cs * 0.2); ctx.lineTo(cs * (ofs + 0.12), 0); ctx.lineTo(cs * (ofs - 0.08), cs * 0.2); ctx.stroke();
      }
      ctx.restore();
    } else if (c === '_') { // 踏み板
      ctx.fillStyle = C.paper2; ctx.strokeStyle = C.ink2; ctx.lineWidth = Math.max(1, cs * 0.04);
      rr(px + cs * 0.16, py + cs * 0.16, cs * 0.68, cs * 0.68, cs * 0.08); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + cs * 0.3, py + m); ctx.lineTo(px + cs * 0.7, py + m); ctx.stroke();
    } else if (c === '|') { // 門
      ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(2, cs * 0.08); ctx.lineCap = 'round';
      if (!gateOpen) {
        ctx.fillStyle = C.ink2; ctx.globalAlpha = 0.25; ctx.fillRect(px + 2, py + 2, cs - 4, cs - 4); ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(px + cs * 0.15, py + cs * 0.25); ctx.lineTo(px + cs * 0.85, py + cs * 0.25);
        for (const xx of [0.3, 0.5, 0.7]) { ctx.moveTo(px + cs * xx, py + cs * 0.2); ctx.lineTo(px + cs * xx, py + cs * 0.85); }
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.45; ctx.setLineDash([cs * 0.08, cs * 0.08]); ctx.lineWidth = Math.max(1, cs * 0.04);
        ctx.strokeRect(px + cs * 0.15, py + cs * 0.15, cs * 0.7, cs * 0.7); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(2, cs * 0.08);
        ctx.beginPath(); ctx.moveTo(px + cs * 0.15, py + cs * 0.25); ctx.lineTo(px + cs * 0.85, py + cs * 0.25); ctx.stroke();
      }
    }
  }

  function drawStone(i, fx, fy, scale = 1, alpha = 1) {
    const cs = geo.cs; const cx = geo.ox + (fx + 0.5) * cs, cy = geo.oy + (fy + 0.5) * cs; const r = cs * 0.38 * scale;
    ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.25, r * 1.02, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i === 0 ? C.shu : C.ink;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.32, r * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!L || !state || screen !== 'game') return;
    const { dpr, cs, ox, oy } = geo;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const base = anim ? anim.prev : state;
    // 動作中に割れた薄氷
    const cracked = new Set();
    let pos = null;
    if (anim) {
      const p = anim.r.path; const n = p.length - 1; const f = (anim.k || 0) * n; const i = Math.min(n - 1, Math.floor(f)); const t = f - i;
      for (let j = 0; j <= Math.min(n, Math.floor(f + 1e-6)) - 1; j++) if (base.grid[p[j].y][p[j].x] === '~') cracked.add(p[j].x + ',' + p[j].y);
      pos = n === 0 ? p[0] : { x: p[i].x + (p[i + 1].x - p[i].x) * t, y: p[i].y + (p[i + 1].y - p[i].y) * t };
      if (anim.k >= 1) pos = p[n];
    }
    // 盤の縁
    ctx.fillStyle = C.line; rr(ox - 6, oy - 6, cs * L.w + 12, cs * L.h + 12, 10); ctx.fill();
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      let c = base.grid[y][x];
      if (cracked.has(x + ',' + y)) c = 'o';
      drawCell(c, x, y, base, base.gateOpen);
    }
    // 的
    if (base.goal) {
      const g = base.goal; ctx.strokeStyle = C.shu; ctx.lineWidth = Math.max(2, cs * 0.07);
      ctx.strokeRect(ox + g.x * cs + cs * 0.12, oy + g.y * cs + cs * 0.12, cs * 0.76, cs * 0.76);
      ctx.globalAlpha = 0.1; ctx.fillStyle = C.shu; ctx.fillRect(ox + g.x * cs + cs * 0.12, oy + g.y * cs + cs * 0.12, cs * 0.76, cs * 0.76); ctx.globalAlpha = 1;
    }
    // 石
    base.stones.forEach((t, i) => {
      if (anim && i === anim.idx) return;
      if (!t.alive) return;
      drawStone(i, t.x, t.y);
    });
    if (anim) {
      const last = anim.r.path[anim.r.path.length - 1];
      const falling = anim.k >= 1 && (anim.r.result === 'fall' || last.ev === 'plop');
      if (falling && anim.r.result === 'fall') {
        const ft = anim.fallT ? Math.min(1, (performance.now() - anim.fallT) / 400) : 0;
        drawStone(anim.idx, pos.x, pos.y, 1 - ft * 0.7, 1 - ft);
      } else if (!falling) drawStone(anim.idx, pos.x, pos.y);
    }
    // 選択の輪（キーボード操作用）
    const st = state.stones[sel];
    if (!anim && st && st.alive && (kbMode || hint)) {
      ctx.strokeStyle = C.shu2; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(ox + (st.x + 0.5) * cs, oy + (st.y + 0.5) * cs, cs * 0.47, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // ヒントの矢
    if (hint && !anim) {
      const t = state.stones[hint.idx]; const [dx, dy] = S.DIRS[hint.dir];
      const ph = ((performance.now() - hint.t0) / 900) % 1;
      const cx = ox + (t.x + 0.5) * cs, cy = oy + (t.y + 0.5) * cs;
      const d0 = cs * (0.55 + ph * 0.25), len = cs * 0.45;
      ctx.save(); ctx.translate(cx + dx * d0, cy + dy * d0); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = 1 - ph * 0.6; ctx.fillStyle = C.shu;
      ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(0, -len * 0.5); ctx.lineTo(len * 0.15, 0); ctx.lineTo(0, len * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  // ---- 入力 ----
  let kbMode = false; let drag = null;
  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    return { fx: (e.clientX - r.left - geo.ox) / geo.cs - 0.5, fy: (e.clientY - r.top - geo.oy) / geo.cs - 0.5 };
  }
  function nearestStone(fx, fy, maxD) {
    let best = -1, bd = maxD;
    state.stones.forEach((t, i) => { if (!t.alive) return; const d = Math.hypot(t.x - fx, t.y - fy); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  cv.addEventListener('pointerdown', (e) => {
    if (anim || state.won) return;
    kbMode = false;
    const { fx, fy } = cellAt(e);
    const i = nearestStone(fx, fy, 0.75);
    drag = { i, x: e.clientX, y: e.clientY, done: false };
    cv.setPointerCapture(e.pointerId);
    if (i >= 0) { sel = i; draw(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || drag.done || drag.i < 0) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < Math.max(14, geo.cs * 0.3)) return;
    drag.done = true;
    tryMove(drag.i, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
  });
  const endDrag = () => { drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', (e) => {
    if (screen !== 'game') { if (e.key === 'Escape' && screen !== 'title') show('title'); return; }
    if ($('clear').classList.contains('on')) { if (e.key === 'Escape') show('select'); return; }
    const k = e.key;
    const dir = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R' }[k];
    if (dir) { e.preventDefault(); kbMode = true; tryMove(sel, dir); return; }
    if (k === 'Tab') {
      e.preventDefault(); kbMode = true; const n = state.stones.length;
      for (let j = 1; j <= n; j++) { const c = (sel + (e.shiftKey ? -j : j) + n * 2) % n; if (state.stones[c].alive) { sel = c; break; } }
      draw(); return;
    }
    if (/^[0-9]$/.test(k)) { const c = +k; if (state.stones[c] && state.stones[c].alive) { kbMode = true; sel = c; draw(); } return; }
    if (k === 'z' || k === 'Z' || k === 'Backspace') { e.preventDefault(); undo(); return; }
    if (k === 'r' || k === 'R') { if (!anim) resetLevel(false); return; }
    if (k === 'h' || k === 'H') { doHint(); return; }
    if (k === 'Escape') show('select');
  });

  // ---- 開始 ----
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
  show('title');
})();
