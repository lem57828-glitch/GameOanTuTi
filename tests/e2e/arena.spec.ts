import { expect, test } from '@playwright/test';

test('BTC configures and reviews stage schedules with a visible audit trail', async ({ page }) => {
  await page.goto('/demo-login');
  await page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('tab', { name: 'Cấu hình giải', exact: true }).click();
  const name = `Kiểm thử lịch ${Date.now()}`;
  await page.getByLabel('Tên giải mới').fill(name);
  await page.getByRole('button', { name: 'Tạo giải nháp', exact: true }).click();
  await expect(page.getByLabel('Tên giải', { exact: true })).toHaveValue(name);
  await page.getByLabel('Lý do thao tác').fill('Chuẩn bị lịch giải cho nhóm');
  const future = (days: number) => {
    const date = new Date(Date.now() + days * 86400000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  for (const [label, day] of [
    ['Mở đăng ký', 1],
    ['Đóng đăng ký', 2],
    ['Khóa đội hình', 3],
    ['Khóa nộp bot', 4],
  ] as const)
    await page.getByLabel(label, { exact: true }).fill(future(day));
  await page.getByRole('button', { name: 'Lưu cấu hình giải', exact: true }).click();
  await expect(page.getByText('tournament.configure', { exact: true }).first()).toBeVisible();
  const add = page.getByRole('region', { name: 'Thêm giai đoạn', exact: true });
  await add.getByLabel('Tên giai đoạn').fill('Sơ loại theo lịch');
  await add.getByLabel('Hạn khóa giai đoạn').fill(future(5));
  await add.getByLabel('Bắt đầu giai đoạn').fill(future(6));
  await add.getByLabel('Kết thúc giai đoạn').fill(future(7));
  await add.getByRole('button', { name: 'Thêm giai đoạn', exact: true }).click();
  const stage = page.getByRole('region', { name: 'Giai đoạn 1', exact: true });
  await expect(stage.getByLabel('Tên giai đoạn')).toHaveValue('Sơ loại theo lịch');
  for (const label of ['Mở cấu hình', 'Khóa cấu hình', 'Chốt cấu hình'])
    await stage.getByRole('button', { name: label, exact: true }).click();
  await expect(stage.getByText('Đã chốt cấu hình', { exact: true })).toBeVisible();
  await expect(stage.getByLabel('Tên giai đoạn')).toBeDisabled();
  const configuration = page.getByRole('region', { name: 'Cấu hình giải', exact: true });
  for (const label of ['Mở cấu hình', 'Khóa cấu hình', 'Chốt cấu hình'])
    await configuration.getByRole('button', { name: label, exact: true }).click();
  await expect(configuration.getByLabel('Tên giải', { exact: true })).toBeDisabled();
  await configuration.getByRole('button', { name: 'Công bố giải', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Cấu hình giải', exact: true }).click();
  await expect(page.getByText('stage.config.confirm', { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('public pages fit mobile and desktop; private administration checks role', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/rooms', '/tournament', '/guide', '/login']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.goto('/demo-login');
  await page.getByRole('button', { name: 'Đăng nhập bằng Nguyễn An', exact: true }).click();
  await expect(page).toHaveURL(/\/team$/);
  await page.goto('/admin');
  await expect(page.getByText('Không có quyền truy cập')).toBeVisible();
  const forbidden = await page.request.post('/api/v1/demo/games', { data: { requestKey: 'e2e-forbidden' } });
  expect(forbidden.status()).toBe(403);
});

test('admin creates a real queued simulation; spectators reload and reconnect without rerolling', async ({
  page,
  browser,
}) => {
  await page.goto('/demo-login');
  await page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/health')).json()).data.workerAlive)
    .toBe(true);
  await page.getByRole('tab', { name: 'Dịch vụ & ván demo', exact: true }).click();
  await expect(page.getByText('Chưa sẵn sàng')).toHaveCount(0);
  const key = `e2e:${Date.now()}`;
  await page.getByLabel('Mã yêu cầu (requestKey)').fill(key);
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/demo/games') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Tạo ván mô phỏng', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { data } = await response.json();
  const duplicate = await page.request.post('/api/v1/demo/games', { data: { requestKey: key } });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).data.gameId).toBe(data.gameId);
  const spectator = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
  });
  const room = await spectator.newPage();
  try {
    await room.goto(`/rooms/${data.roomId}`);
    await expect(room.getByRole('grid')).toBeVisible();
    await expect
      .poll(async () => (await (await room.request.get(`/api/v1/rooms/${data.roomId}`)).json()).data.status, {
        timeout: 40000,
      })
      .toBe('finished');
    const first = (await (await room.request.get(`/api/v1/rooms/${data.roomId}`)).json()).data;
    await room.reload();
    await expect(room.getByRole('heading', { name: 'Kết quả', exact: true })).toBeVisible();
    await spectator.setOffline(true);
    await expect(room.getByText('Đang mất kết nối trực tiếp')).toBeVisible();
    await spectator.setOffline(false);
    await expect(room.getByText('Trực tiếp', { exact: true })).toBeVisible();
    const second = (await (await room.request.get(`/api/v1/rooms/${data.roomId}`)).json()).data;
    expect(second.gameId).toBe(first.gameId);
    expect(second.coinResult).toEqual(first.coinResult);
    expect(second.board).toEqual(first.board);
    expect(second.seq).toBe(first.seq);
    expect(await room.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await room.screenshot({ path: 'test-results/room-mobile.png', fullPage: true });
  } finally {
    await spectator.close();
  }
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
});

test('khách xem bảng xếp hạng/nhánh đấu; BTC thấy bảng điều hành thi đấu và khiếu nại', async ({ page }) => {
  await page.goto('/tournament');
  await page.getByRole('tab', { name: 'Bảng xếp hạng', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
  await page.getByRole('tab', { name: 'Nhánh 32 → 4', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
  const forbidden = await page.request.post('/api/v1/appeals', {
    data: { pairingId: 'x', body: 'Không đăng nhập thì không gửi được' },
  });
  expect(forbidden.status()).toBe(401);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Bước tiếp theo')).toBeVisible();
  await page.getByRole('tab', { name: 'Khiếu nại', exact: true }).click();
  await expect(page.getByText('Khiếu nại chính thức')).toBeVisible();
});
