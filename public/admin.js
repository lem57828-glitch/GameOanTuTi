/* BOT ARENA - trang quản trị. Mọi quyền được kiểm tra lại ở máy chủ. */
'use strict';
(() => {
  const { api, esc, toast, on, route, render, tabs, savedTab, badge, money, fmtTime, formData, state, every, PHASE_VI, $, $$ } = window.Arena;
  const post = (path, body) => api(`/admin${path}`, { method: 'POST', body: body || {} });
  const act = (sel, fn, msg) => $$(sel).forEach((b) => on(b, 'click', async () => {
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    await fn(b);
    if (msg) toast(msg);
    render();
  }));

  route(/^\/quan-tri(?:\/([a-z]+))?$/, async (root, initialTab) => {
    if (!state.me.user || state.me.user.role !== 'admin') {
      root.innerHTML = '<div class="card"><h2>Chỉ dành cho quản trị viên</h2></div>';
      return;
    }
    const names = { ops: 'Điều hành', matches: 'Trận đấu', teams: 'Đội', final: 'Chung kết', awards: 'Thưởng & chứng nhận', support: 'Thông báo & hỗ trợ', audit: 'Nhật ký' };
    const validTab = (t) => (t && names[t] ? t : null);
    const show = async (tab) => {
      window.Arena.cleanups.forEach((f) => f()); window.Arena.cleanups = [];
      root.innerHTML = '<h1>Quản trị giải đấu — Ban Tổ Chức</h1><div id="pane"></div>';
      root.insertBefore(tabs('admin', names, tab, (newTab) => {
        location.hash = `#/quan-tri/${newTab}`;
      }), $('#pane'));
      await PANES[tab]($('#pane'));
    };
    await show(validTab(initialTab) || savedTab('admin', 'ops'));
  });

  const PANES = {
    async ops(pane) {
      const o = await api('/admin/overview');
      const s = o.settings;
      const phase = Object.fromEntries(o.phases.map((p) => [p.key, p]));
      const swiss = phase.swiss;
      const total = Number(s.swiss_rounds);
      const lastRound = o.rounds[o.rounds.length - 1];
      const canNext = swiss.status !== 'pending' && swiss.status !== 'done' && o.swissRound < total && (!lastRound || lastRound.confirmed);
      const canFinish = swiss.status === 'running' && o.swissRound >= total && o.rounds.every((r) => r.confirmed);
      const ko = ['r32', 'r16', 'qf', 'sf'];
      const ready = (k) => {
        const i = ['swiss', ...ko, 'final'].indexOf(k);
        const prev = ['swiss', ...ko, 'final'][i - 1];
        return phase[prev].status === 'done' && ['pending', 'locked'].includes(phase[k].status) && (k !== 'r32' || (o.cut && o.cut.done));
      };
      pane.innerHTML = `
      ${o.sandbox !== 'docker' ? '<div class="notice warn" style="margin-bottom:16px">Bộ chạy bot đang ở chế độ <b>process</b> (chặn ở mức Python). Khi mở nhận mã công khai, đặt <code>BOT_SANDBOX=docker</code> để cách ly bằng container không mạng.</div>' : ''}
      <div class="grid g4">
        <div class="card"><div class="muted small">Hàng đợi thi chính thức</div><b style="font-size:1.6rem">${o.queue.queued.official}</b></div>
        <div class="card"><div class="muted small">Kiểm tra bài</div><b style="font-size:1.6rem">${o.queue.queued.validate}</b></div>
        <div class="card"><div class="muted small">Chạy thử</div><b style="font-size:1.6rem">${o.queue.queued.practice}</b></div>
        <div class="card"><div class="muted small">Đang chạy</div><b style="font-size:1.6rem">${o.queue.running}</b></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <h2>Sơ loại Swiss</h2>
          <p>Trạng thái: ${badge(swiss.status)} • vòng ${o.swissRound}/${total} • luật: ${esc(swiss.ruleset_name)} • diễn biến: ${swiss.reveal_opponent ? 'công khai' : 'chỉ hai đội trong trận'}</p>
          <div class="row">
            ${swiss.status === 'pending' ? '<button class="btn primary" id="lock-swiss" data-confirm="Khóa bản thi của mọi đội cho toàn bộ sơ loại?">1. Khóa bản Swiss</button>' : ''}
            <button class="btn primary" id="next-round" ${canNext ? '' : 'disabled'}>Bắt đầu vòng ${o.swissRound + 1}</button>
            <button class="btn" id="finish" ${canFinish ? '' : 'disabled'} data-confirm="Chốt sơ loại và xác định Top 32?">Chốt sơ loại → Top 32</button>
          </div>
          ${o.rounds.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Vòng</th><th>Trận xong</th><th>Lỗi</th><th></th></tr></thead><tbody>
            ${o.rounds.map((r) => `<tr><td>${r.round_no}</td><td>${r.done}/${r.total}</td><td>${r.errors ? `<span class="badge bad">${r.errors}</span>` : ''}</td>
              <td class="right">${r.confirmed ? '<span class="badge ok">Đã xác nhận</span>' : `<button class="btn sm primary" data-confirm-round="${r.round_no}" ${r.done < r.total ? 'disabled' : ''}>Xác nhận</button>`}
              ${swiss.status !== 'done' && !o.cut && r.round_no === o.swissRound ? `<button class="btn sm" data-rerun-round="${r.round_no}" data-confirm="Chạy lại toàn bộ vòng Swiss ${r.round_no}? Giữ nguyên cặp đấu và bản bot, thay kết quả cũ và cần xác nhận lại vòng." ${o.queue.running || r.done + r.errors < r.total ? 'disabled' : ''}>Chạy lại cả vòng</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : ''}
          ${o.cut ? `<p class="small" style="margin-top:12px">Top 32: ${o.cut.done ? `<span class="badge ok">đã chốt ${o.cut.qualified.length} đội</span>` : `<span class="badge warn">đang tranh suất (bước ${o.cut.step})</span>`}
            ${o.cut.history.length ? ` • ${o.cut.history.length} bước tranh suất ở ranh giới` : ''}</p>` : ''}
        </div>
        <div class="card">
          <h2>Vòng chính</h2>
          <div class="table-wrap"><table><tbody>
            ${ko.map((k) => `<tr><td>${esc(phase[k].title)}</td><td>${badge(phase[k].status)}</td>
              <td class="right">${ready(k) ? `<button class="btn sm primary" data-start="${k}" data-confirm="Khóa bản thi hiện tại của các đội và bắt đầu ${esc(phase[k].title)}?">Khóa bản &amp; bắt đầu</button>` : ''}</td></tr>`).join('')}
            <tr><td>Chung kết</td><td>${badge(phase.final.status)}</td><td class="right"><span class="muted small">Xem thẻ Chung kết</span></td></tr>
          </tbody></table></div>
          <p class="muted small" style="margin-top:8px">Đề xuất cho đội tối thiểu 24 giờ nâng cấp bot giữa các giai đoạn trước khi bấm bắt đầu.</p>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Cài đặt</h2>
        <div class="grid g4">
          <div><label>Thành lập &amp; Đổi thành viên đội</label><button class="btn" data-toggle="teams_open" data-v="${o.teamsOpen ? 'false' : 'true'}">${o.teamsOpen ? '🟢 Đang mở — bấm để khóa' : '🔴 Đang khóa — bấm để mở'}</button></div>
          <div><label>Nhận bài nộp</label><button class="btn" data-toggle="submissions_open" data-v="${s.submissions_open === 'true' ? 'false' : 'true'}">${s.submissions_open === 'true' ? '🟢 Đang mở — bấm để khóa' : '🔴 Đang khóa — bấm để mở'}</button></div>
          <div><label>Thách đấu giữa các đội</label><button class="btn" data-toggle="challenges_open" data-v="${s.challenges_open === 'true' ? 'false' : 'true'}">${s.challenges_open === 'true' ? '🟢 Đang mở — bấm để khóa' : '🔴 Đang khóa — bấm để mở'}</button></div>
          <div><label>Chạy thử</label><button class="btn" data-toggle="practice_open" data-v="${s.practice_open === 'true' ? 'false' : 'true'}">${s.practice_open === 'true' ? '🟢 Đang mở — bấm để khóa' : '🔴 Đang khóa — bấm để mở'}</button></div>
        </div>
        <div class="grid g3" style="margin-top:12px">
          <form class="setting" data-key="swiss_rounds"><label>Số vòng Swiss</label><div class="row"><input name="value" type="number" min="1" max="20" value="${esc(s.swiss_rounds)}" style="width:100px"><button class="btn sm">Lưu</button></div></form>
          <form class="setting" data-key="competition_name"><label>Tên cuộc thi (in trên chứng nhận)</label><div class="row"><input name="value" value="${esc(s.competition_name || 'BOT ARENA - Cuộc thi Bot Oẳn Tù Tì')}"><button class="btn sm">Lưu</button></div></form>
          <form class="setting" data-key="organizer"><label>Đơn vị tổ chức</label><div class="row"><input name="value" value="${esc(s.organizer || 'Ban tổ chức BOT ARENA')}"><button class="btn sm">Lưu</button></div></form>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Reset giải đấu</h2>
        <p>Xóa trận thi chính thức và lịch sử chạy, bảng điểm, nhánh đấu, phiên chung kết, giải thưởng và chứng nhận. Giữ tài khoản, đội, bài nộp, trận chơi thử và thách đấu. Mở lại lập đội và nộp bài để bắt đầu từ Swiss vòng 1.</p>
        <p class="muted small">Bản thi chung kết được đổi về bản thường hợp lệ mới nhất. Thao tác không thể hoàn tác. Cần chờ mọi tác vụ đang chạy hoàn tất.</p>
        <button class="btn danger" id="reset-tournament" ${o.queue.running ? 'disabled' : ''}>Reset giải đấu</button>
      </div>
      ${o.failedJobs.length ? `<div class="card" style="margin-top:16px"><h2>Tác vụ lỗi</h2><div class="table-wrap"><table><tbody>
        ${o.failedJobs.map((j) => `<tr><td>${esc(j.type)} #${j.ref_id}</td><td class="small">${esc(j.error)}</td><td>${j.type === 'match' ? `<button class="btn sm" data-rerun="${j.ref_id}">Chạy lại</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;

      act('#lock-swiss', () => post('/phases/swiss/lock'), 'Đã khóa bản Swiss');
      on($('#reset-tournament'), 'click', async () => {
        const confirmation = prompt('Xóa dữ liệu thi đấu để bắt đầu lại? Giữ tài khoản, đội và bot. Nhập RESET để xác nhận:');
        if (confirmation !== 'RESET') return;
        await post('/tournament/reset', { confirmation });
        toast('Đã reset giải. Bạn có thể khóa bản Swiss và bắt đầu vòng 1.');
        await render();
      });
      act('#next-round', async () => { const r = await post('/swiss/round'); toast(`Vòng ${r.round}: ${r.pairs} trận${r.bye ? ', 1 bye' : ''}${r.rematches ? `, ${r.rematches} tái đấu không tránh được` : ''}`); });
      act('#finish', () => post('/swiss/finish'), 'Đã chốt sơ loại');
      act('[data-rerun-round]', async (b) => {
        const r = await post('/swiss/rerun', { round: Number(b.dataset.rerunRound) });
        toast(`Đã đưa ${r.matches} trận vòng ${r.round} vào hàng đợi chạy lại`);
      });
      act('[data-confirm-round]', (b) => post('/swiss/confirm', { round: Number(b.dataset.confirmRound) }), 'Đã xác nhận vòng');
      act('[data-start]', (b) => post(`/phases/${b.dataset.start}/start`), 'Đã bắt đầu');
      act('[data-toggle]', (b) => post('/settings', { key: b.dataset.toggle, value: b.dataset.v }), 'Đã lưu');
      act('[data-rerun]', (b) => post(`/matches/${b.dataset.rerun}/rerun`), 'Đã đưa vào hàng đợi');
      $$('form.setting').forEach((f) => on(f, 'submit', async () => { await post('/settings', { key: f.dataset.key, value: f.value.value }); toast('Đã lưu'); }));
      every(4000, async () => {
        const n = await api('/admin/overview');
        if (JSON.stringify(n.rounds) !== JSON.stringify(o.rounds) || JSON.stringify(n.queue) !== JSON.stringify(o.queue) || JSON.stringify(n.cut) !== JSON.stringify(o.cut) || n.teamsOpen !== o.teamsOpen) PANES.ops(pane);
      });
    },

    async matches(pane) {
      const q = new URLSearchParams(window.Arena.matchFilter || {});
      const list = await api(`/admin/matches?${q}`);
      pane.innerHTML = `<div class="card">
        <form id="mf" class="row" style="margin-bottom:12px">
          <select name="phase" style="width:auto"><option value="">Mọi giai đoạn</option>${Object.entries(PHASE_VI).filter(([k]) => k !== 'main').map(([k, v]) => `<option value="${k}" ${q.get('phase') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <input name="round" placeholder="Vòng" inputmode="numeric" style="width:90px" value="${esc(q.get('round') || '')}">
          <select name="status" style="width:auto"><option value="">Mọi trạng thái</option>${['queued', 'running', 'done', 'error'].map((s) => `<option ${q.get('status') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn">Lọc</button></form>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>Giai đoạn</th><th>Đội A</th><th>Đội B</th><th>Tỉ số</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${list.map((m) => `<tr><td><a href="#/tran/${m.id}">${m.id}</a></td><td class="small">${esc(PHASE_VI[m.phase_key] || '')} ${m.kind === 'bye' ? 'bye' : m.kind === 'challenge' ? 'thách đấu' : m.kind === 'tiebreak' ? 'tranh suất' : m.kind === 'knockout' ? `T${m.game_no}` : `v${m.round_no}`}</td>
          <td>${esc(m.name_a)}</td><td>${esc(m.name_b || '')}</td><td>${m.status === 'done' && m.kind !== 'bye' ? `${m.wins_a}-${m.wins_b} (${m.draws})${m.decided_by === 'lot' ? ' *' : ''}` : ''}</td>
          <td>${badge(m.status)} ${m.confirmed ? '<span class="badge ok">XN</span>' : ''}</td>
          <td class="right">${m.kind !== 'bye' ? `<button class="btn sm" data-rerun="${m.id}" data-confirm="Chạy lại trận #${m.id}? Kết quả cũ bị thay, không cộng dồn.">Chạy lại</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div><p class="muted small">Tối đa 300 trận gần nhất. Chạy lại giữ lịch sử các lần chạy; điểm chỉ tính từ kết quả trận hiện tại.</p></div>`;
      on($('#mf'), 'submit', (e) => { window.Arena.matchFilter = Object.fromEntries(Object.entries(formData(e.target)).filter(([, v]) => v)); PANES.matches(pane); });
      act('[data-rerun]', (b) => post(`/matches/${b.dataset.rerun}/rerun`), 'Đã đưa vào hàng đợi');
    },

    async teams(pane) {
      const [list, o] = await Promise.all([api('/admin/teams'), api('/admin/overview')]);
      pane.innerHTML = `<div class="card">
        <div class="card-head">
          <div>
            <h2 style="margin:0">${list.length} đội</h2>
            <div class="muted small" style="margin-top:4px">Trạng thái thành lập đội: ${o.teamsOpen ? '<b style="color:var(--ok)">🟢 Đang mở cho thí sinh lập đội</b>' : '<b style="color:var(--bad)">🔴 Đang khóa thành lập đội</b>'}</div>
          </div>
          <button class="btn ${o.teamsOpen ? 'danger' : 'primary'} sm" data-toggle="teams_open" data-v="${o.teamsOpen ? 'false' : 'true'}">${o.teamsOpen ? '🔒 Khóa lập đội' : '🔓 Cho phép lập đội'}</button>
        </div>
        <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>#</th><th>Đội</th><th>Đội trưởng</th><th>TV</th><th>Bản nộp</th><th>Bản thi</th><th></th></tr></thead><tbody>
        ${list.map((t) => `<tr><td>${t.id}</td><td><b>${esc(t.name)}</b> ${t.withdrawn ? '<span class="badge bad">Đã rút</span>' : ''}</td><td>${esc(t.captain)}</td><td>${t.members}</td><td>${t.submissions}</td>
          <td>${t.official_version ? `v${t.official_version} ${badge(t.official_status)}` : '<span class="muted">—</span>'}</td>
          <td class="right"><button class="btn sm ${t.withdrawn ? '' : 'danger'}" data-wd="${t.id}" data-v="${t.withdrawn ? 0 : 1}" data-confirm="${t.withdrawn ? 'Khôi phục' : 'Đánh dấu rút'} đội ${esc(t.name)}?">${t.withdrawn ? 'Khôi phục' : 'Rút'}</button></td></tr>`).join('')}
        </tbody></table></div><p class="muted small">Đội rút không được khóa vào giai đoạn mới; trận đã đấu giữ nguyên.</p></div>`;
      act('[data-toggle]', async (b) => { await post('/settings', { key: b.dataset.toggle, value: b.dataset.v }); PANES.teams(pane); }, 'Đã cập nhật trạng thái');
      act('[data-wd]', (b) => post(`/teams/${b.dataset.wd}/withdraw`, { withdrawn: b.dataset.v === '1' }), 'Đã cập nhật');
    },

    async final(pane) {
      const [f, o] = await Promise.all([api('/final'), api('/admin/overview')]);
      const fp = o.phases.find((p) => p.key === 'final');
      const TYPES = ['ROCK', 'PAPER', 'SCISSORS'];
      const { TYPE_ICON, TYPE_VI } = window.BoardUI;
      // Mặc định gợi ý: đảo chiều khắc chế.
      const defBeats = { ROCK: ['PAPER'], PAPER: ['SCISSORS'], SCISSORS: ['ROCK'] };
      const rs = f.ruleset;
      pane.innerHTML = `<div class="grid g2">
        <div class="card"><h2>1. Soạn luật mới</h2>
          ${f.status === 'none' || f.status === 'draft' ? `<form id="cf">
            <div class="field"><label>Tên luật</label><input name="name" value="${esc(rs ? rs.name : 'Luật chung kết')}" required></div>
            <div class="field"><label>Bảng khắc chế (dòng: quân đi, cột: quân bị ăn)</label>
              <div class="table-wrap"><table><thead><tr><th></th>${TYPES.map((t) => `<th>${TYPE_ICON[t]} ${TYPE_VI[t]}</th>`).join('')}</tr></thead><tbody>
              ${TYPES.map((a) => `<tr><th>${TYPE_ICON[a]} ${TYPE_VI[a]} ăn</th>${TYPES.map((d) => `<td>${a === d ? '—' : `<input type="checkbox" class="bt" data-a="${a}" data-d="${d}" ${((rs ? rs.beats : defBeats)[a] || []).includes(d) ? 'checked' : ''} aria-label="${TYPE_VI[a]} ăn ${TYPE_VI[d]}" style="width:auto;min-height:0">`}</td>`).join('')}</tr>`).join('')}
              </tbody></table></div>
              <p class="muted small">Quân cùng loại luôn chặn nhau. Hai loại không được ăn lẫn nhau; mỗi loại phải ăn được và bị ăn bởi ít nhất một loại.</p></div>
            <div class="field"><label>Mô tả luật</label><textarea name="description" rows="3">${esc(rs ? rs.description : '')}</textarea></div>
            <div class="field"><label>Ghi chú phát cho đội</label><textarea name="briefing" rows="3">${esc(f.briefing || '')}</textarea></div>
            <div class="grid g2"><div class="field"><label>Thời lượng (phút)</label><input name="durationMin" type="number" min="15" max="240" value="${f.durationMin || 75}"></div><div></div></div>
            <label class="checkbox"><input type="checkbox" name="reveal" ${fp.reveal_opponent ? 'checked' : ''}> Công khai diễn biến các trận chung kết cho mọi người xem</label>
            <label class="checkbox"><input type="checkbox" name="includeMoves" checked> Dữ liệu trận lịch sử kèm toàn bộ nước đi (ngoài kết quả từng ván)</label>
            <button class="btn primary" style="margin-top:12px">Lưu luật &amp; chọn ngẫu nhiên dữ liệu</button></form>`
            : `<p><b>${esc(rs.name)}</b></p><p class="small">${window.BoardUI.beatsHtml(rs.beats)}</p><p class="muted small">Đã khóa vì phiên đã bắt đầu.</p>`}
        </div>
        <div class="card"><h2>2. Điều hành phiên</h2>
          <p>Hai đội: <b>${f.teams.length ? f.teams.map(esc).join(' vs ') : 'chưa xác định (cần xong bán kết)'}</b></p>
          <p>Phiên: ${badge(f.status === 'none' ? 'pending' : f.status)} ${f.endsAt ? `• hết giờ ${fmtTime(f.endsAt)}` : ''}</p>
          <div class="row">
            <button class="btn primary" id="fstart" ${f.status === 'draft' && f.teams.length ? '' : 'disabled'} data-confirm="Phát luật & dữ liệu cho hai đội và bắt đầu đếm giờ?">Bắt đầu phiên</button>
            <button class="btn danger" id="fend" ${f.status === 'running' ? '' : 'disabled'} data-confirm="Kết thúc phiên ngay (khóa nộp bài)?">Kết thúc sớm</button>
          </div>
          <h3 style="margin-top:16px">3. Thi chung kết</h3>
          <p>Giai đoạn: ${badge(fp.status)} • ${fp.best_of} trận, thắng ${Math.floor(fp.best_of / 2) + 1} là vô địch</p>
          <button class="btn primary" id="fplay" ${f.status === 'ended' && ['pending', 'locked'].includes(fp.status) ? '' : 'disabled'} data-confirm="Khóa bản chung kết của hai đội và cho thi đấu?">Khóa bản &amp; cho thi</button>
          <p class="muted small" style="margin-top:12px">Web không tự bảo đảm việc không dùng AI: cần phòng thi, máy cấu hình sẵn và giám sát. Yêu cầu đội giải thích phần sửa trước khi khóa bản.</p>
          ${f.data ? `<h3>Dữ liệu đã chọn</h3><p class="small">${esc(f.data.source)} • ${f.data.games.length} ván</p>` : ''}
        </div></div>`;
      on($('#cf'), 'submit', async (e) => {
        const d = formData(e.target);
        const beats = Object.fromEntries(TYPES.map((t) => [t, []]));
        $$('.bt:checked', e.target).forEach((c) => beats[c.dataset.a].push(c.dataset.d));
        await post('/final/configure', { ...d, beats,
          reveal: !!d.reveal, includeMoves: !!d.includeMoves, durationMin: Number(d.durationMin) });
        toast('Đã lưu luật chung kết');
        PANES.final(pane);
      });
      act('#fstart', () => post('/final/start'), 'Phiên chung kết bắt đầu');
      act('#fend', () => post('/final/end'), 'Đã kết thúc phiên');
      act('#fplay', () => post('/phases/final/start'), 'Chung kết đang đấu');
    },

    async awards(pane) {
      const [p, teams, certs] = await Promise.all([api('/prizes'), api('/admin/teams'), api('/admin/certificates')]);
      const opts = (sel) => `<option value="">— Chưa trao —</option>${teams.map((t) => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;
      const side = (key) => p.list.find((t) => t.items.some((i) => i.title === { progress: 'Tiến bộ nổi bật', idea: 'Ý tưởng chiến thuật' }[key]))?.teamId;
      pane.innerHTML = `<div class="grid g2">
        <div class="card"><h2>Giải phụ (2 × ${money(800000)})</h2>
          <p class="muted small">Đánh giá bằng sản phẩm, kiểm thử và phần giải thích của đội, không bằng lượt thích.</p>
          ${['progress', 'idea'].map((k) => `<form class="aw" data-key="${k}"><label>${k === 'progress' ? 'Tiến bộ nổi bật' : 'Ý tưởng chiến thuật'}</label>
            <div class="row"><select name="teamId" style="flex:1">${opts(side(k))}</select><input name="note" placeholder="Lý do" style="flex:1"><button class="btn sm">Lưu</button></div></form>`).join('<div style="height:12px"></div>')}
          <h2 style="margin-top:24px">Tổng phân bổ: ${money(p.total)} / ${money(19000000)}</h2>
          <div class="table-wrap"><table><tbody>${p.list.map((t) => `<tr><td>${esc(t.name)}</td><td class="small">${t.items.map((i) => esc(i.title)).join(', ')}</td><td class="right">${money(t.total)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="card"><div class="card-head"><h2>Chứng nhận (${certs.length})</h2><button class="btn primary" id="issue">Cấp / cập nhật chứng nhận</button></div>
          <p class="muted small">Cấp cho thành viên đội có bot hợp lệ và thi xong sơ loại; ghi vòng cao nhất và giải. Chạy lại sau mỗi giai đoạn để cập nhật, mã xác minh giữ nguyên.</p>
          <div class="table-wrap"><table><thead><tr><th>Mã</th><th>Thành viên</th><th>Thành tích</th></tr></thead><tbody>
          ${certs.map((c) => `<tr><td class="mono small"><a href="#/xac-minh/${esc(c.code)}">${esc(c.code)}</a></td><td>${esc(c.member_name)}<div class="muted small">${esc(c.team_name)}</div></td><td class="small">${esc(c.achievement)}</td></tr>`).join('')}
          </tbody></table></div></div></div>`;
      $$('form.aw').forEach((f) => on(f, 'submit', async () => { await post('/awards', { key: f.dataset.key, teamId: f.teamId.value, note: f.note.value }); toast('Đã lưu'); PANES.awards(pane); }));
      act('#issue', async () => { const r = await post('/certificates/issue'); toast(`Đã cấp/cập nhật ${r.issued} chứng nhận`); });
    },

    async support(pane) {
      const [o, tickets] = await Promise.all([api('/overview'), api('/admin/tickets')]);
      pane.innerHTML = `<div class="grid g2">
        <div class="card"><h2>Thông báo</h2>
          <form id="an"><div class="field"><input name="title" placeholder="Tiêu đề" required></div><div class="field"><textarea name="body" placeholder="Nội dung" required></textarea></div><button class="btn primary">Đăng</button></form>
          ${o.announcements.map((a) => `<div style="border-top:1px solid var(--border);padding:8px 0;margin-top:8px"><div class="row"><b>${esc(a.title)}</b><span class="spacer"></span><button class="btn sm danger" data-del="${a.id}" data-confirm="Xóa thông báo?">Xóa</button></div><p class="small">${esc(a.body)}</p></div>`).join('')}
        </div>
        <div class="card"><h2>Khiếu nại &amp; hỗ trợ</h2>
          ${tickets.length ? tickets.map((t) => `<div style="border-bottom:1px solid var(--border);padding:10px 0">
            <div class="row"><b>${esc(t.subject)}</b>${badge(t.status)}<span class="spacer"></span><span class="small muted">${esc(t.user_name)} • ${esc(t.team_name || 'chưa có đội')} • ${fmtTime(t.created_at)}</span></div>
            ${t.match_id ? `<p class="small">Trận: <a href="#/tran/${t.match_id}">#${t.match_id}</a></p>` : ''}<p class="small">${esc(t.body)}</p>
            <form class="tk row" data-id="${t.id}"><input name="reply" placeholder="Trả lời" value="${esc(t.reply || '')}" style="flex:1"><label class="checkbox"><input type="checkbox" name="close"> Đóng</label><button class="btn sm">Gửi</button></form></div>`).join('') : '<p class="muted">Không có yêu cầu.</p>'}
        </div></div>`;
      on($('#an'), 'submit', async (e) => { await post('/announcements', formData(e.target)); toast('Đã đăng'); PANES.support(pane); });
      $$('[data-del]').forEach((b) => on(b, 'click', async () => { if (!confirm(b.dataset.confirm)) return; await api(`/admin/announcements/${b.dataset.del}`, { method: 'DELETE' }); PANES.support(pane); }));
      $$('form.tk').forEach((f) => on(f, 'submit', async () => { await post(`/tickets/${f.dataset.id}`, { reply: f.reply.value, status: f.close.checked ? 'closed' : 'answered' }); toast('Đã trả lời'); PANES.support(pane); }));
    },

    async audit(pane) {
      const list = await api('/admin/audit');
      pane.innerHTML = `<div class="card"><h2>Nhật ký quản trị &amp; nộp bài</h2><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>
        ${list.map((a) => `<tr><td class="small nowrap">${fmtTime(a.created_at)}</td><td>${esc(a.user_name || '')}</td><td>${esc(a.action)}</td><td class="mono small">${esc(a.detail)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    },
  };
})();
