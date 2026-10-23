// Cookie phiên ký HMAC-SHA256: `<payload base64url>.<chữ ký base64url>`.
// Cookie chỉ chứa id tài khoản và thời điểm cấp; quyền và đội luôn được đọc lại từ database mỗi yêu cầu.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';

export const SESSION_COOKIE = 'arena_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionClaims {
  sub: string;
  v?: number;
  demo: boolean;
  iat: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url');

export function encodeSession(claims: SessionClaims, secret: string): string {
  const body = b64(JSON.stringify(claims));
  return `${body}.${sign(body, secret)}`;
}

export function decodeSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionClaims | null {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
    if (
      (claims.v !== undefined && (!Number.isInteger(claims.v) || claims.v < 0)) ||
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      typeof claims.demo !== 'boolean' ||
      typeof claims.iat !== 'number' ||
      !Number.isFinite(claims.iat)
    )
      return null;
    if (now - claims.iat > SESSION_TTL_MS || claims.iat > now + 60_000) return null;
    return claims;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
