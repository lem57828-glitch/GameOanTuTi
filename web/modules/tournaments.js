/* Trang của module tournaments — TV3. Chỉ TV3 sửa tệp này. */
'use strict';
(() => {
  const { page, placeholder } = window.Arena;
  const OWNER = 'TV3';
  const holder = (title, tasks, apis) => (root) => { root.innerHTML = placeholder({ owner: OWNER, title, tasks, apis }); };

  page({ path: '/giai', nav: 'Lịch giải', title: 'Lịch giải', owner: OWNER,
    render: holder('Lịch giải', ['Các mức sơ loại, ngày thi, mốc 18:00 khóa bot / 20:00 công bố (có ngày, giờ Việt Nam)', 'Trạng thái giải hiện tại'],
      ['/api/tournaments']) });
  page({ path: '/xep-hang', nav: 'Xếp hạng', title: 'Xếp hạng', owner: OWNER,
    render: holder('Bảng xếp hạng', ['Mức, vòng, số trận, điểm 3/1/0, tiêu chí phụ, T-H-B', 'Trạng thái tạm/đã chốt; đi tiếp tô xanh, bị loại tô đỏ + nhãn chữ'],
      ['/api/stages']) });
  page({ path: '/quan-tri/giai', nav: 'Điều hành giải', roles: ['admin'], title: 'Điều hành giải', owner: OWNER,
    render: holder('Điều hành giải', ['Tạo/cấu hình giải, mức, mốc khóa', 'Mở mức, ghép vòng, chốt mức, tranh suất', 'Lập hạt giống và cây 32→4, chuyển vòng, dừng ở Top 4'],
      ['/api/admin/tournaments', '/api/admin/stages', '/api/admin/pairs']) });
  page({ path: '/trong-tai', nav: 'Khiếu nại', roles: ['referee', 'admin'], title: 'Trọng tài', owner: OWNER,
    render: holder('Khiếu nại & quyết định', ['Hàng đợi khiếu nại kèm bằng chứng/log', 'Tạm hoãn, chạy lại, chốt — ghi người, lý do, thời gian (audit)'],
      ['/api/referee']) });
})();
