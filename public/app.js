/* BOT ARENA - giao diện web (không cần build). */
'use strict';

// ============================================================ tiện ích

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');
const PHASE_VI = { swiss: 'Sơ loại Swiss', r32: 'Vòng 32', r16: 'Vòng 16', qf: 'Tứ kết', sf: 'Bán kết', final: 'Chung kết', main: 'Thi chính' };
const STATUS_VI = {
  pending: ['Chưa bắt đầu', ''], locked: ['Đã khóa bản', 'warn'], running: ['Đang diễn ra', 'info'], done: ['Đã xong', 'ok'],
  queued: ['Đang chờ', 'warn'], valid: ['Hợp lệ', 'ok'], invalid: ['Không hợp lệ', 'bad'], error: ['Lỗi', 'bad'],
  open: ['Đang mở', 'warn'], answered: ['Đã trả lời', 'info'], closed: ['Đã đóng', 'ok'], draft: ['Bản nháp', ''], ended: ['Hết giờ', 'ok'],
};
const badge = (s) => { const [t, c] = STATUS_VI[s] || [s, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/** Gắn hành động cho nút: tự khóa nút khi đang chạy, báo lỗi bằng toast. */
function on(el, event, fn) {
  if (!el) return;
  el.addEventListener(event, async (e) => {
    if (event === 'submit') e.preventDefault();
    const btn = e.submitter || (el.tagName === 'BUTTON' ? el : null);
    if (btn) btn.disabled = true;
    try { await fn(e); } catch (err) { toast(err.message, true); } finally { if (btn) btn.disabled = false; }
  });
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());

function tabs(key, names, current, onChange) {
  const bar = document.createElement('div');
  bar.className = 'tabs';
  bar.setAttribute('role', 'tablist');
  bar.innerHTML = Object.entries(names).map(([k, v]) => `<button role="tab" data-k="${k}" class="${k === current ? 'active' : ''}">${esc(v)}</button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try { localStorage.setItem(`tab:${key}`, b.dataset.k); } catch { /* bỏ qua */ }
    onChange(b.dataset.k);
  });
  return bar;
}
function savedTab(key, fallback) {
  try { return localStorage.getItem(`tab:${key}`) || fallback; } catch { return fallback; }
}

// ============================================================ định tuyến

const state = { me: { user: null }, overview: null };
const routes = [];
let cleanups = [];
const route = (pattern, page) => routes.push([pattern, page]);
const every = (ms, fn) => { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); };

async function render() {
  cleanups.forEach((f) => f());
  cleanups = [];
  const path = location.hash.replace(/^#/, '') || '/';
  const root = $('#app');
  renderNav(path);
  for (const [re, page] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try {
      await page(root, ...m.slice(1).map(decodeURIComponent));
    } catch (e) {
      root.innerHTML = `<div class="card"><h2>Không tải được trang</h2><p class="muted">${esc(e.message)}</p></div>`;
    }
    window.scrollTo(0, 0);
    return;
  }
  root.innerHTML = '<div class="card"><h2>Không tìm thấy trang</h2><a href="#/">Về trang chủ</a></div>';
}

function renderNav(path) {
  const u = state.me.user;
  const items = [['/', 'Trang chủ'], ['/huong-dan', 'Hướng dẫn'], ['/dau-truong', 'Đấu trường'], ['/bot', 'Bot của tôi'], ['/doi', 'Đội'],
    ['/xep-hang', 'Bảng xếp hạng'], ['/chung-ket', 'Chung kết'], ['/thanh-tich', 'Thành tích'], ['/ho-tro', 'Hỗ trợ']];
  if (u && u.role === 'admin') items.push(['/quan-tri', 'Quản trị']);
  $('#nav').innerHTML = items.map(([href, label]) => {
    const active = href === '/' ? path === '/' : path.startsWith(href);
    return `<a href="#${href}" class="${active ? 'active' : ''}">${label}</a>`;
  }).join('');
  $('#userbox').innerHTML = u
    ? `<span class="avatar" title="${esc(u.email)}">${esc(u.name[0].toUpperCase())}</span><span class="small">${esc(u.name)}</span>
       <button class="btn sm" id="logout">Thoát</button>`
    : '<a class="btn sm" href="#/dang-nhap">Đăng nhập</a><a class="btn sm primary" href="#/dang-ky">Đăng ký</a>';
  on($('#logout'), 'click', async () => { await api('/auth/logout', { method: 'POST' }); await refreshMe(); location.hash = '#/'; });
}

async function refreshMe() { state.me = await api('/me'); }

function needLogin(root) {
  if (state.me.user) return false;
  root.innerHTML = `<div class="card"><h2>Cần đăng nhập</h2><p>Đăng nhập để dùng chức năng này.</p>
    <div class="row"><a class="btn primary" href="#/dang-nhap">Đăng nhập</a><a class="btn" href="#/dang-ky">Tạo tài khoản</a></div></div>`;
  return true;
}
function needTeam(root) {
  if (needLogin(root)) return true;
  if (state.me.team) return false;
  root.innerHTML = `<div class="card"><h2>Bạn chưa có đội</h2><p>Mỗi đội 1-3 sinh viên. Bạn có thể tự lập đội một người hoặc nhập mã mời của đội trưởng.
    Trong lúc chờ, bạn vẫn có thể <a href="#/dau-truong">chơi thử với bot mẫu</a>.</p><a class="btn primary" href="#/doi">Lập hoặc tham gia đội</a></div>`;
  return true;
}

// ============================================================ trang chủ

route(/^\/$/, async (root) => {
  const o = state.overview = await api('/overview');
  const me = state.me;
  const hasBot = me.team && me.team.official_submission_id;
  const phaseIdx = o.phases.findIndex((p) => p.key === o.currentPhase);
  const steps = [
    ['1', 'Nộp bot', !!hasBot], ['2', 'Chạy thử', false], ['3', 'Swiss', o.phases[0].status === 'done'], ['🏆', 'Top 32', !!(me.team && /Top 32|vòng 16|tứ kết|bán kết|chung kết|Vô địch|Á quân/i.test(me.team.achievement || ''))],
  ];
  root.innerHTML = `
  <section class="card hero">
    <div>
      <div class="eyebrow">Giải đấu lập trình bot cờ búa-kéo-bao OTTv2 cho sinh viên năm nhất</div>
      <h1>Code bot.<br>Thử chiến thuật.<br><span class="hl">Vào Top 32.</span></h1>
      <p class="muted">Viết một hàm Python điều khiển 10 quân búa, kéo, bao trên bàn cờ 9×9: đưa quân vào ô đích hoặc ăn hết một loại quân đối thủ. Bot tự thi trên máy chủ; thua một trận không bị loại: sơ loại Swiss ${o.swissRounds} vòng chọn 32 đội vào vòng chính.</p>
      <div class="row">
        <a class="btn primary" href="#/bot">⬆ Nộp bot</a>
        <a class="btn" href="#/dau-truong">▶ Chơi thử</a>
        <a class="btn" href="/api/sample-bots/starter_bot">⬇ Tải bot mẫu</a>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true"><span>✊</span><span>✌️</span><span>✋</span></div>
  </section>

  <div class="grid g4" style="margin-top:16px">
    <div class="card stat"><div class="ico">🏆</div><div><b>${money(o.prizeFund)}</b><span class="muted small">Tổng giải thưởng</span></div></div>
    <div class="card stat"><div class="ico">👥</div><div><b>Top 32</b><span class="muted small">Vào vòng chính, mỗi đội ${money(200000)}</span></div></div>
    <div class="card stat"><div class="ico">📜</div><div><b>Chứng nhận</b><span class="muted small">Cá nhân, xác minh được, dùng cho CV</span></div></div>
    <div class="card stat"><div class="ico">⏱</div><div><b>${esc(PHASE_VI[o.currentPhase] || '')}</b><span class="muted small">${o.submissionsOpen ? 'Đang nhận bài' : 'Đang khóa nộp bài'}</span></div></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h2>Bắt đầu ngay</h2>${me.user && !me.team ? '<span class="badge accent">Chưa có đội</span>' : ''}</div>
      <div class="stack">
        <a class="card linkcard" href="#/dau-truong"><div class="ico">🎮</div><div><b>Người vs Bot mẫu</b><div class="muted small">Tự đánh cờ với bot mẫu để hiểu luật, không tính điểm giải</div></div></a>
        <a class="card linkcard" href="#/dau-truong"><div class="ico">&lt;/&gt;</div><div><b>Chạy thử bot</b><div class="muted small">Bot của đội đấu bot mẫu, xem lại từng nước và lỗi</div></div></a>
        <a class="card linkcard" href="#/huong-dan"><div class="ico">📘</div><div><b>Hướng dẫn &amp; thể lệ</b><div class="muted small">Giao diện bot, giới hạn, cách tính điểm</div></div></a>
      </div>
    </div>
    <div class="card">
      <h2>Hành trình tham gia</h2>
      <div class="journey" style="margin:12px 0 20px">
        ${steps.map(([n, l, d], i) => `${i ? '<span class="arrow">→</span>' : ''}<div class="step"><span class="dot ${d ? 'done' : ''}">${d ? '✓' : n}</span>${l}</div>`).join('')}
      </div>
      <h3>Lịch thi đấu</h3>
      <div class="table-wrap"><table><tbody>
        ${o.phases.map((p, i) => `<tr${i === phaseIdx ? ' class="me"' : ''}><td>${esc(p.title)}</td><td class="right">${badge(p.status)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <h2>Thông báo</h2>
      ${o.announcements.length ? o.announcements.map((a) => `<div style="margin-bottom:12px"><b>${esc(a.title)}</b> <span class="muted small">${fmtTime(a.created_at)}</span><p>${esc(a.body)}</p></div>`).join('') : '<p class="muted">Chưa có thông báo.</p>'}
    </div>
    <div class="card">
      <h2>Số liệu</h2>
      <div class="grid g2">
        <div><b style="font-size:1.6rem">${o.stats.users}</b><div class="muted small">sinh viên đăng ký</div></div>
        <div><b style="font-size:1.6rem">${o.stats.teams}</b><div class="muted small">đội</div></div>
        <div><b style="font-size:1.6rem">${o.stats.validBots}</b><div class="muted small">đội có bot hợp lệ</div></div>
        <div><b style="font-size:1.6rem">${o.stats.matches}</b><div class="muted small">trận chính thức đã đấu</div></div>
      </div>
    </div>
  </div>`;
});

// ============================================================ hướng dẫn

route(/^\/huong-dan$/, async (root) => {
  const [o, r] = await Promise.all([api('/overview'), api('/rules')]);
  const L = o.limits, M = r.match, B = window.BoardUI;
  root.innerHTML = `
  <div class="grid g2">
  <div class="stack">
    <div class="card">
      <h1>Hướng dẫn &amp; thể lệ</h1>
      <ol>
        <li>Tạo tài khoản, lập đội 1-3 người (mỗi người một đội).</li>
        <li>Tải <a href="/api/sample-bots/starter_bot">bot mẫu</a>, sửa hàm <code>make_move</code>.</li>
        <li>Nộp tệp <code>.py</code> ở <a href="#/bot">Bot của tôi</a>. Hệ thống cho bot đánh thử mỗi màu một ván và báo hợp lệ hay lỗi.</li>
        <li>Chạy thử với bot mẫu (${L.practicePerDay} trận/ngày), xem lại từng nước, sửa và nộp lại không giới hạn trước hạn.</li>
        <li>Đội trưởng chọn bản thi. Khi giai đoạn khóa, bản đó được dùng cho cả giai đoạn; bot tự thi, không cần mở máy.</li>
      </ol>
      <p class="muted small">Kiểm tra hợp lệ chỉ loại bot lỗi (không khởi động được, trả nước sai, quá giờ), không loại bot vì chiến thuật yếu.</p>
    </div>
    <div class="card">
      <h2>Luật OTTv2 (bàn cờ búa/kéo/bao)</h2>
      ${B.render({ pieces: r.setup, goals: r.goals })}
      <ul style="margin-top:12px">
        <li>Bàn 9×9, mỗi bên 10 quân: 3 ✊ Búa, 4 ✋ Bao, 3 ✌️ Kéo, xếp như hình. <b>Xanh đi trước.</b></li>
        <li>Mỗi lượt đi <b>một quân, một ô</b> theo 8 hướng (như quân vua).</li>
        <li>Đi vào ô có quân đối phương mà quân mình khắc thì <b>ăn</b> quân đó: ${B.beatsHtml(r.ruleset.beats)}</li>
        <li>Quân mình, quân đối phương <b>cùng loại</b> và quân đối phương <b>mạnh hơn</b> đều chặn đường: không đi vào được.</li>
        <li><b>Thắng</b> khi đưa một quân vào ô đích (<span class="dot blue"></span>Xanh → <b>I9</b>, <span class="dot pink"></span>Hồng → <b>A1</b>)
          hoặc <b>ăn hết một loại quân</b> của đối phương.</li>
        <li>Tới lượt mà không còn nước đi hợp lệ thì <b>thua</b>.</li>
        <li>Lặp cùng thế cờ 3 lần hoặc quá ${M.maxPlies} nước (mỗi bên ${M.maxPlies / 2}): bên còn <b>nhiều quân hơn</b> thắng, bằng nhau là hòa.</li>
      </ul>
    </div>
    <div class="card">
      <h2>Giao diện bot</h2>
      <pre>import random

def make_move(state):
    # state["me"]            "blue" (Xanh) hoặc "pink" (Hồng)
    # state["my_goal"]       ô đích của bạn: "I9" hoặc "A1"
    # state["opponent_goal"] ô đích của đối thủ (góc nhà bạn)
    # state["beats"]         {"ROCK": ["SCISSORS"], ...}
    # state["board"]         {"B4": {"side": "blue", "type": "ROCK"}, ...}
    # state["my_pieces"], state["opponent_pieces"]
    # state["legal_moves"]   [{"from": "B4", "to": "C5", "capture": None}, ...]
    # state["ply"], state["max_plies"], state["history"]
    return random.choice(state["legal_moves"])   # hoặc "B4-C5"</pre>
      <p>Bàn cờ là công khai nên bot luôn thấy toàn bộ thế cờ và các nước đã đi trong ván. Hãy dùng <code>state["beats"]</code> thay vì viết cứng
        quan hệ ăn quân, vì chung kết sẽ đổi luật.</p>
      <p>Bot mẫu: <a href="/api/sample-bots/starter_bot">Khởi đầu</a> • ${Object.entries(r.sampleBots).map(([k, v]) => `<a href="/api/sample-bots/${k}">${esc(v)}</a>`).join(' • ')}</p>
    </div>
  </div>
  <div class="stack">
    <div class="card">
      <h2>Giới hạn kỹ thuật</h2>
      <div class="table-wrap"><table><tbody>
        <tr><td>Kích thước mã</td><td>${L.codeBytes / 1024 / 1024} MB, một tệp .py</td></tr>
        <tr><td>Bộ nhớ</td><td>${L.memoryMb} MB mỗi bot</td></tr>
        <tr><td>CPU mỗi nước</td><td>${L.cpuMsPerTurn} ms</td></tr>
        <tr><td>Nước sai, lỗi, quá CPU</td><td>Hệ thống đi thay một nước hợp lệ ngẫu nhiên và ghi lỗi; lỗi lần thứ ${L.maxErrors} trong ván là <b>thua ván</b></td></tr>
        <tr><td>Chờ tối đa mỗi nước</td><td>${L.wallMsPerTurn / 1000} giây; quá giờ thì bot bị dừng và <b>thua ván</b></td></tr>
        <tr><td>Khởi động</td><td>${L.startupMs / 1000} giây</td></tr>
        <tr><td>Log (print)</td><td>${L.logBytes / 1024 / 1024} MB mỗi bot/ván</td></tr>
        <tr><td>Mạng, tiến trình con, tệp</td><td>Bị chặn; không đọc được bài đội khác</td></tr>
      </tbody></table></div>
    </div>
    <div class="card">
      <h2>Một trận</h2>
      <p>Một <b>trận</b> gồm <b>${M.games} ván đổi màu</b>: mỗi bot cầm Xanh (đi trước) một ván và Hồng một ván.
      Thắng ván 1 điểm, hòa 0,5. Nhiều điểm ván hơn thắng trận, bằng nhau là hòa trận.</p>
    </div>
    <div class="card">
      <h2>Sơ loại Swiss</h2>
      <p>${o.swissRounds} vòng, mỗi đội một trận mỗi vòng. Vòng 1 bốc thăm có lưu seed; các vòng sau ghép đội gần điểm, tránh tái đấu khi có thể.
      Số đội lẻ: một đội ít điểm nhất chưa nghỉ được bye (${r.swiss.bye} điểm, không cộng hiệu số).</p>
      <div class="table-wrap"><table><thead><tr><th>Kết quả trận</th><th>Điểm Swiss</th></tr></thead><tbody>
        <tr><td>Thắng</td><td>${r.swiss.win}</td></tr><tr><td>Hòa</td><td>${r.swiss.draw}</td></tr><tr><td>Thua</td><td>${r.swiss.loss}</td></tr>
      </tbody></table></div>
      <p style="margin-top:12px"><b>Xếp hạng:</b> tổng điểm Swiss → điểm trung bình cuối sơ loại của các đối thủ đã gặp → hiệu số ván thắng-thua.</p>
      <p><b>Bằng điểm ở vị trí 32:</b> chỉ nhóm vắt qua ranh giới đấu tranh suất. Nhóm ≤ 10 đội: loại trực tiếp rút gọn (K-S trận, có miễn đấu theo bốc thăm).
      Nhóm lớn hơn: thêm đúng một vòng trong nhóm rồi xử lý phần còn lại. Đội bằng điểm nhưng chắc suất được bốc thăm phân hạt giống.</p>
    </div>
    <div class="card">
      <h2>Vòng chính &amp; chung kết</h2>
      <p>Vòng 32, 16 và tứ kết: mỗi cặp một trận. Bán kết: đủ 3 trận, thắng ít nhất 2 đi tiếp. Chung kết: thắng 2/3 trận.
      Trận hòa ở vòng loại trực tiếp: thêm ${M.extraGames} ván đổi màu, vẫn hòa thì bốc thăm có ghi nhận.</p>
      <p><b>Chung kết đổi luật:</b> hai đội nhận cùng bảng khắc chế mới và dữ liệu một trận lịch sử, tự sửa bot trong 60-90 phút, <b>không dùng AI</b> hay hỗ trợ bên ngoài, rồi khóa bản và thi.</p>
      <p class="muted small">Được nâng cấp bot giữa các giai đoạn, không sửa giữa các trận cùng giai đoạn.</p>
    </div>
    <div class="card">
      <h2>Giải thưởng (cộng dồn theo đội)</h2>
      <div class="table-wrap"><table><tbody>
        <tr><td>Top 32: 32 đội × ${money(r.prizes.top32)}</td><td class="right">${money(32 * r.prizes.top32)}</td></tr>
        <tr><td>Giải nhất</td><td class="right">${money(r.prizes.champion)}</td></tr>
        <tr><td>Giải nhì</td><td class="right">${money(r.prizes.runnerUp)}</td></tr>
        <tr><td>Hai đội dừng ở bán kết: 2 × ${money(r.prizes.semifinal)}</td><td class="right">${money(2 * r.prizes.semifinal)}</td></tr>
        <tr><td>Giải phụ (Tiến bộ nổi bật, Ý tưởng chiến thuật): 2 × ${money(r.prizes.side)}</td><td class="right">${money(2 * r.prizes.side)}</td></tr>
        <tr><th>Tổng quỹ</th><th class="right">${money(o.prizeFund)}</th></tr>
      </tbody></table></div>
      <p class="muted small" style="margin-top:8px">Chứng nhận hoàn thành cấp cho thành viên có bot hợp lệ và thi xong sơ loại; chỉ đăng ký thì không được cấp.</p>
    </div>
  </div>
  </div>`;
});

// ============================================================ đăng nhập / đăng ký

route(/^\/dang-nhap$/, async (root) => {
  root.innerHTML = `<div class="card" style="max-width:420px;margin:0 auto"><h1>Đăng nhập</h1>
    <form id="f"><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="p">Mật khẩu</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%">Đăng nhập</button></form>
    <p class="small muted" style="margin-top:12px">Chưa có tài khoản? <a href="#/dang-ky">Đăng ký</a></p></div>`;
  on($('#f'), 'submit', async (e) => {
    await api('/auth/login', { method: 'POST', body: formData(e.target) });
    await refreshMe();
    location.hash = state.me.team ? '#/bot' : '#/doi';
  });
});

route(/^\/dang-ky$/, async (root) => {
  root.innerHTML = `<div class="card" style="max-width:480px;margin:0 auto"><h1>Tạo tài khoản</h1>
    <form id="f">
      <div class="field"><label for="n">Họ tên (in trên chứng nhận)</label><input id="n" name="name" required autocomplete="name"></div>
      <div class="field"><label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email"></div>
      <div class="grid g2"><div class="field"><label for="s">Mã sinh viên</label><input id="s" name="student_id"></div>
      <div class="field"><label for="sc">Trường / khoa</label><input id="sc" name="school"></div></div>
      <div class="field"><label for="p">Mật khẩu (≥ 8 ký tự)</label><input id="p" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn primary" style="width:100%">Đăng ký</button>
    </form></div>`;
  on($('#f'), 'submit', async (e) => {
    await api('/auth/register', { method: 'POST', body: formData(e.target) });
    await refreshMe();
    toast('Đã tạo tài khoản. Bước tiếp: lập hoặc tham gia đội.');
    location.hash = '#/doi';
  });
});

// ============================================================ đội

route(/^\/doi$/, async (root) => {
  if (needLogin(root)) return;
  await refreshMe();
  const t = state.me.team;
  if (!t) {
    root.innerHTML = `<div class="grid g2">
      <div class="card"><h2>Lập đội mới</h2><p class="muted">Bạn sẽ là đội trưởng: nộp bài, chọn bản thi, mời thành viên.</p>
        <form id="create"><div class="field"><label for="tn">Tên đội</label><input id="tn" name="name" required maxlength="60"></div><button class="btn primary">Lập đội</button></form></div>
      <div class="card"><h2>Tham gia đội</h2><p class="muted">Nhập mã mời do đội trưởng gửi. Mỗi đội tối đa 3 người.</p>
        <form id="join"><div class="field"><label for="jc">Mã mời</label><input id="jc" name="code" required></div><button class="btn">Tham gia</button></form></div>
    </div>`;
    on($('#create'), 'submit', async (e) => { await api('/teams', { method: 'POST', body: formData(e.target) }); toast('Đã lập đội'); await refreshMe(); render(); });
    on($('#join'), 'submit', async (e) => { const r = await api('/teams/join', { method: 'POST', body: formData(e.target) }); toast(`Đã vào đội ${r.team}`); await refreshMe(); render(); });
    return;
  }
  const matches = await api('/team/matches');
  root.innerHTML = `<div class="grid g2">
    <div class="card">
      <div class="card-head"><h1 style="margin:0">${esc(t.name)}</h1>${t.withdrawn ? '<span class="badge bad">Đã rút</span>' : ''}</div>
      ${t.achievement ? `<p><span class="badge ok">${esc(t.achievement)}</span></p>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Mã SV</th><th></th></tr></thead><tbody>
        ${t.members.map((m) => `<tr><td>${esc(m.name)} ${m.id === t.captain_id ? '<span class="badge info">Đội trưởng</span>' : ''}<div class="muted small">${esc(m.email)}</div></td>
          <td>${esc(m.student_id || '')}</td>
          <td class="right">${t.isCaptain && m.id !== t.captain_id ? `<button class="btn sm" data-cap="${m.id}">Chuyển đội trưởng</button> <button class="btn sm danger" data-kick="${m.id}">Mời rời</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${t.isCaptain ? `<div class="notice" style="margin-top:16px">Mã mời: <b class="mono" style="font-size:1.1rem">${esc(t.invite_code)}</b>
        <button class="btn sm" id="newcode">Đổi mã</button><div class="small muted">Còn ${3 - t.members.length} chỗ trống.</div></div>` : ''}
      <div class="row" style="margin-top:16px"><button class="btn danger sm" id="leave">Rời đội</button></div>
    </div>
    <div class="card">
      <h2>Trận chính thức của đội</h2>
      ${matches.length ? `<div class="table-wrap"><table><thead><tr><th>Giai đoạn</th><th>Đối thủ</th><th>Tỉ số</th><th>Kết quả</th></tr></thead><tbody>
        ${matches.map((m) => {
          const a = m.team_a === t.id;
          if (m.kind === 'bye') return `<tr><td>${PHASE_VI[m.phase_key]} v${m.round_no}</td><td colspan="2" class="muted">Lượt nghỉ (bye)</td><td><span class="badge ok">+3</span></td></tr>`;
          const res = m.status !== 'done' ? badge(m.status) : m.result === 'draw' ? '<span class="badge">Hòa</span>'
            : (m.result === 'a') === a ? '<span class="badge ok">Thắng</span>' : '<span class="badge bad">Thua</span>';
          return `<tr><td>${PHASE_VI[m.phase_key] || ''} ${m.kind === 'tiebreak' ? '(tranh suất)' : m.kind === 'knockout' ? `trận ${m.game_no}` : `v${m.round_no}`}</td>
            <td>${esc(a ? m.name_b : m.name_a)}</td><td><a href="#/tran/${m.id}">${m.status === 'done' ? `${a ? m.wins_a : m.wins_b} - ${a ? m.wins_b : m.wins_a}` : 'xem'}</a></td><td>${res}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Chưa có trận chính thức.</p>'}
    </div></div>`;
  on($('#newcode'), 'click', async () => { await api('/teams/invite', { method: 'POST' }); await refreshMe(); render(); });
  on($('#leave'), 'click', async () => {
    if (!confirm('Rời đội này?')) return;
    await api('/teams/leave', { method: 'POST' }); await refreshMe(); render();
  });
  $$('[data-kick]').forEach((b) => on(b, 'click', async () => {
    if (!confirm('Mời thành viên này rời đội?')) return;
    await api('/teams/kick', { method: 'POST', body: { userId: Number(b.dataset.kick) } }); await refreshMe(); render();
  }));
  $$('[data-cap]').forEach((b) => on(b, 'click', async () => {
    if (!confirm('Chuyển quyền đội trưởng?')) return;
    await api('/teams/captain', { method: 'POST', body: { userId: Number(b.dataset.cap) } }); await refreshMe(); render();
  }));
});

// ============================================================ bot của tôi

route(/^\/bot$/, async (root) => {
  if (needTeam(root)) return;
  await refreshMe();
  const t = state.me.team;
  const draw = async (selected) => {
    const d = await api('/bots');
    const locked = Object.fromEntries(d.locked.map((l) => [l.submission_id, l.phase_key]));
    const lockedList = d.locked.map((l) => `${PHASE_VI[l.phase_key]}: v${d.submissions.find((s) => s.id === l.submission_id)?.version ?? '?'}`);
    const pending = d.submissions.some((s) => s.status === 'pending');
    root.innerHTML = `
    <div class="card-head"><div><h1 style="margin:0">Bot của tôi</h1><p class="muted" style="margin:0">Quản lý mã nguồn, phiên bản và chọn bản thi cho đội ${esc(t.name)}.</p></div>
      <a class="btn" href="#/huong-dan">📘 Hướng dẫn</a></div>
    ${lockedList.length ? `<div class="notice warn" style="margin-bottom:16px">Bản đã khóa: ${lockedList.map(esc).join(' • ')}. Đổi bản thi bây giờ chỉ áp dụng cho giai đoạn khóa sau.</div>` : ''}
    <div class="grid g2">
      <div class="card">
        <h2>Tải mã Python</h2>
        <div class="drop" id="drop">
          <div class="big">☁️</div>
          <p>Kéo thả tệp <code>.py</code> vào đây hoặc</p>
          <label class="btn primary" style="display:inline-flex">Chọn tệp .py<input type="file" id="file" accept=".py" class="hidden"></label>
          <p class="muted small" style="margin-top:8px">Tối đa 1 MB. Phải có hàm <code>make_move(state)</code>.</p>
        </div>
        <details style="margin-top:12px"><summary>Hoặc dán mã trực tiếp</summary>
          <form id="paste" style="margin-top:8px"><textarea name="code" class="mono" rows="10" placeholder="def make_move(state):&#10;    return 'ROCK'"></textarea>
          <button class="btn" style="margin-top:8px">Nộp mã đã dán</button></form></details>
      </div>
      <div class="card">
        <div class="card-head"><h2>Danh sách phiên bản</h2>${pending ? '<span class="badge warn">Đang kiểm thử…</span>' : ''}</div>
        ${d.submissions.length ? `<div class="table-wrap"><table><thead><tr><th>Bản</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          ${d.submissions.map((s) => `<tr${s.id === d.official ? ' class="me"' : ''}>
            <td><b>v${s.version}</b>${s.phase_key === 'final' ? ' <span class="badge accent">CK</span>' : ''}<div class="muted small mono" title="SHA-256 ${esc(s.sha256)}">${esc(s.sha256.slice(0, 10))}</div></td>
            <td class="small">${fmtTime(s.created_at)}<div class="muted">${esc(s.submitter)}</div></td>
            <td>${badge(s.status)}${s.id === d.official ? ' <span class="badge info">Bản thi</span>' : ''}${locked[s.id] ? ` <span class="badge warn">Khóa ${esc(PHASE_VI[locked[s.id]])}</span>` : ''}</td>
            <td class="right nowrap"><button class="btn sm" data-view="${s.id}">Xem</button>
              ${t.isCaptain && s.status === 'valid' && s.id !== d.official ? `<button class="btn sm primary" data-off="${s.id}">Chọn bản thi</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Chưa có phiên bản nào. Bắt đầu từ <a href="/api/sample-bots/starter_bot">bot mẫu</a>.</p>'}
        ${!t.isCaptain ? '<p class="muted small" style="margin-top:8px">Chỉ đội trưởng chọn được bản thi.</p>' : ''}
      </div>
    </div>
    <div id="detail"></div>`;

    const upload = async (filename, code) => {
      await api('/bots', { method: 'POST', body: { filename, code } });
      toast('Đã nộp. Hệ thống đang kiểm thử cách ly…');
      draw();
    };
    const readFile = async (f) => {
      if (!f) return;
      if (f.size > 1024 * 1024) throw new Error('Tệp vượt quá 1 MB');
      await upload(f.name, await f.text());
    };
    on($('#file'), 'change', (e) => readFile(e.target.files[0]));
    const drop = $('#drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    on(drop, 'drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); await readFile(e.dataTransfer.files[0]); });
    on($('#paste'), 'submit', (e) => upload('pasted.py', e.target.code.value));
    $$('[data-off]').forEach((b) => on(b, 'click', async () => {
      await api(`/bots/${b.dataset.off}/official`, { method: 'POST' }); toast('Đã chọn bản thi'); await refreshMe(); draw();
    }));
    const view = async (id) => {
      const s = await api(`/bots/${id}`);
      $('#detail').innerHTML = `<div class="card" style="margin-top:16px"><div class="card-head"><h2>v${s.version} • ${esc(s.filename)}</h2>${badge(s.status)}</div>
        <p class="small muted">SHA-256 <span class="mono">${esc(s.sha256)}</span> • ${s.size} byte • ${fmtTime(s.created_at)} • môi trường: ${esc(s.env_version || '')}</p>
        <div class="grid g2"><div><h3>Kết quả kiểm thử</h3><pre>${esc(s.check_log || 'Đang chờ kiểm thử…')}</pre></div>
        <div><h3>Mã nguồn</h3><pre>${esc(s.code)}</pre></div></div></div>`;
      $('#detail').scrollIntoView({ behavior: 'smooth' });
    };
    $$('[data-view]').forEach((b) => on(b, 'click', () => view(b.dataset.view)));
    if (selected) view(selected);
    if (pending) { const tm = setTimeout(() => draw(), 2000); cleanups.push(() => clearTimeout(tm)); }
  };
  await draw();
});

// ============================================================ đấu trường

route(/^\/dau-truong$/, async (root) => {
  const show = (tab) => {
    cleanups.forEach((f) => f()); cleanups = [];
    root.innerHTML = `<div class="card-head"><div><h1 style="margin:0">Đấu trường thử nghiệm</h1>
      <p class="muted" style="margin:0">Thử bot, rèn chiến thuật và làm quen với cách thức thi đấu.</p></div>
      <div class="notice warn small">⚠ Không tính điểm giải. Kết quả ở đây không ảnh hưởng bảng xếp hạng.</div></div><div id="pane"></div>`;
    root.insertBefore(tabs('arena', { human: '👤 Người vs Bot mẫu', practice: '🤖 Bot vs Bot mẫu' }, tab, show), $('#pane'));
    return (tab === 'practice' ? practicePane : humanPane)($('#pane'));
  };
  await show(savedTab('arena', 'human'));
});

async function humanPane(pane) {
  if (!state.me.user) {
    pane.innerHTML = '<div class="card"><p>Đăng nhập để chơi thử với bot mẫu.</p><a class="btn primary" href="#/dang-nhap">Đăng nhập</a></div>';
    return;
  }
  const r = await api('/rules');
  const { game } = await api('/play');
  if (game) return humanGame(pane, game, r);
  const B = window.BoardUI;
  pane.innerHTML = `<div class="card"><div class="game-layout">
    <div>${B.render({ pieces: r.setup, goals: r.goals })}</div>
    <div>
      <h2>Ván thử theo luật thi</h2>
      <p>Bạn đóng vai một bot, đấu một ván với bot mẫu theo đúng luật OTTv2 dùng khi thi: giới hạn ${r.match.maxPlies} nước, lặp thế cờ 3 lần, thắng bằng ô đích hoặc ăn hết một loại quân.</p>
      <div class="field"><label for="bot">Đối thủ</label>
        <select id="bot">${Object.entries(r.sampleBots).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="color">Bạn cầm</label>
        <select id="color"><option value="blue">Xanh — đi trước, đích I9</option><option value="pink">Hồng — đi sau, đích A1</option></select></div>
      <button class="btn primary" id="go">▶ Bắt đầu ván</button>
      <p class="muted small" style="margin-top:12px">Cách đi: bấm vào quân của bạn để xem các ô đi được (chấm xanh), ô có vòng đỏ là ăn được quân. Bấm ô để đi.
        Kết quả không tính điểm giải.</p>
    </div></div></div>`;
  on($('#go'), 'click', async () => humanGame(pane, await api('/play', { method: 'POST', body: { bot: $('#bot').value, color: $('#color').value } }), r));
}

function humanGame(pane, g, r) {
  const B = window.BoardUI;
  let selected = null;
  let busy = false;
  const labels = { [g.color]: 'Bạn', [g.botColor]: `Bot mẫu: ${r.sampleBots[g.bot]}` };
  pane.innerHTML = `<div class="card"><div class="game-layout">
    <div id="bd"></div>
    <div>
      <div class="card-head" style="margin-bottom:8px"><div><b id="status"></b><div class="muted small" id="sub"></div></div>
        <button class="btn sm" id="quit">Bỏ ván</button></div>
      <div id="counts"></div>
      <div id="endbox"></div>
      <div class="small" style="margin:8px 0">${B.beatsHtml(g.ruleset.beats)}</div>
      <ol class="movelist" id="moves"></ol>
    </div></div></div>`;

  const draw = () => {
    const mine = g.legal.filter((m) => m.from === selected);
    const last = g.history[g.history.length - 1];
    $('#bd').innerHTML = B.render({ pieces: g.pieces, goals: g.goals, selected, targets: mine, last, clickable: !g.end });
    $('#counts').innerHTML = B.countsHtml(g.pieces, labels);
    $$('#counts .side-box').forEach((el) => el.classList.toggle('turn', !g.end && el.classList.contains(g.toMove)));
    $('#status').textContent = g.end ? 'Ván đã kết thúc' : g.toMove === g.color ? `Lượt của bạn (${B.SIDE_VI[g.color]})` : 'Bot đang đi…';
    $('#sub').textContent = `Nước ${g.ply}/${g.maxPlies} • đích của bạn: ${g.goals[g.color]}${g.repetitions > 1 ? ` • thế cờ lặp ${g.repetitions}/3` : ''}`;
    $('#moves').innerHTML = g.history.map((m, i) => `<li><span class="dot ${m.side}"></span>${i + 1}. ${B.TYPE_ICON[m.type]} ${m.from}→${m.to}${m.capture ? ` ✖${B.TYPE_ICON[m.capture]}` : ''}</li>`).join('');
    const ml = $('#moves'); ml.scrollTop = ml.scrollHeight;
    if (g.end) {
      const title = { W: '🏆 Bạn thắng', L: 'Bot mẫu thắng', D: '🤝 Hòa' }[g.result];
      const why = B.REASON_VI[g.end.reason] || g.end.reason;
      $('#endbox').innerHTML = `<div class="notice ${g.result === 'W' ? 'ok' : g.result === 'L' ? 'bad' : ''}" style="margin-bottom:10px">
        <b>${title}</b> — ${esc(g.end.winner ? `${B.SIDE_VI[g.end.winner]} thắng vì ${why}` : why)}.
        <div class="row" style="margin-top:8px"><button class="btn sm primary" id="again">↻ Ván mới</button></div></div>`;
      $('#quit').classList.add('hidden');
      on($('#again'), 'click', () => humanPane(pane));
    }
  };

  $('#bd').addEventListener('click', async (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || g.end || busy || g.toMove !== g.color) return;
    const s = cell.dataset.sq;
    const target = g.legal.find((m) => m.from === selected && m.to === s);
    if (target) {
      busy = true;
      try {
        g = await api(`/play/${g.id}`, { method: 'POST', body: { from: target.from, to: target.to } });
        selected = null;
      } catch (err) { toast(err.message, true); } finally { busy = false; }
      return draw();
    }
    const p = g.pieces[s];
    selected = p && p.side === g.color && g.legal.some((m) => m.from === s) ? s : null;
    if (p && p.side === g.color && !selected) toast('Quân này đang bị chặn, không có nước đi');
    draw();
  });
  on($('#quit'), 'click', async () => {
    if (!confirm('Bỏ ván này?')) return;
    await api(`/play/${g.id}`, { method: 'DELETE' });
    humanPane(pane);
  });
  draw();
}

async function practicePane(pane) {
  if (!state.me.team) {
    pane.innerHTML = '<div class="card"><p>Cần có đội và một bản bot hợp lệ để chạy thử.</p><a class="btn primary" href="#/doi">Lập hoặc tham gia đội</a></div>';
    return;
  }
  const draw = async () => {
    const [p, b] = await Promise.all([api('/practice'), api('/bots')]);
    const valid = b.submissions.filter((s) => s.status === 'valid');
    const active = p.matches.some((m) => m.status === 'queued' || m.status === 'running');
    pane.innerHTML = `<div class="grid g2">
      <div class="card"><h2>Gửi trận chạy thử</h2>
        ${valid.length ? `<form id="pf">
          <div class="field"><label for="sv">Phiên bản bot</label><select id="sv" name="submissionId">${valid.map((s) => `<option value="${s.id}" ${s.id === b.official ? 'selected' : ''}>v${s.version}${s.id === b.official ? ' (bản thi)' : ''}</option>`).join('')}</select></div>
          <div class="field"><label for="sb2">Bot mẫu</label><select id="sb2" name="sampleBot">${Object.entries(p.sampleBots).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <button class="btn primary" ${active ? 'disabled' : ''}>▶ Chạy thử</button>
          <span class="muted small">Đã dùng ${p.used}/${p.limit} trận hôm nay • hàng đợi: ${b.queue.queued.official} thi chính thức, ${b.queue.queued.practice} chạy thử</span>
        </form>` : '<p>Chưa có bản hợp lệ. <a href="#/bot">Nộp bot</a> trước.</p>'}
        <p class="muted small" style="margin-top:12px">Trận chạy thử dùng đúng luật và quyền dữ liệu của giai đoạn bot sẽ thi. Mỗi đội chạy 1 trận một lúc.</p>
      </div>
      <div class="card"><h2>Lịch sử chạy thử</h2>
        ${p.matches.length ? `<div class="table-wrap"><table><thead><tr><th>Bản</th><th>Bot mẫu</th><th>Tỉ số</th><th></th></tr></thead><tbody>
          ${p.matches.map((m) => `<tr><td>v${m.version}</td><td>${esc(p.sampleBots[m.sample_bot])}</td>
            <td>${m.status === 'done' ? `<b>${m.wins_a}</b> - ${m.wins_b} <span class="muted small">(hòa ${m.draws})</span>` : badge(m.status)}</td>
            <td class="right"><a class="btn sm" href="#/tran/${m.id}">Chi tiết</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa có trận nào.</p>'}
      </div></div>`;
    on($('#pf'), 'submit', async (e) => {
      await api('/practice', { method: 'POST', body: formData(e.target) }); toast('Đã đưa vào hàng đợi'); draw();
    });
    if (active) { const tm = setTimeout(draw, 1500); cleanups.push(() => clearTimeout(tm)); }
  };
  await draw();
}

// ============================================================ chi tiết trận

route(/^\/tran\/(\d+)$/, async (root, id) => {
  const m = await api(`/matches/${id}`);
  const B = window.BoardUI;
  const flip = m.side === 'b';
  const left = flip ? m.nameB : m.nameA, right = flip ? m.nameA : m.nameB;
  const wl = flip ? m.winsB : m.winsA, wr = flip ? m.winsA : m.winsB;
  const verdict = m.status !== 'done' ? badge(m.status) : m.result === 'draw' ? '<span class="badge">Hòa trận</span>'
    : `<span class="badge ok">${esc(m.result === 'a' ? m.nameA : m.nameB)} thắng trận</span>`;
  const decided = { extra: `sau ${m.extraGames} ván đấu phụ`, lot: 'bằng bốc thăm có ghi nhận (seed trận) sau đấu phụ' }[m.decidedBy];
  const nameOf = (x) => (x === 'a' ? m.nameA : m.nameB);
  const gameTitle = (g, i) => {
    const blueName = nameOf(g.blue), pinkName = nameOf(g.blue === 'a' ? 'b' : 'a');
    const res = g.result === 'draw' ? 'Hòa' : `${esc(nameOf(g.result))} thắng`;
    return `Ván ${i + 1}: <span class="dot blue"></span>${esc(blueName)} vs <span class="dot pink"></span>${esc(pinkName)} — <b>${res}</b>
      <span class="muted small">(${esc(B.REASON_VI[g.reason] || g.reason)}, ${g.plies} nước, còn ${g.pieces.blue}–${g.pieces.pink} quân)</span>`;
  };
  const log = m.myLog;
  root.innerHTML = `<div class="card">
    <p class="muted small">${m.kind === 'practice' ? 'Chạy thử (không tính điểm)' : `${esc(PHASE_VI[m.phase] || '')} ${m.kind === 'knockout' ? `• trận ${m.game}` : m.kind === 'tiebreak' ? '• tranh suất' : `• vòng ${m.round}`}`}
      • luật: ${esc(m.ruleset.name)} ${m.confirmed ? '• <span class="badge ok">Đã xác nhận</span>' : m.kind !== 'practice' && m.status === 'done' ? '• <span class="badge warn">Kết quả tạm</span>' : ''}</p>
    <div class="scoreboard"><div class="side you"><b>${esc(left)}</b><div class="num">${wl ?? '–'}</div><div class="small muted">ván thắng</div></div>
      <div>${verdict}<div class="muted small">Hòa ${m.draws ?? '–'} ván</div></div>
      <div class="side bot"><b>${esc(right)}</b><div class="num">${wr ?? '–'}</div><div class="small muted">ván thắng</div></div></div>
    ${decided ? `<p class="small" style="margin-top:12px;text-align:center">Phân định ${decided}.</p>` : ''}
  </div>
  <div class="card"><h2>Diễn biến</h2><div id="games">${m.games ? '' : '<p class="muted">Trận chưa chạy xong.</p>'}</div></div>
  ${log != null ? `<div class="card"><h2>Log bot của bạn</h2><pre>${esc(log || '(trống)')}</pre></div>` : ''}
  ${m.logA != null && m.runs ? `<div class="card"><h2>Quản trị: log &amp; lần chạy</h2><p class="small">Seed ${m.seed}</p>
    <div class="table-wrap"><table><thead><tr><th>Lần</th><th>Trạng thái</th><th>Worker</th><th>Bắt đầu</th><th>Lỗi</th></tr></thead><tbody>
    ${m.runs.map((r) => `<tr><td>${r.attempt}</td><td>${esc(r.status)}</td><td class="small">${esc(r.worker || '')}</td><td class="small">${fmtTime(r.started_at)}</td><td class="small">${esc(r.error || '')}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid g2" style="margin-top:12px"><div><h3>${esc(m.nameA)}</h3><pre>${esc(m.logA || '(trống)')}</pre></div><div><h3>${esc(m.nameB)}</h3><pre>${esc(m.logB || '(trống)')}</pre></div></div></div>` : ''}`;

  if (m.games) {
    const box = $('#games');
    if (!m.games[0] || !m.games[0].moves) {
      box.innerHTML = `<p class="muted">${esc(m.hiddenNote || '')}</p><ul>${m.games.map((g, i) => `<li>${gameTitle(g, i)}</li>`).join('')}</ul>`;
    } else {
      box.innerHTML = `<div class="gametabs">${m.games.map((g, i) => `<button class="btn sm" data-g="${i}">Ván ${i + 1}</button>`).join('')}</div><div id="rp"></div>`;
      let stop = null;
      const show = (i) => {
        if (stop) stop();
        $$('[data-g]', box).forEach((b) => b.classList.toggle('primary', Number(b.dataset.g) === i));
        const g = m.games[i];
        const labels = { blue: nameOf(g.blue), pink: nameOf(g.blue === 'a' ? 'b' : 'a') };
        stop = window.BoardUI.replayer($('#rp'), { setup: m.setup, goals: m.goals, moves: g.moves, labels, header: `<p>${gameTitle(g, i)}</p>` });
      };
      $$('[data-g]', box).forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.g))));
      cleanups.push(() => stop && stop());
      show(0);
    }
  }
  if (m.status !== 'done') every(2000, async () => { const n = await api(`/matches/${id}`); if (n.status === 'done') render(); });
});

// ============================================================ xếp hạng

route(/^\/xep-hang$/, async (root) => {
  const show = async (tab) => {
    cleanups.forEach((f) => f()); cleanups = [];
    root.innerHTML = '<h1>Bảng xếp hạng</h1><div id="pane"></div>';
    root.insertBefore(tabs('rank', { swiss: 'Sơ loại Swiss', bracket: 'Vòng chính', prizes: 'Giải thưởng' }, tab, show), $('#pane'));
    const pane = $('#pane');
    if (tab === 'bracket') return bracketPane(pane);
    if (tab === 'prizes') return prizesPane(pane);
    await swissPane(pane);
    every(10000, () => swissPane(pane));
  };
  await show(savedTab('rank', 'swiss'));
});

async function swissPane(pane) {
  const s = await api('/standings');
  const myId = state.me.team && state.me.team.id;
  const q = s.qualified ? new Set(s.qualified) : null;
  pane.innerHTML = `<div class="card">
    <div class="card-head"><div><b>Vòng ${s.round}/${s.totalRounds}</b> <span class="muted small">• cập nhật mỗi 10 giây</span></div>
      ${s.provisional ? '<span class="badge warn">Có kết quả tạm, chờ xác nhận</span>' : s.round ? '<span class="badge ok">Đã xác nhận</span>' : ''}</div>
    ${s.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Hạng</th><th>Đội</th><th class="right">Điểm</th><th class="right" title="Điểm trung bình cuối sơ loại của các đối thủ đã gặp">ĐTB đối thủ</th>
      <th class="right" title="Tổng lượt thắng trừ lượt thua">Hiệu số</th><th class="right">T-H-B</th><th class="right">Bye</th>${q ? '<th></th>' : ''}</tr></thead><tbody>
      ${s.rows.map((r, i) => `<tr class="${r.teamId === myId ? 'me' : ''} ${i === 31 && s.rows.length > 32 ? 'cut' : ''}">
        <td>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td><td class="nowrap"><b>${esc(r.name)}</b></td><td class="right"><b>${r.points}</b></td>
        <td class="right">${r.oppAvg.toFixed(2)}</td><td class="right">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="right nowrap">${r.w}-${r.d}-${r.l}</td><td class="right">${r.byes || ''}</td>
        ${q ? `<td>${q.has(r.teamId) ? '<span class="badge ok">Vòng chính</span>' : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Sơ loại chưa bắt đầu.</p>'}
    <div class="notice" style="margin-top:16px">🏆 <b>Top 32 vào vòng chính.</b> Đường gạch cam là ranh giới vị trí 32. Thứ tự xét: điểm → ĐTB đối thủ → hiệu số.
      Các đội bằng hoàn toàn có cùng hạng; nếu nhóm đó vắt qua ranh giới thì đấu tranh suất.</div>
    ${s.cut && s.cut.history.length ? `<div class="card" style="margin-top:16px"><h3>Tranh suất ở ranh giới</h3>
      ${s.cut.history.map((h) => `<p>Bước ${h.step} (${h.mode === 'knockout' ? 'loại trực tiếp rút gọn' : 'vòng thêm trong nhóm'}): ${h.pairs.length} trận, ${h.free.length} đội miễn đấu ${h.applied ? '<span class="badge ok">xong</span>' : '<span class="badge warn">đang đấu</span>'}</p>`).join('')}</div>` : ''}
  </div>`;
}

async function bracketPane(pane) {
  const b = await api('/bracket');
  if (!b[0].series.length) { pane.innerHTML = '<div class="card"><p class="muted">Nhánh đấu được lập sau khi chốt Top 32.</p></div>'; return; }
  const team = (s, side) => {
    const name = s[`name_${side}`], seed = s[`seed_${side}`], id = s[`team_${side}`];
    const wins = s.games.filter((g) => g.result === side).length;
    return `<div class="${s.winner != null && s.winner === id ? 'win' : ''}"><span>${seed ? `<span class="seed">${seed}</span>` : ''}${name ? esc(name) : '<span class="muted">—</span>'}</span><span>${s.games.length ? wins : ''}</span></div>`;
  };
  pane.innerHTML = `<div class="card"><div class="bracket">${b.map((p) => `<div class="col"><h3>${esc(p.title)} ${p.bestOf > 1 ? `<span class="muted">(${p.playAll ? `đủ ${p.bestOf} trận` : `BO${p.bestOf}`})</span>` : ''}</h3>
    ${p.series.length ? p.series.map((s) => `<div class="pair">${team(s, 'a')}${team(s, 'b')}
      ${s.games.length ? `<div class="small">${s.games.map((g) => `<a href="#/tran/${g.id}">T${g.game_no}${g.status === 'done' ? ` ${g.wins_a}-${g.wins_b}${g.decided_by === 'lot' ? '*' : ''}` : ''}</a>`).join(' ')}</div>` : ''}</div>`).join('') : '<p class="muted small">Chờ vòng trước</p>'}</div>`).join('')}</div>
    <p class="muted small">Số bên trái là hạt giống theo xếp hạng Swiss. * = phân định bằng bốc thăm sau đấu phụ.</p></div>`;
}

async function prizesPane(pane) {
  const p = await api('/prizes');
  pane.innerHTML = `<div class="card"><div class="card-head"><h2>Tiền thưởng theo đội (cộng dồn)</h2><b>${money(p.total)} / ${money(19000000)}</b></div>
    ${p.list.length ? `<div class="table-wrap"><table><thead><tr><th>Đội</th><th>Hạng mục</th><th class="right">Tổng</th></tr></thead><tbody>
    ${p.list.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td class="small">${t.items.map((i) => `${esc(i.title)} (${money(i.amount)})`).join(' + ')}</td><td class="right"><b>${money(t.total)}</b></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Giải thưởng được ghi nhận khi các vòng kết thúc.</p>'}</div>`;
}

// ============================================================ chung kết

route(/^\/chung-ket$/, async (root) => {
  const f = await api('/final');
  const skew = Date.parse(f.serverTime) - Date.now(); // đếm giờ theo máy chủ
  const statusText = { none: 'Chưa thiết lập', draft: 'Chuẩn bị', running: 'Đang diễn ra', ended: 'Đã hết giờ' }[f.status];
  const rs = f.ruleset;
  root.innerHTML = `
  <div class="card" style="text-align:center">
    <p class="muted small" style="margin:0">PHÒNG CHUNG KẾT • ${esc(statusText)}</p>
    <h1>${f.teams.length ? f.teams.map(esc).join(' <span class="muted">vs</span> ') : 'Chung kết đổi luật'}</h1>
    ${f.status === 'running' ? '<div class="countdown" id="cd">--:--</div><p class="muted small">Thời gian theo đồng hồ máy chủ</p>' : ''}
    ${f.status === 'draft' || f.status === 'none' ? `<p class="muted">Luật mới và dữ liệu được phát cho hai đội khi phiên bắt đầu. Thời lượng dự kiến ${f.durationMin || '60-90'} phút.</p>` : ''}
    <div class="notice warn" style="text-align:left;margin-top:12px">Trong phiên: tự sửa hàm <code>make_move</code>, <b>không dùng AI hoặc hỗ trợ bên ngoài</b>.
      Sau giờ: kiểm thử, giải thích phần sửa, khóa bản và cho bot đấu. Không can thiệp khi trận đang chạy.</div>
  </div>
  ${rs ? `<div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Luật mới: ${esc(rs.name)}</h2><p>${esc(rs.description || '')}</p>
      <div class="table-wrap"><table><thead><tr><th>Quân</th><th>Ăn được</th></tr></thead><tbody>
      ${rs.moves.map((m) => `<tr><td>${window.BoardUI.TYPE_ICON[m]} <b>${window.BoardUI.TYPE_VI[m]}</b></td><td>${(rs.beats[m] || []).map((x) => `${window.BoardUI.TYPE_ICON[x]} ${window.BoardUI.TYPE_VI[x]}`).join(', ') || '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="small" style="margin-top:12px">Thế cờ ban đầu, ô đích, giới hạn nước giữ nguyên. Diễn biến các trận chung kết ${f.reveal ? '<b>được công khai</b>' : 'chỉ hai đội xem được'}.</p>
      ${f.briefing ? `<h3>Ghi chú của ban tổ chức</h3><p>${esc(f.briefing)}</p>` : ''}</div>
    <div class="card"><h2>Dữ liệu trận lịch sử</h2>
      ${f.data ? `<p class="small muted">${esc(f.data.source)}. ${esc(f.data.note)}</p>
        <ul>${f.data.games.map((g, i) => `<li>Ván ${i + 1}: bên ${g.blue.toUpperCase()} cầm Xanh — <b>${g.result}</b>
          <span class="small muted">(${esc(window.BoardUI.REASON_VI[g.reason] || g.reason)}, ${g.plies} nước, còn ${g.pieces.blue}–${g.pieces.pink} quân)</span>
          ${g.moves ? `<button class="btn sm" data-fg="${i}">Xem lại</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Không có dữ liệu lịch sử.</p>'}</div>
  </div>
  <div class="card hidden" id="frp" style="margin-top:16px"></div>` : ''}
  ${f.finalist ? `<div class="card" style="margin-top:16px"><h2>Nộp bot chung kết</h2>
    ${f.status === 'running' ? `<form id="ff"><textarea name="code" class="mono" rows="14" placeholder="def make_move(state): ..."></textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary">Nộp bản chung kết</button><label class="btn">Hoặc chọn tệp<input type="file" id="ffile" accept=".py" class="hidden"></label></div></form>`
      : '<p class="muted">Chỉ nộp được khi phiên đang diễn ra.</p>'}
    ${f.submissions.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Bản</th><th>Thời gian (máy chủ)</th><th>Trạng thái</th></tr></thead><tbody>
      ${f.submissions.map((s) => `<tr${s.id === f.official ? ' class="me"' : ''}><td>v${s.version}</td><td>${fmtTime(s.created_at)}</td><td>${badge(s.status)}${s.id === f.official ? ' <span class="badge info">Bản thi</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <p class="muted small" style="margin-top:8px">Bản hợp lệ mới nhất trở thành bản thi chung kết; đội trưởng có thể đổi ở <a href="#/bot">Bot của tôi</a> trước khi hết giờ.</p></div>` : ''}`;
  if (f.status === 'running') {
    const end = Date.parse(f.endsAt);
    const tick = () => {
      const left = Math.max(0, end - (Date.now() + skew));
      const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
      const el = $('#cd');
      if (el) el.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      if (!left) render();
    };
    tick();
    every(1000, tick);
  }
  const submitFinal = async (filename, code) => { await api('/bots', { method: 'POST', body: { filename, code } }); toast('Đã nộp, đang kiểm thử với luật mới…'); setTimeout(render, 2500); };
  on($('#ff'), 'submit', (e) => submitFinal('final.py', e.target.code.value));
  on($('#ffile'), 'change', async (e) => { const fl = e.target.files[0]; if (fl) await submitFinal(fl.name, await fl.text()); });
  $$('[data-fg]').forEach((b) => b.addEventListener('click', () => {
    const g = f.data.games[Number(b.dataset.fg)];
    $('#frp').classList.remove('hidden');
    const stop = window.BoardUI.replayer($('#frp'), { setup: f.setup, goals: f.goals, moves: g.moves, labels: { blue: `Bên ${g.blue.toUpperCase()}`, pink: `Bên ${g.blue === 'a' ? 'B' : 'A'}` },
      header: `<h3>Ván ${Number(b.dataset.fg) + 1} của trận lịch sử (luật cũ)</h3>` });
    cleanups.push(stop);
    $('#frp').scrollIntoView({ behavior: 'smooth' });
  }));
  if (f.status === 'draft' || f.status === 'none') every(5000, async () => { const n = await api('/final'); if (n.status !== f.status) render(); });
});

// ============================================================ thành tích & xác minh

route(/^\/thanh-tich$/, async (root) => {
  const me = state.me.user ? await api('/me') : { user: null };
  const prizes = await api('/prizes');
  const mine = me.team && prizes.list.find((p) => p.teamId === me.team.id);
  root.innerHTML = `<div class="grid g2">
    <div class="card"><h1>Thành tích của tôi</h1>
      ${!me.user ? '<p><a href="#/dang-nhap">Đăng nhập</a> để xem thành tích.</p>'
        : !me.team ? '<p class="muted">Bạn chưa thuộc đội nào.</p>'
        : `<p>Đội <b>${esc(me.team.name)}</b>: ${me.team.achievement ? `<span class="badge ok">${esc(me.team.achievement)}</span>` : '<span class="badge">Chưa hoàn thành sơ loại</span>'}</p>
           ${mine ? `<p>Tiền thưởng của đội: <b>${money(mine.total)}</b> <span class="small muted">(${mine.items.map((i) => esc(i.title)).join(', ')})</span></p>` : ''}
           ${me.certificate ? `<div class="notice ok">📜 Chứng nhận đã cấp: <a href="#/xac-minh/${esc(me.certificate.code)}"><b class="mono">${esc(me.certificate.code)}</b></a><br>
             <span class="small">Dán đường dẫn xác minh vào CV: <span class="mono">${esc(location.origin)}/#/xac-minh/${esc(me.certificate.code)}</span></span></div>`
             : '<p class="muted small">Chứng nhận được cấp sau sơ loại cho thành viên đội có bot hợp lệ và thi xong Swiss.</p>'}`}
    </div>
    <div class="card"><h2>Xác minh chứng nhận</h2><p class="muted">Nhà tuyển dụng hoặc nhà trường nhập mã in trên chứng nhận.</p>
      <form id="vf" class="row"><input name="code" placeholder="BA-XXXXX-XXXXX" style="flex:1;min-width:180px" required><button class="btn primary">Xác minh</button></form></div>
  </div>`;
  on($('#vf'), 'submit', (e) => { location.hash = `#/xac-minh/${encodeURIComponent(e.target.code.value.trim().toUpperCase())}`; });
});

route(/^\/xac-minh\/([A-Za-z0-9-]+)$/, async (root, code) => {
  let c;
  try { c = await api(`/verify/${code}`); } catch {
    root.innerHTML = `<div class="card"><h2>❌ Không tìm thấy chứng nhận</h2><p>Mã <span class="mono">${esc(code)}</span> không tồn tại trong hệ thống.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="no-print notice ${c.revoked ? 'bad' : 'ok'}" style="max-width:760px;margin:0 auto 16px">
      ${c.revoked ? '⚠ Chứng nhận này đã bị thu hồi.' : '✅ Chứng nhận hợp lệ, được xác minh bởi hệ thống BOT ARENA.'}
      <button class="btn sm" id="print" style="float:right">In / lưu PDF</button></div>
    <div class="cert">
      <p class="muted" style="letter-spacing:.1em">CHỨNG NHẬN</p>
      <h1>${esc(c.competition)}</h1>
      <p>Chứng nhận sinh viên</p>
      <div class="name">${esc(c.member)}</div>
      <p>thành viên đội <b>${esc(c.team)}</b></p>
      <p class="ach">${esc(c.achievement)}</p>
      ${c.awards.length ? `<p>Giải thưởng: <b>${c.awards.map(esc).join(', ')}</b></p>` : ''}
      <p class="muted small" style="margin-top:24px">${esc(c.organizer)} • Cấp ngày ${new Date(c.issuedAt).toLocaleDateString('vi-VN')}</p>
      <p class="mono small">Mã xác minh: ${esc(c.code)}<br>${esc(location.origin)}/#/xac-minh/${esc(c.code)}</p>
    </div>`;
  on($('#print'), 'click', () => window.print());
});

// ============================================================ hỗ trợ

route(/^\/ho-tro$/, async (root) => {
  if (needLogin(root)) return;
  const list = await api('/tickets');
  root.innerHTML = `<div class="grid g2">
    <div class="card"><h1>Hỗ trợ &amp; khiếu nại</h1><p class="muted">Báo lỗi bot, hỏi luật hoặc khiếu nại kết quả trận (ghi mã trận nếu có).</p>
      <form id="tf"><div class="field"><label for="ts">Tiêu đề</label><input id="ts" name="subject" required maxlength="120"></div>
      <div class="field"><label for="tm">Mã trận (không bắt buộc)</label><input id="tm" name="matchId" inputmode="numeric"></div>
      <div class="field"><label for="tb">Nội dung</label><textarea id="tb" name="body" required></textarea></div><button class="btn primary">Gửi</button></form></div>
    <div class="card"><h2>Yêu cầu đã gửi</h2>
      ${list.length ? list.map((t) => `<div style="border-bottom:1px solid var(--border);padding:10px 0"><div class="row"><b>${esc(t.subject)}</b>${badge(t.status)}<span class="spacer"></span><span class="muted small">${fmtTime(t.created_at)}</span></div>
        <p class="small">${esc(t.body)}</p>${t.reply ? `<div class="notice small"><b>Ban tổ chức:</b> ${esc(t.reply)}</div>` : ''}</div>`).join('') : '<p class="muted">Chưa có yêu cầu.</p>'}</div></div>`;
  on($('#tf'), 'submit', async (e) => { await api('/tickets', { method: 'POST', body: formData(e.target) }); toast('Đã gửi'); render(); });
});

// ============================================================ khởi động

window.Arena = { api, esc, toast, on, route, render, tabs, savedTab, badge, money, fmtTime, formData, state, every, PHASE_VI, $, $$, get cleanups() { return cleanups; }, set cleanups(v) { cleanups = v; } };
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', async () => {
  try { await refreshMe(); } catch { /* chưa đăng nhập */ }
  render();
});
