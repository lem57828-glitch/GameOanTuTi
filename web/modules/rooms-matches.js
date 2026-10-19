/* Trang của module rooms-matches — TV4. Chỉ TV4 sửa tệp này. */
'use strict';
(() => {
  const { page, placeholder } = window.Arena;
  const OWNER = 'TV4';
  const holder = (title, tasks, apis) => (root) => { root.innerHTML = placeholder({ owner: OWNER, title, tasks, apis }); };

  page({ path: '/phong', nav: 'Phòng đấu', title: 'Phòng đấu', owner: OWNER,
    render: holder('Phòng đấu', ['Lọc live/sắp tới/đã xong, tìm đội — khách không đăng nhập xem được', 'Cây nhị phân 32→4, bấm vào nhánh mở đúng phòng (dữ liệu từ TV3)'],
      ['/api/rooms']) });
  page({ path: '/phong/:code', title: 'Phòng', owner: OWNER,
    render: holder('Phòng đấu', [
      'Thông tin hai đội, luật, đồng hồ máy chủ, điểm từng hiệp (5 + 2 phụ)',
      'Đội trưởng: đăng ký bộ 1–3 bot, chọn kín bot + quân thứ 10, sẵn sàng; 10 phút giữa hiệp',
      'Công bố đồng thời, kết quả tung xu, bàn cờ trực tiếp; kết nối lại khôi phục đúng tiến độ',
      'Replay theo hiệp/lần chạy; ý kiến khán giả; gửi khiếu nại chính thức',
    ], ['/api/rooms']) });
})();
