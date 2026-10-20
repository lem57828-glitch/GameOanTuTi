import { expect, test } from '@playwright/test';

test('public pages fit mobile and desktop; private administration checks role', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/rooms', '/tournament', '/guide', '/login']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.goto('/login');
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
  await page.goto('/login');
  await page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/health')).json()).data.workerAlive)
    .toBe(true);
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
