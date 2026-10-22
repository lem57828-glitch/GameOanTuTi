/* BOT ARENA — lõi giao diện dùng chung (không có nghiệp vụ module).
 * Cung cấp cho các module qua window.Arena:
 *   page({ path, title, nav?, roles?, owner, render })  đăng ký một trang. path là RegExp hoặc chuỗi '/doi'.
 *     roles: ['guest','student','referee','admin'] — ai thấy mục menu (mặc định mọi người). Kiểm tra quyền thật nằm ở máy chủ.
 *     render(root, params, ctx) — vẽ trang; ctx.cleanup(fn) đăng ký hàm dọn dẹp khi rời trang (interval, listener).
 *   api(path, { method, body })  gọi API, ném Error(message) kèm .code/.status theo chuẩn lỗi của máy chủ.
 *   esc, $, $$, on, toast, fmtTime, badge, state (người dùng hiện tại), placeholder(...)  tiện ích.
 */
'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || `Lỗi ${res.status}`);
      err.code = data.error && data.error.code;
      err.status = res.status;
      throw err;
    }
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

  /** Gắn sự kiện; tự khóa nút khi đang xử lý và báo lỗi bằng toast. */
  function on(el, event, fn) {
    if (!el) return;
    el.addEventListener(event, async (e) => {
      if (event === 'submit') e.preventDefault();
      const btn = e.submitter || (el.tagName === 'BUTTON' ? el : null);
      if (btn) btn.disabled = true;
      try { await fn(e); } catch (err) { toast(err.message, true); } finally { if (btn) btn.disabled = false; }
    });
  }

  // ------------------------------------------------------------ đăng ký trang & định tuyến
  const pages = [];
  const state = { user: null, modules: [], devLogin: false };
  let cleanups = [];

  function page(def) {
    const re = def.path instanceof RegExp ? def.path : new RegExp(`^${def.path.replace(/:[a-z]+/gi, '([^/]+)')}$`);
    pages.push({ ...def, re });
  }

  const roleOf = () => (state.user ? state.user.role : 'guest');

  async function render() {
    cleanups.forEach((f) => { try { f(); } catch { /* bỏ qua */ } });
    cleanups = [];
    const path = location.hash.replace(/^#/, '') || '/';
    renderNav(path);
    const root = $('#app');
    const p = pages.find((x) => x.re.test(path));
    if (!p) { root.innerHTML = '<div class="card"><h2>Không tìm thấy trang</h2><a href="#/">Về trang chủ</a></div>'; return; }
    try {
      await p.render(root, path.match(p.re).slice(1).map(decodeURIComponent), { cleanup: (fn) => cleanups.push(fn) });
    } catch (e) {
      root.innerHTML = `<div class="card"><h2>Không tải được trang</h2><p class="muted">${esc(e.message)}</p></div>`;
    }
    window.scrollTo(0, 0);
  }

  function renderNav(path) {
    const role = roleOf();
    $('#nav').innerHTML = pages.filter((p) => p.nav && (!p.roles || p.roles.includes(role))).map((p) => {
      const href = p.navHref || p.path;
      const active = href === '/' ? path === '/' : path.startsWith(href);
      return `<a href="#${href}" class="${active ? 'active' : ''}">${esc(p.nav)}</a>`;
    }).join('');
    const u = state.user;
    $('#userbox').innerHTML = u
      ? `<span class="avatar" title="${esc(u.email)}">${esc(u.display_name[0].toUpperCase())}</span>
         <span class="small">${esc(u.display_name)} ${u.role !== 'student' ? badge(u.role, 'info') : ''}</span>
         <button class="btn sm" id="logout">Thoát</button>`
      : `<a class="btn sm" href="#/dang-nhap">Đăng nhập</a>${state.devLogin ? '<a class="btn sm primary" href="#/dev">Đăng nhập giả lập</a>' : ''}`;
    on($('#logout'), 'click', async () => { await api('/session', { method: 'DELETE' }); await refresh(); location.hash = '#/'; });
  }

  async function refresh() {
    const [s, m] = await Promise.all([api('/session'), api('/modules')]);
    state.user = s.user;
    state.modules = m.modules;
    state.devLogin = m.devLogin;
  }

  /**
   * Trang giữ chỗ cho chức năng chưa làm: ghi người phụ trách, việc cần làm và trạng thái các API liên quan.
   * Người phụ trách thay hàm render của trang bằng giao diện thật.
   */
  function placeholder({ owner, title, intro, tasks = [], apis = [] }) {
    const mod = state.modules.find((m) => m.owner === owner);
    const routes = mod ? mod.routes.filter((r) => apis.some((a) => r.path.startsWith(a))) : [];
    return `<div class="card">
      <div class="card-head"><h1 style="margin:0">${esc(title)}</h1>${badge(`Phụ trách: ${owner}`, 'accent')}</div>
      ${intro ? `<p>${intro}</p>` : ''}
      <div class="notice warn">Trang giữ chỗ trong khung xây lại. ${esc(owner)} thay nội dung trang này trong <code>web/modules/${esc(mod ? mod.name : '')}.js</code>.</div>
      ${tasks.length ? `<h3 style="margin-top:16px">Việc cần làm</h3><ul>${tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${routes.length ? `<h3>API liên quan</h3><div class="table-wrap"><table><tbody>${routes.map((r) => `<tr><td class="mono small">${r.method}</td>
        <td class="mono small">${esc(r.path)}</td><td class="small">${esc(r.desc)}</td><td>${r.done ? badge('đã có', 'ok') : badge('chưa làm', 'warn')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------ trang của lõi

  // Trang chủ tạm thời = bảng tiến độ dự án. TV1 thay bằng trang chủ giới thiệu giải (mục 9.1), giữ bảng này ở #/tien-do.
  async function dashboard(root) {
    const { modules } = await api('/modules');
    const total = modules.reduce((n, m) => n + m.routes.length, 0);
    const done = modules.reduce((n, m) => n + m.routes.filter((r) => r.done).length, 0);
    root.innerHTML = `<div class="card">
      <h1>Tiến độ xây lại BOT ARENA</h1>
      <p class="muted">Bảng này tự đọc từ bảng API của 4 module: API có <code>handler</code> là đã làm, còn lại máy chủ trả <code>501 Chưa làm (TVx)</code>.</p>
      <p><b>${done}/${total}</b> API đã có handler.</p>
      <div class="grid g2">${modules.map((m) => {
        const d = m.routes.filter((r) => r.done).length;
        return `<div class="card"><div class="card-head"><h2 style="margin:0">${esc(m.owner)} · ${esc(m.title)}</h2>${badge(`${d}/${m.routes.length}`, d === m.routes.length ? 'ok' : 'warn')}</div>
          <p class="small muted">Module <code>${esc(m.name)}</code> — xem <code>server/modules/${esc(m.name)}/README.md</code></p>
          <details><summary>Danh sách API</summary><div class="table-wrap"><table><tbody>${m.routes.map((r) => `<tr><td class="mono small">${r.method}</td>
            <td class="mono small">${esc(r.path)}</td><td class="small">${esc(r.auth)}</td><td>${r.done ? badge('đã có', 'ok') : badge('chưa làm', 'warn')}</td></tr>`).join('')}</tbody></table></div></details></div>`;
      }).join('')}</div>
      <h2 style="margin-top:20px">Các mốc (đặc tả mục 9.6)</h2>
      <ol>
        <li><b>M0 — Chốt nền:</b> chốt các quyết định Q01–Q12 (<code>docs/DECISIONS.md</code>), lược đồ, hợp đồng API/sự kiện (<code>docs/CONTRACTS.md</code>).</li>
        <li><b>M1 — Luồng tối thiểu:</b> đội thật → bot thật → hiệp thật → hiển thị kết quả.</li>
        <li><b>M2 — Đủ phạm vi:</b> sơ loại nhiều mức → Top 32 → cây → trận 5+2 hiệp → Top 4; thông báo, khiếu nại.</li>
        <li><b>M3 — Ổn định:</b> test lỗi/reconnect/tải, backup/restore, staging; checklist nghiệm thu mục 11.</li>
      </ol>
    </div>`;
  }

  async function devLogin(root) {
    if (!state.devLogin) { root.innerHTML = '<div class="card"><h2>Đăng nhập giả lập đang tắt</h2></div>'; return; }
    const users = await api('/dev/users');
    root.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">
      <h1>Đăng nhập giả lập</h1>
      <p class="muted">Chỉ dùng khi phát triển, để TV2–TV4 làm việc khi chức năng đăng nhập của TV1 chưa xong. Luôn tắt khi production.</p>
      ${users.length ? `<div class="table-wrap"><table><tbody>${users.map((u) => `<tr><td><b>${esc(u.display_name)}</b><div class="muted small">${esc(u.username)}</div></td>
        <td>${badge(u.role, u.role === 'student' ? '' : 'info')}</td><td class="right"><button class="btn sm primary" data-uid="${u.id}">Đăng nhập</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p>Chưa có tài khoản nào. Chạy <code>npm run seed</code> để tạo dữ liệu mẫu.</p>'}
    </div>`;
    $$('[data-uid]').forEach((b) => on(b, 'click', async () => {
      await api('/dev/login', { method: 'POST', body: { userId: Number(b.dataset.uid) } });
      await refresh();
      location.hash = '#/';
    }));
  }

  page({ path: '/', nav: 'Tiến độ', title: 'Tiến độ', owner: 'chung', render: dashboard });
  page({ path: '/tien-do', title: 'Tiến độ', owner: 'chung', render: dashboard });
  page({ path: '/dev', title: 'Đăng nhập giả lập', owner: 'chung', render: devLogin });

  async function start() {
    try { await refresh(); } catch (e) { toast(`Không kết nối được máy chủ: ${e.message}`, true); }
    window.addEventListener('hashchange', render);
    render();
  }

  window.Arena = { page, api, esc, $, $$, on, toast, fmtTime, badge, state, placeholder, refresh, render, start };
})();
