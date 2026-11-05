// Lấy GMAIL_REFRESH_TOKEN cho MAIL_TRANSPORT=gmail_api (chạy một lần trên máy có trình duyệt).
//   pnpm gmail:token -- <CLIENT_ID> <CLIENT_SECRET>
// hoặc đặt biến môi trường GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET rồi chạy `pnpm gmail:token`.
// OAuth client phải thuộc loại "Desktop app" (cho phép chuyển hướng về http://127.0.0.1:<cổng bất kỳ>).
// Chỉ xin quyền gmail.send: token chỉ gửi được thư, không đọc được hộp thư.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const [clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET] = process.argv
  .slice(2)
  .filter((a) => a !== '--');
if (!clientId || !clientSecret) {
  console.error('Thiếu CLIENT_ID/CLIENT_SECRET. Dùng: pnpm gmail:token -- <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  const finish = (msg, code = 0) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(msg);
    server.close();
    process.exitCode = code;
  };
  if (url.searchParams.get('state') !== state) return finish('Sai state, hãy chạy lại lệnh.', 1);
  const code = url.searchParams.get('code');
  if (!code) return finish(`Google trả lỗi: ${url.searchParams.get('error') ?? 'không rõ'}`, 1);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!body.refresh_token) {
    console.error(
      `Không nhận được refresh token (HTTP ${r.status}, ${body.error ?? 'không có refresh_token'}).`,
    );
    console.error('Thu hồi quyền cũ tại https://myaccount.google.com/permissions rồi chạy lại.');
    return finish('Không lấy được refresh token, xem terminal.', 1);
  }
  console.log('\nGMAIL_REFRESH_TOKEN (dán vào biến môi trường của server, KHÔNG commit):\n');
  console.log(body.refresh_token + '\n');
  finish('Xong. Quay lại terminal để lấy GMAIL_REFRESH_TOKEN; có thể đóng tab này.');
});

let redirectUri = '';
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();
  console.log(
    'Mở link sau bằng trình duyệt, đăng nhập đúng tài khoản Gmail dùng để gửi thư và bấm Cho phép:\n',
  );
  console.log(auth.toString() + '\n');
});
