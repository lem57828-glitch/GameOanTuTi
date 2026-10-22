const nodemailer = require('nodemailer');
const { UserError } = require('./submissions');

async function sendVerification(email, code) {
  const user = 'btc.arena.ai@gmail.com';
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!pass) throw new UserError('Hệ thống chưa cấu hình gửi email xác minh. Vui lòng liên hệ ban tổ chức.', 503);
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass: pass.replace(/\s/g, '') },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
  try {
    const result = await transport.sendMail({
      from: `BOT ARENA <${user}>`, to: email,
      subject: 'Mã xác minh đăng ký BOT ARENA',
      text: `Mã xác minh tài khoản BOT ARENA của bạn là: ${code}\n\nMã chỉ có hiệu lực trong 2 phút và chỉ được sử dụng một lần. Không chia sẻ mã này với người khác.\nNếu bạn không đăng ký, hãy bỏ qua email này.`,
    });
    if (!result.accepted?.length) throw new Error('Recipient rejected');
  } catch {
    throw new UserError('Không gửi được email xác minh. Vui lòng thử lại sau.', 503);
  } finally {
    transport.close();
  }
}

module.exports = { sendVerification };
