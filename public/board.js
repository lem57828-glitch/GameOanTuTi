/* BOT ARENA - vẽ bàn cờ OTTv2 và trình xem lại ván. Dùng chung cho chơi thử, xem trận, phòng chung kết. */
'use strict';
(() => {
  const COLS = 'ABCDEFGHI';
  const TYPE_ICON = { ROCK: '✊', PAPER: '✋', SCISSORS: '✌️' };
  const TYPE_VI = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo' };
  const SIDE_VI = { blue: 'Xanh', pink: 'Hồng' };
  const REASON_VI = {
    goal: 'đưa quân vào ô đích', eliminate: 'ăn hết một loại quân của đối phương', no_moves: 'đối phương hết nước đi',
    repetition: 'lặp thế cờ 3 lần, phân định theo số quân', max_plies: 'hết giới hạn nước, phân định theo số quân',
    errors: 'đối phương lỗi 3 lần trong ván', crash: 'đối phương bị dừng (lỗi, thoát hoặc quá giờ)',
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * Vẽ bàn cờ (hàng 9 ở trên, cột A bên trái).
   * opts: { pieces, goals, selected, targets: [{to, capture}], last: {from,to}, clickable: bool }
   */
  function render(opts) {
    const { pieces, goals = { blue: 'I9', pink: 'A1' }, selected, targets = [], last, clickable } = opts;
    const tmap = new Map(targets.map((t) => [t.to, t]));
    let html = `<div class="board${clickable ? ' clickable' : ''}" role="grid" aria-label="Bàn cờ 9×9">`;
    for (let r = 8; r >= 0; r--) {
      html += `<div class="coord">${r + 1}</div>`;
      for (let c = 0; c < 9; c++) {
        const s = `${COLS[c]}${r + 1}`;
        const p = pieces[s];
        const t = tmap.get(s);
        const cls = ['cell', (r + c) % 2 ? 'dark' : '',
          s === goals.blue ? 'goal-blue' : '', s === goals.pink ? 'goal-pink' : '',
          s === selected ? 'sel' : '', last && (s === last.from || s === last.to) ? 'last' : '',
          t ? `target${t.capture ? ' capture' : ''}` : ''].filter(Boolean).join(' ');
        const title = `${s}${p ? `: ${TYPE_VI[p.type] || p.type} ${SIDE_VI[p.side]}` : ''}${s === goals.blue ? ' (đích của Xanh)' : s === goals.pink ? ' (đích của Hồng)' : ''}`;
        html += `<div class="${cls}" data-sq="${s}" role="gridcell" title="${esc(title)}">${p ? `<span class="piece ${p.side}">${TYPE_ICON[p.type] || esc(p.type[0])}</span>` : ''}</div>`;
      }
    }
    html += '<div></div>' + [...COLS].map((c) => `<div class="coord">${c}</div>`).join('') + '</div>';
    return html;
  }

  function counts(pieces) {
    const out = { blue: { ROCK: 0, PAPER: 0, SCISSORS: 0 }, pink: { ROCK: 0, PAPER: 0, SCISSORS: 0 } };
    for (const p of Object.values(pieces)) out[p.side][p.type] = (out[p.side][p.type] || 0) + 1;
    return out;
  }

  function countsHtml(pieces, labels = {}) {
    const c = counts(pieces);
    return ['blue', 'pink'].map((side) => `<div class="side-box ${side}"><div class="row"><span class="piece ${side} sm">●</span><b>${esc(labels[side] || SIDE_VI[side])}</b></div>
      <div class="row small">${Object.keys(TYPE_ICON).map((t) => `<span class="${c[side][t] ? '' : 'gone'}">${TYPE_ICON[t]} ${TYPE_VI[t]} <b>${c[side][t]}</b></span>`).join('')}</div></div>`).join('');
  }

  function beatsHtml(beats) {
    return Object.keys(TYPE_ICON).map((t) => `<span class="badge info">${TYPE_ICON[t]} ${TYPE_VI[t]} ăn ${(beats[t] || []).map((x) => `${TYPE_ICON[x]} ${TYPE_VI[x]}`).join(', ') || '—'}</span>`).join(' ');
  }

  /** Áp danh sách nước lên thế cờ ban đầu, trả về thế cờ sau `upto` nước. */
  function positionAt(setup, moves, upto) {
    const pieces = { ...setup };
    for (const m of moves.slice(0, upto)) {
      if (!m.from) continue;
      pieces[m.to] = pieces[m.from];
      delete pieces[m.from];
    }
    return pieces;
  }

  function moveText(m, i) {
    if (!m.from) return `<li class="err">${i + 1}. ${SIDE_VI[m.side]}: ${esc(m.err || 'dừng')}</li>`;
    return `<li class="${m.err ? 'err' : ''}" data-i="${i + 1}">${i + 1}. <span class="dot ${m.side}"></span>${TYPE_ICON[m.type] || ''} ${m.from}→${m.to}${m.capture ? ` ✖${TYPE_ICON[m.capture] || m.capture}` : ''}${m.err ? ` <span class="small">(lỗi: ${esc(m.err)}${m.auto ? ', hệ thống đi thay' : ''})</span>` : ''}</li>`;
  }

  /**
   * Trình xem lại một ván trong `root`. game: { moves, ... }. Trả về hàm dọn dẹp (dừng tự chạy).
   */
  function replayer(root, { setup, goals, moves, labels, header = '' }) {
    let i = moves.length;
    let timer = null;
    root.innerHTML = `${header}<div class="game-layout">
      <div><div class="rp-board"></div>
        <div class="row" style="justify-content:center;margin-top:10px">
          <button class="btn sm" data-a="first" aria-label="Về đầu">⏮</button><button class="btn sm" data-a="prev" aria-label="Lùi">◀</button>
          <button class="btn sm primary" data-a="play">▶ Chạy</button><button class="btn sm" data-a="next" aria-label="Tới">▶|</button><button class="btn sm" data-a="last" aria-label="Về cuối">⏭</button>
        </div>
        <input type="range" class="rp-range" min="0" max="${moves.length}" value="${i}" aria-label="Nước" style="margin-top:8px">
      </div>
      <div><div class="rp-counts"></div><p class="small muted rp-pos"></p><ol class="movelist rp-list">${moves.map(moveText).join('')}</ol></div></div>`;
    const draw = () => {
      const pieces = positionAt(setup, moves, i);
      const last = i ? moves[i - 1] : null;
      root.querySelector('.rp-board').innerHTML = render({ pieces, goals, last: last && last.from ? last : null });
      root.querySelector('.rp-counts').innerHTML = countsHtml(pieces, labels);
      root.querySelector('.rp-pos').textContent = `Sau nước ${i}/${moves.length}`;
      root.querySelector('.rp-range').value = i;
      root.querySelectorAll('.rp-list li').forEach((li) => li.classList.toggle('cur', Number(li.dataset.i) === i));
      const cur = root.querySelector('.rp-list li.cur');
      if (cur && timer) cur.scrollIntoView({ block: 'nearest' });
    };
    const stop = () => { clearInterval(timer); timer = null; root.querySelector('[data-a="play"]').textContent = '▶ Chạy'; };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      const li = e.target.closest('.rp-list li[data-i]');
      if (li) { stop(); i = Number(li.dataset.i); return draw(); }
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'play') {
        if (timer) return stop();
        if (i >= moves.length) i = 0;
        b.textContent = '⏸ Dừng';
        timer = setInterval(() => { if (i >= moves.length) return stop(); i++; draw(); }, 450);
        return;
      }
      stop();
      i = a === 'first' ? 0 : a === 'last' ? moves.length : a === 'prev' ? Math.max(0, i - 1) : Math.min(moves.length, i + 1);
      draw();
    });
    root.querySelector('.rp-range').addEventListener('input', (e) => { stop(); i = Number(e.target.value); draw(); });
    draw();
    return stop;
  }

  window.BoardUI = { render, counts, countsHtml, beatsHtml, replayer, positionAt, TYPE_ICON, TYPE_VI, SIDE_VI, REASON_VI };
})();
