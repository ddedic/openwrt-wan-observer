import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

async function syntheticApi(page) {
  const errors = [];
  const posts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'));
  const payload = {
    collector: {
      config: {
        enabled: true,
        adaptive: false,
        interval_minutes: 60,
        start_hour: 0,
        end_hour: 24,
        download_mbps: 100,
        upload_mbps: 20,
        threshold_percent: 80,
        monthly_budget_bytes: 0,
        quality_history_enabled: false,
        window_timezone: 'UTC',
      },
      events: [],
      busy: false,
      usage: { budget_state: 'unset' },
    },
    measurements: [
      {
        timestamp: '2026-11-12T11:00:00Z',
        download_mbps: 90,
        upload_mbps: 18,
        idle_latency_ms: 12,
        idle_jitter_ms: 2,
        packet_loss_percent: 0,
      },
    ],
    readiness: { status: 'ready', checks: {} },
    quality: {
      status: { state: 'disabled', source_freshness: 'unknown' },
      series: null,
    },
  };
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith('http://127.0.0.1:4179/')) {
      return route.abort();
    }
    return route.continue();
  });
  await page.route('**/cgi-bin/wan-observer**', async (route) => {
    expect(route.request().headers()['x-gl-admin-token']).toBe('a'.repeat(32));
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      posts.push(body);
      Object.assign(payload.collector.config, body);
      await route.fulfill({ json: { saved: true } });
    } else {
      await route.fulfill({ json: payload });
    }
  });
  return { errors, posts };
}

test('real Vue DOM preserves settings edits, discard confirmation, focus trapping and save', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { errors, posts } = await syntheticApi(page);
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'Testing settings' });
  await expect(dialog).toBeVisible();
  const plan = dialog.getByLabel('Plan download', { exact: true });
  await plan.fill('321');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByText('Discard unsaved changes?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(plan).toHaveValue('321');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('input').first()).toBeFocused();
  await save.click();
  await expect(dialog).not.toBeVisible();
  await expect(settings).toBeFocused();
  expect(posts).toHaveLength(1);
  expect(posts[0].download_mbps).toBe(321);
  await page.screenshot({
    path: info.outputPath('desktop.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('mobile DOM fits viewport and produces actual CSV/PDF downloads', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await syntheticApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export report' });
  await expect(dialog).toBeVisible();
  const csvPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download CSV' }).click();
  const csv = await csvPromise;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  expect(await readFile(await csv.path(), 'utf8')).toContain('download_mbps');
  const pdfPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PDF' }).click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile(await pdf.path())).subarray(0, 4).toString()).toBe(
    '%PDF',
  );
  await page.screenshot({
    path: info.outputPath('mobile-export.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
