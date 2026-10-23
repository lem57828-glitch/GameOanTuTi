import { describe, expect, it } from 'vitest';
import { RegisterRequest, LoginRequest } from '@arena/contracts';
import { hashPassword, verifyPassword } from '../../src/modules/accounts-teams/password.js';

describe('password authentication', () => {
  it('uses a fresh salt and verifies only the correct password', async () => {
    const password = 'Test-password-123';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('wrong-password', first)).toBe(false);
    expect(await verifyPassword(password, 'malformed')).toBe(false);
  });
  it('normalizes identity fields and rejects incomplete, weak or privileged registration', () => {
    const input = {
      fullName: ' Nguyễn An ',
      studentId: ' sv123 ',
      className: ' CNTT ',
      faculty: ' Công nghệ ',
      email: ' An@Example.com ',
      password: 'password123',
    };
    expect(RegisterRequest.parse(input)).toMatchObject({
      fullName: 'Nguyễn An',
      email: 'an@example.com',
      studentId: 'SV123',
    });
    for (const field of ['fullName', 'studentId', 'className', 'faculty', 'email', 'password']) {
      expect(RegisterRequest.safeParse({ ...input, [field]: '' }).success).toBe(false);
    }
    expect(RegisterRequest.safeParse({ ...input, password: '1234567' }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...input, role: 'admin' }).success).toBe(false);
    expect(LoginRequest.parse({ email: input.email, password: input.password }).email).toBe('an@example.com');
  });
});
