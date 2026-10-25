import { describe, expect, it } from 'vitest';
import { MyPairingView, type TeamView } from '@arena/contracts';
import { teamNextStep } from './team-competition';

const team: TeamView = {
  id: 'alpha',
  name: 'Alpha',
  tournamentId: 'tour',
  status: 'approved',
  joinCode: '1234567890',
  rosterLocked: false,
  members: [],
};
const pairing = (overrides: Partial<MyPairingView> = {}): MyPairingView =>
  MyPairingView.parse({
    id: 'pair',
    kind: 'swiss',
    levelOrd: 1,
    round: 1,
    phase: null,
    slot: null,
    teamA: { id: 'alpha', name: 'Alpha' },
    teamB: { id: 'beta', name: 'Beta' },
    seedA: null,
    seedB: null,
    status: 'scheduled',
    result: null,
    winnerTeamId: null,
    scoreA: 0,
    scoreB: 0,
    games: [],
    decidedBy: null,
    source: null,
    resultVersion: 0,
    confirmed: false,
    openAppeals: 0,
    roomId: null,
    updatedAt: '2026-10-24T00:00:00.000Z',
    canAppeal: false,
    appealBlockedReason: null,
    ...overrides,
  });

describe('bước tiếp theo của đội', () => {
  it('hướng dẫn lập đội và chờ duyệt', () => {
    expect(teamNextStep(null, []).href).toBe('/team');
    expect(teamNextStep({ ...team, status: 'draft' }, []).title).toContain('duyệt');
  });
  it('chỉ dẫn vào phòng sau khi BTC đã mở, ưu tiên phòng đang có', () => {
    expect(teamNextStep(team, [pairing()]).title).toContain('Chờ BTC mở phòng');
    expect(teamNextStep(team, [pairing(), pairing({ id: 'open', roomId: 'room' })]).href).toBe('/rooms/room');
  });
  it('kết quả tạm phải chờ xác nhận, kể cả thua loại trực tiếp', () => {
    expect(
      teamNextStep(team, [pairing({ kind: 'knockout', status: 'done', winnerTeamId: 'beta' })]).title,
    ).toContain('xác nhận');
  });
  it('thua Swiss chưa đồng nghĩa bị loại; thua knockout đã chốt thì dừng', () => {
    const lost = pairing({ status: 'done', confirmed: true, winnerTeamId: 'beta' });
    expect(teamNextStep(team, [lost]).title).toContain('vòng tiếp theo');
    expect(teamNextStep(team, [{ ...lost, kind: 'knockout' }]).title).toContain('dừng');
  });
  it('bỏ qua trận hủy và cho xem lại sau khi rút đội', () => {
    expect(teamNextStep(team, [pairing({ status: 'cancelled', roomId: 'old' })]).href).toBe('/bots');
    expect(teamNextStep({ ...team, status: 'withdrawn' }, [pairing({ roomId: 'room' })]).title).toContain(
      'rút',
    );
  });
});
