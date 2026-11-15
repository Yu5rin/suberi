// すべり石 — 盤面ロジック（描画から独立。ブラウザとNodeの両方で使う）
(function (root) {
  'use strict';
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const WIND = { '^': 'U', 'v': 'D', '<': 'L', '>': 'R' };

  // levels.txt を解析
  function parseLevels(text) {
    const blocks = text.replace(/\r/g, '').trim().split(/\n\s*\n/);
    return blocks.map((b) => {
      const lines = b.split('\n');
      const [id, par, sol] = lines[0].trim().split(/\s+/);
      const rows = lines.slice(1);
      const [ch, no] = id.split('-').map(Number);
      const moves = [];
      for (let i = 0; i + 1 < (sol || '').length; i += 2) moves.push([+sol[i], sol[i + 1]]);
      return { id, ch, no, par: +par, sol: moves, rows, w: rows[0].length, h: rows.length };
    });
  }

  // 初期状態：床(grid)と石(stones[0]=朱の石, 以降=子石)
  function initState(lv) {
    const grid = [];
    const stones = [];
    const kids = [];
    let goal = null;
    lv.rows.forEach((row, y) => {
      grid.push(row.split('').map((c, x) => {
        if (c === 'A') { stones[0] = { x, y, alive: true }; return '.'; }
        if (c === 'b') { kids.push({ x, y, alive: true }); return '.'; }
        if (c === 'G') { goal = { x, y }; return '.'; }
        return c;
      }));
    });
    return { grid, stones: [stones[0], ...kids], goal, gateOpen: false, w: lv.w, h: lv.h, won: false };
  }

  // 盤(grid)は書き換える時だけ複製する（探索の高速化）
  function clone(s, deep = true) {
    return {
      grid: deep ? s.grid.map((r) => r.slice()) : s.grid, stones: s.stones.map((t) => ({ ...t })),
      goal: s.goal, gateOpen: s.gateOpen, w: s.w, h: s.h, won: s.won,
    };
  }

  function stoneAt(s, x, y, except) {
    for (let i = 0; i < s.stones.length; i++) {
      const t = s.stones[i];
      if (i !== except && t.alive && t.x === x && t.y === y) return i;
    }
    return -1;
  }

  function blocked(s, x, y, self) {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return true;
    const c = s.grid[y][x];
    if (c === '#') return true;
    if (c === '|' && !s.gateOpen) return true;
    return stoneAt(s, x, y, self) >= 0;
  }

  // 一手を実行。戻り値 { state, path, events, result }
  // result: 'none'(動かない) | 'move' | 'goal' | 'fall'(朱の石が落ちた)
  // path: [{x,y,ev}] 石の通った升（アニメーション用）
  function move(s0, idx, dir) {
    const s = clone(s0, false);
    let own = false;
    const setCell = (x, y, c) => { if (!own) { s.grid = s.grid.map((r) => r.slice()); own = true; } s.grid[y][x] = c; };
    const t = s.stones[idx];
    if (!t || !t.alive) return { state: s0, path: [], result: 'none' };
    let d = dir;
    let x = t.x, y = t.y;
    const path = [{ x, y }];
    const cracked = [];
    const seen = new Set();
    let result = 'move';
    let steps = 0;
    for (;;) {
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (blocked(s, nx, ny, idx)) break;
      // 薄氷：離れた升が割れる
      if (s.grid[y][x] === '~') { setCell(x, y, 'o'); cracked.push({ x, y }); }
      x = nx; y = ny; steps++;
      const c = s.grid[y][x];
      const step = { x, y };
      path.push(step);
      if (c === 'o') { // 穴
        step.ev = 'fall';
        if (idx === 0) { result = 'fall'; t.x = x; t.y = y; t.alive = false; break; }
        setCell(x, y, '.'); t.alive = false; t.x = x; t.y = y; step.ev = 'plop';
        break;
      }
      if (idx === 0 && s.goal && x === s.goal.x && y === s.goal.y) break; // 的に入ったら止まる
      if (c === '*') { step.ev = 'snow'; break; }
      if (WIND[c]) {
        step.ev = 'wind';
        const key = x + ',' + y + ',' + d;
        if (seen.has(key)) break; // 風の輪：念のため停止
        seen.add(key);
        d = WIND[c];
      }
    }
    if (steps === 0) return { state: s0, path: [], result: 'none' };
    if (result !== 'fall' && t.alive) {
      t.x = x; t.y = y;
      if (s.grid[y][x] === '_') { s.gateOpen = !s.gateOpen; path[path.length - 1].ev = 'gate'; }
      if (idx === 0 && s.goal && x === s.goal.x && y === s.goal.y) { result = 'goal'; s.won = true; }
    }
    return { state: s, path, cracked, result };
  }

  function key(s) {
    let k = s.gateOpen ? '1' : '0';
    for (const t of s.stones) k += t.alive ? ',' + t.x + ':' + t.y : ',x';
    k += '|';
    // 氷・穴は位置ごと記録（埋まった穴は '.' に戻るため）
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const c = s.grid[y][x];
      if (c === '~' || c === 'o') k += c + (y * s.w + x);
    }
    return k;
  }

  // 幅優先探索で最短手順（ヒント用）
  // 最短手順の探索（幅優先）。
  // lv を渡すと、収録の最短手順上の局面を「残り手数が分かっている近道」として使う。
  // 収録手順は最短なので、その途中局面からの残りも最短。深さ d で見つけた近道の合計 d+残り が
  // まだ調べていない深さ以下なら、それが最短と確定する。
  // 戻り値：手順の配列 / null（解けない）/ 'limit'（探索上限）
  function solve(s0, limit = 400000, lv = null) {
    if (s0.won) return [];
    const cells = [];
    for (let y = 0; y < s0.h; y++) for (let x = 0; x < s0.w; x++) if ('~o'.includes(s0.grid[y][x])) cells.push([x, y]);
    const key = (s) => {
      let k = s.gateOpen ? '1' : '0';
      for (const t of s.stones) k += t.alive ? String.fromCharCode(65 + t.x * 16 + t.y) : '!';
      for (const [x, y] of cells) k += s.grid[y][x];
      return k;
    };
    const book = new Map();
    if (lv) {
      let b = initState(lv);
      for (let i = 0; i < lv.sol.length; i++) {
        // 氷の升の並びが同じ盤でのみ比較できる（初期盤が同じ面なので常に同じ）
        if (!book.has(key(b))) book.set(key(b), i);
        b = move(b, lv.sol[i][0], lv.sol[i][1]).state;
      }
    }
    const pathTo = (qi) => { const out = []; for (let j = qi; par[j] >= 0; j = par[j]) out.unshift([mv[j] >> 2, 'UDLR'[mv[j] & 3]]); return out; };
    const fromBook = (qi, bi) => pathTo(qi).concat(lv.sol.slice(bi));
    const k0 = key(s0);
    if (book.has(k0)) return lv.sol.slice(book.get(k0));
    const q = [s0]; const par = [-1]; const mv = [0]; const dep = [0];
    const seen = new Set([k0]);
    let best = null, bestLen = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      if (dep[qi] + 1 >= bestLen) break; // これ以上浅い手順は無い
      const s = q[qi];
      for (let i = 0; i < s.stones.length; i++) {
        if (!s.stones[i].alive) continue;
        for (let di = 0; di < 4; di++) {
          const r = move(s, i, 'UDLR'[di]);
          if (r.result === 'none' || r.result === 'fall') continue;
          if (r.result === 'goal') {
            const out = pathTo(qi); out.push([i, 'UDLR'[di]]);
            return out;
          }
          const k = key(r.state);
          if (seen.has(k)) continue;
          seen.add(k);
          q.push(r.state); par.push(qi); mv.push(i * 4 + di); dep.push(dep[qi] + 1);
          if (book.has(k)) {
            const tot = dep[qi] + 1 + lv.sol.length - book.get(k);
            if (tot < bestLen) { bestLen = tot; best = fromBook(q.length - 1, book.get(k)); }
          }
          if (q.length > limit) return best || 'limit';
        }
      }
      q[qi] = null; // 展開済みの状態は解放
    }
    return best;
  }

  const API = { parseLevels, initState, move, solve, key, clone, DIRS };
  if (typeof module !== "undefined") module.exports = API; else root.Suberi = API;
})(typeof window !== "undefined" ? window : globalThis);
