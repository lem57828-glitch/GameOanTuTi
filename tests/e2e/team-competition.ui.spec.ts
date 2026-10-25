import { expect, test, type Page } from '@playwright/test';

async function setup(
  page: Page,
  options: {
    noTeam?: boolean;
    room?: string | null;
    member?: boolean;
    frozen?: boolean;
    independent?: boolean;
    noTournament?: boolean;
  } = {},
) {
  let selected: string[] = [];
  let created = !options.noTeam;
  let registered = !options.independent;
  const teamData = () => ({
    id: 'alpha',
    name: 'Đội Alpha',
    tournamentId: registered ? 'tour' : null,
    status: registered ? 'approved' : 'draft',
    rosterLocked: false,
    joinCode: '1234567890',
    members: [{ id: 'an', displayName: 'Nguyễn An', isCaptain: !options.member }],
  });
  const now = '2026-10-24T12:00:00.000Z';
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/session' || path === '/auth/login')
      data = {
        user: {
          id: 'an',
          displayName: 'Nguyễn An',
          role: 'student',
          teamId: created ? 'alpha' : null,
          emailVerified: true,
          profileComplete: true,
          demo: false,
        },
      };
    else if (path === '/health') data = { demoMode: false, workerAlive: true };
    else if (path === '/notifications') data = { unread: 0 };
    else if (path === '/teams' && route.request().method() === 'POST') {
      created = true;
      registered = false;
      data = { team: teamData() };
    } else if (path === '/teams/mine/tournaments/tour') {
      registered = true;
      data = { team: teamData() };
    } else if (path === '/teams/mine') data = { team: created ? teamData() : null };
    else if (path === '/tournaments/current' && options.noTournament) {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Chưa có giải' } } });
      return;
    } else if (path === '/tournaments/current')
      data = {
        id: 'tour',
        name: 'Giải nghiệm thu',
        isDemo: false,
        serverTime: now,
        botLockAt: null,
        registrationPhase: 'open',
        registrationClosesAt: null,
        stages: [{ id: 'stage', name: 'Loại trực tiếp', kind: 'knockout', status: 'planned', lockAt: null }],
      };
    else if (path === '/tournaments/tour/my-pairings')
      data = [
        {
          id: 'pair',
          kind: 'knockout',
          levelOrd: null,
          round: 1,
          phase: 'r32',
          slot: 0,
          teamA: { id: 'alpha', name: 'Đội Alpha' },
          teamB: { id: 'beta', name: 'Đội Beta' },
          status: 'scheduled',
          games: [],
          roomId: options.room ?? null,
          canAppeal: false,
        },
      ];
    else if (path === '/tournaments/tour/qualifier/my-bot') data = { level: null };
    else if (path === '/tournaments/tour/standings') data = { rows: [] };
    else if (path === '/appeals/mine') data = [];
    else if (path === '/rooms/room-live' || path === '/rooms/room-live/games/earlier')
      data = {
        roomId: 'room-live',
        title: 'Alpha vs Beta',
        isDemo: false,
        streamId: 'game:earlier',
        seq: 2,
        status: path.includes('/games/') ? 'finished' : 'running',
        gameId: 'earlier',
        rulesetId: 'standard-32-4',
        teams: { a: { id: 'alpha', name: 'Alpha' }, b: { id: 'beta', name: 'Beta' } },
        coinResult: null,
        initialBoard: { A1: { side: 'blue', type: 'ROCK' } },
        board: { A2: { side: 'blue', type: 'ROCK' } },
        history: [{ ply: 1, side: 'blue', from: 'A1', to: 'A2', type: 'ROCK', capture: null }],
        turn: { side: 'blue', ply: 1 },
        result: null,
        job: null,
        serverTime: now,
        deadline: null,
        match: null,
      };
    else if (path === '/bots')
      data = [
        {
          id: 'github-bot',
          teamId: 'alpha',
          version: 1,
          label: 'Tiến công',
          status: 'valid',
          submissionMethod: 'github',
        },
        {
          id: 'practice',
          teamId: 'alpha',
          version: 2,
          label: 'Chỉ tập luyện',
          status: 'valid',
          submissionMethod: 'direct',
        },
      ];
    else if (path.startsWith('/stages/stage/bot-selection')) {
      if (route.request().method() === 'POST') selected = route.request().postDataJSON().botVersionIds;
      data =
        selected.length || options.frozen
          ? {
              teamId: 'alpha',
              stageId: 'stage',
              botVersionIds: options.frozen ? ['github-bot'] : selected,
              locked: !!options.frozen,
              updatedAt: now,
            }
          : null;
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Không có fixture' } },
      });
      return;
    }
    await route.fulfill({ json: { data } });
  });
}

