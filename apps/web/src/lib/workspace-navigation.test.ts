import { describe, expect, it } from 'vitest';
import { destinations, matchesSearch, workspaceMeta } from './workspace-navigation';

describe('workspace navigation', () => {
  it('keeps private and staff shortcuts out of guest search', () => {
    const hrefs = destinations(null).map((item) => item.href);
    expect(hrefs).toContain('/register');
    expect(hrefs).toContain('/rooms');
    expect(hrefs).not.toContain('/profile');
    expect(hrefs).not.toContain('/admin');
    expect(hrefs).not.toContain('/bots');
  });
  it('shows role-appropriate destinations without changing route permissions', () => {
    const student = destinations('student').map((item) => item.href);
    const staff = destinations('admin').map((item) => item.href);
    expect(student).toEqual(expect.arrayContaining(['/competition', '/team', '/bots', '/notifications']));
    expect(student).not.toContain('/admin/accounts');
    expect(staff).toEqual(expect.arrayContaining(['/admin', '/admin/accounts', '/bots']));
    expect(staff).not.toContain('/competition');
  });
  it('only exposes demo mailbox and demo sign-in in the proper context', () => {
    expect(destinations(null, true).some((item) => item.href === '/demo-login')).toBe(true);
    expect(destinations('student', true).some((item) => item.href === '/mailbox')).toBe(true);
    expect(destinations('student', false).some((item) => item.href === '/mailbox')).toBe(false);
    expect(destinations(null, true).some((item) => item.href === '/mailbox')).toBe(false);
  });
  it('matches Vietnamese with or without accents and requires all words', () => {
    expect(matchesSearch('Đội Chiến Thuật', 'doi thuat')).toBe(true);
    expect(matchesSearch('Đội Chiến Thuật', '  ĐỘI  chiến  ')).toBe(true);
    expect(matchesSearch('Bot phiên bản v12', 'bot v12')).toBe(true);
    expect(matchesSearch('Team Alpha', 'alpha beta')).toBe(false);
    expect(matchesSearch('', 'abc')).toBe(false);
    expect(matchesSearch('Team Alpha', '')).toBe(true);
  });
  it('identifies room, admin and account contexts independently', () => {
    expect(workspaceMeta('/rooms/room_123').group).toBe('rooms');
    expect(workspaceMeta('/admin/accounts').label).toBe('Quản trị tài khoản');
    expect(workspaceMeta('/reset-password').auth).toBe(true);
    expect(workspaceMeta('/profile').auth).toBe(false);
    expect(workspaceMeta('/bots').group).toBe('team');
  });
});
