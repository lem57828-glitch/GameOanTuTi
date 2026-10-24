import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const legacyPath = new URL('../.env', import.meta.url);
const legacy = existsSync(legacyPath) ? parseEnv(readFileSync(legacyPath, 'utf8')) : {};

for (const profile of ['demo', 'official']) {
  const target = new URL(`../.env.${profile}`, import.meta.url);
  if (existsSync(target)) {
    console.log(`Giữ nguyên .env.${profile} đã có.`);
    continue;
  }
  let template = readFileSync(new URL(`../.env.${profile}.example`, import.meta.url), 'utf8');
  const quote = (value) => {
    if (/[\r\n]/.test(value) || (value.includes("'") && value.includes('"')))
      throw new Error('Giá trị cấu hình phức tạp cần tự điền trong file profile.');
    const mark = value.includes("'") ? '"' : "'";
    return `${mark}${value}${mark}`;
  };
  const replace = (key, value) => {
    if (value !== undefined)
      template = template.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${quote(value)}`);
  };
  // Reuse connection credentials, never the old public schema, queue or session secret.
  if (legacy.DATABASE_URL) {
    const database = new URL(legacy.DATABASE_URL);
    database.searchParams.set('schema', `arena_${profile}`);
    replace('DATABASE_URL', database.href);
  }
  if (legacy.REDIS_URL) {
    const redis = new URL(legacy.REDIS_URL);
    redis.pathname = profile === 'demo' ? '/0' : '/1';
    replace('REDIS_URL', redis.href);
  }
  for (const key of ['BOT_CONTAINER_CMD', 'BOT_SANDBOX_IMAGE', 'PYTHON_CMD', 'EMAIL_ALLOWED_DOMAINS']) {
    if (key === 'PYTHON_CMD' && legacy[key]) template += `\nPYTHON_CMD=${quote(legacy[key])}\n`;
    else replace(key, legacy[key]);
  }
  if (profile === 'official')
    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'])
      replace(key, legacy[key]);
  writeFileSync(target, template.replace('GENERATE_UNIQUE_SECRET', randomBytes(32).toString('hex')), {
    flag: 'wx',
  });
  console.log(`Đã tạo ${fileURLToPath(target)}. Kiểm tra kết nối và cấu hình SMTP trước khi chạy.`);
}
