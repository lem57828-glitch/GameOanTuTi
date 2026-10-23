import { expect, it } from 'vitest';
import {
  nextConfigurationStatus,
  registrationPhase,
  validateTimeline,
} from '../../src/modules/tournaments/configuration.js';
import type { TournamentRow } from '../../src/modules/tournaments/tournaments.repository.js';
const date = (hour: number) => new Date(Date.UTC(2030, 0, 1, hour));
const row = (): TournamentRow => ({
  id: 'tour_test',
  name: 'Test',
  status: 'draft',
  isDemo: false,
  description: '',
  configStatus: 'draft',
  revision: 0,
  createdAt: date(0),
  registrationOpensAt: date(1),
  registrationClosesAt: date(2),
  teamLockAt: date(3),
  botLockAt: date(4),
  stages: [
    {
      id: 'stage_test',
      tournamentId: 'tour_test',
      ord: 1,
      name: 'Swiss',
      kind: 'qualifier',
      status: 'planned',
      configStatus: 'draft',
      lockAt: date(5),
      startsAt: date(6),
      endsAt: date(7),
    },
  ],
});
it('requires each review transition and permits reopening locked/confirmed configuration', () => {
  expect(nextConfigurationStatus('draft', 'open')).toBe('open');
  expect(nextConfigurationStatus('open', 'lock')).toBe('locked');
  expect(nextConfigurationStatus('locked', 'confirm')).toBe('confirmed');
  expect(nextConfigurationStatus('confirmed', 'reopen')).toBe('open');
  expect(() => nextConfigurationStatus('draft', 'confirm')).toThrow();
  expect(() => nextConfigurationStatus('confirmed', 'lock')).toThrow();
});
it('validates complete schedules, rejects inverted deadlines and overlapping stages', () => {
  expect(() => validateTimeline(row(), true)).not.toThrow();
  const missing = row();
  missing.botLockAt = null;
  expect(() => validateTimeline(missing, true)).toThrow();
  expect(() => validateTimeline(missing)).not.toThrow();
  const inverted = row();
  inverted.registrationClosesAt = date(0);
  expect(() => validateTimeline(inverted)).toThrow();
  const overlap = row();
  overlap.stages.push({ ...overlap.stages[0]!, id: 'stage_next', ord: 2, lockAt: date(6) });
  expect(() => validateTimeline(overlap)).toThrow();
});
it('uses server time at exact registration and lock boundaries', () => {
  const t = row();
  expect(registrationPhase(t, date(0))).toBe('scheduled');
  expect(registrationPhase(t, date(1))).toBe('open');
  expect(registrationPhase(t, date(2))).toBe('closed');
  expect(registrationPhase(t, date(3))).toBe('teams_locked');
  expect(registrationPhase(t, date(4))).toBe('bots_locked');
  t.teamLockAt = null;
  expect(registrationPhase(t, date(1))).toBe('unconfigured');
});