test('chưa có đội: chỉ dẫn tạo/tham gia đội', async ({ page }) => {
  await setup(page, { noTeam: true });
  await page.goto('/competition');
  await expect(page.getByRole('link', { name: 'Tạo đội / Tham gia đội' })).toHaveAttribute('href', '/team');
  await expect(page.getByRole('button', { name: 'Lưu bộ bot dự thi' })).toHaveCount(0);
});

test('sinh viên đăng nhập được dẫn tới Thi đấu của đội', async ({ page }) => {
  await setup(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('an@example.edu.vn');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password-test');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/competition$/);
  await expect(page.getByRole('heading', { name: 'Thi đấu của đội' })).toBeVisible();
});

test('lập đội khi chưa có giải; đội vẫn có thể quản lý và chuẩn bị bot', async ({ page }) => {
  await setup(page, { noTeam: true, noTournament: true, independent: true });
  await page.goto('/team');
  await page.getByRole('textbox', { name: 'Tên đội', exact: true }).fill('Đội Alpha');
  await page.getByRole('button', { name: 'Lập đội', exact: true }).click();
  await expect(page.getByText('Chưa đăng ký giải', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Chưa có giải đang mở.', { exact: false })).toBeVisible();
  await page.goto('/competition');
  await expect(page.getByRole('link', { name: 'Quản lý đội / Đăng ký giải' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nộp / Kiểm thử bot' })).toBeVisible();
});

test('đội trưởng chủ động đăng ký đội độc lập vào giải', async ({ page }) => {
  await setup(page, { independent: true });
  await page.goto('/team');
  await page.getByRole('button', { name: 'Đăng ký đội vào giải', exact: true }).click();
  await expect(page.getByText('Đã đăng ký giải', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng ký đội vào giải', exact: true })).toHaveCount(0);
});

test('chọn đúng bot GitHub, gửi lưu bộ bot và chờ BTC mở phòng (API fixture)', async ({ page }) => {
  await setup(page);
  await page.goto('/competition');
  await expect(page.getByText('Đã có đối thủ · Chờ BTC mở phòng')).toBeVisible();
  await expect(page.getByText('Đội Beta', { exact: true })).toBeVisible();
  await expect(page.getByText('Chỉ tập luyện', { exact: false })).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Lưu bộ bot dự thi' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu bộ bot.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('phòng đã mở: dẫn đúng phòng, giữ bố cục trên desktop và điện thoại', async ({ page }) => {
  await setup(page, { room: 'room-alpha' });
  await page.goto('/competition');
  await expect(page.getByRole('link', { name: 'Vào phòng', exact: true }).first()).toHaveAttribute(
    'href',
    '/rooms/room-alpha',
  );
  await page.screenshot({ path: 'artifacts/team-competition-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Thi đấu của đội' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/team-competition-390.png', fullPage: true });
});

test('thành viên xem bộ bot đã khóa, không thể lưu thay đội trưởng', async ({ page }) => {
  await setup(page, { member: true, frozen: true });
  await page.goto('/competition');
  await expect(page.getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lưu bộ bot dự thi' })).toHaveCount(0);
});

test('phòng theo sát nước mới, cho tua và trở lại live; replay ván cũ bắt đầu từ nước 0', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/rooms/room-live');
  await expect(page.getByText('Nước 1/1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Về nước đầu' }).click();
  await expect(page.getByText('Nước 0/1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Theo dõi trực tiếp' }).click();
  await expect(page.getByText('Nước 1/1', { exact: true })).toBeVisible();
  await page.goto('/rooms/room-live?game=earlier');
  await expect(page.getByText('Nước 0/1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chạy', exact: true }).click();
  await expect(page.getByText('Nước 1/1', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trận hiện tại' })).toHaveAttribute(
    'href',
    '/rooms/room-live',
  );
});
