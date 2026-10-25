import { expect, it } from 'vitest';
import { Role, TeamView } from '../src/index.js';

it('chỉ có BTC và thí sinh; không nhận role trọng tài cũ', () => {
  expect(Role.options).toEqual(['student', 'admin']);
  expect(Role.safeParse('referee').success).toBe(false);
});

it('đội có thể tồn tại mà chưa đăng ký giải', () => {
  expect(
    TeamView.parse({
      id: 'team',
      name: 'Độc lập',
      status: 'draft',
      joinCode: '1234567890',
      tournamentId: null,
      members: [],
    }).tournamentId,
  ).toBeNull();
});
