import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

export function readProfile(root, profile) {
  if (!['demo', 'official'].includes(profile)) throw new Error('Chỉ nhận profile demo hoặc official.');
  const path = resolve(root, `.env.${profile}`);
  if (!existsSync(path)) throw new Error(`Thiếu .env.${profile}. Chạy pnpm env:init trước.`);
  const values = parseEnv(readFileSync(path, 'utf8'));
  const expected = profile === 'demo';
  if (values.ARENA_PROFILE !== profile || values.DEMO_MODE !== String(expected))
    throw new Error(`ARENA_PROFILE/DEMO_MODE trong .env.${profile} không khớp.`);
  if (new URL(values.DATABASE_URL).searchParams.get('schema') !== `arena_${profile}`)
    throw new Error(`Cần schema=arena_${profile} để không đụng dữ liệu môi trường khác.`);
  const redis = new URL(values.REDIS_URL);
  if (!['redis:', 'rediss:'].includes(redis.protocol) || redis.pathname !== (expected ? '/0' : '/1'))
    throw new Error(`Redis của ${profile} phải dùng database ${expected ? '0' : '1'}.`);
  if (values.QUEUE_PREFIX !== `arena-${profile}` || values.SESSION_COOKIE_NAME !== `arena_${profile}_session`)
    throw new Error('Queue/cookie phải có namespace riêng đúng profile.');
  if (
    !values.SESSION_SECRET ||
    values.SESSION_SECRET.length < 32 ||
    /change-me|replace|local-development-only|dev-session-secret/i.test(values.SESSION_SECRET)
  )
    throw new Error('Cần SESSION_SECRET riêng, đủ mạnh cho profile. Chạy pnpm env:init để tạo mẫu mới.');
  for (const key of ['API_PORT', 'WEB_PORT']) {
    const port = Number(values[key]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${key} không hợp lệ.`);
  }
  if (values.API_PORT === values.WEB_PORT)
    throw new Error('API_PORT và WEB_PORT phải khác nhau khi chạy dev.');
  if (!expected && values.BOT_SANDBOX_MODE !== 'docker') throw new Error('Official cần sandbox container.');
  const otherPath = resolve(root, `.env.${expected ? 'official' : 'demo'}`);
  if (existsSync(otherPath)) {
    const other = parseEnv(readFileSync(otherPath, 'utf8'));
    if (other.SESSION_SECRET === values.SESSION_SECRET)
      throw new Error('Hai profile không được dùng chung SESSION_SECRET.');
    if ([other.API_PORT, other.WEB_PORT].some((p) => p && [values.API_PORT, values.WEB_PORT].includes(p)))
      throw new Error('Hai profile không được dùng trùng cổng.');
  }
  return { path, values };
}
