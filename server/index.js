// Điểm khởi động máy chủ web: `npm start`.
const config = require('./core/config');
const { setup, createApp } = require('./app');

const applied = setup();
if (applied.length) console.log('Đã chạy migration:', applied.join(', '));
createApp().listen(config.PORT, () => {
  console.log(`BOT ARENA (khung xây lại) chạy tại http://localhost:${config.PORT}`);
  if (config.DEV_LOGIN) console.log('Đăng nhập giả lập đang BẬT (chỉ dùng khi phát triển). Chạy `npm run seed` để có tài khoản mẫu.');
});
