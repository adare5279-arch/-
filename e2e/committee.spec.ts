import { test, expect } from '@playwright/test';
import { COMMITTEES } from '../lib/types';

const STORAGE_KEY = 'haengam_committee';
const DEFAULT_COMMITTEE = COMMITTEES[0]; // 의회운영위원회
const TARGET_COMMITTEE = COMMITTEES[3]; // 안전행정위원회 (non-default)

test.describe('committee selection', () => {
  test('changing 위원회 persists to localStorage and survives reload', async ({ page }) => {
    await page.goto('/');

    const select = page.getByLabel('위원회');
    await expect(select).toBeVisible();

    // Default selection comes from COMMITTEES[0].
    await expect(select).toHaveValue(DEFAULT_COMMITTEE);

    // Switch to a non-default committee.
    await select.selectOption(TARGET_COMMITTEE);
    await expect(select).toHaveValue(TARGET_COMMITTEE);

    // localStorage is updated by the CommitteeContext setter.
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY))
      .toBe(TARGET_COMMITTEE);

    // Reload: the stored value should be re-applied to the select.
    await page.reload();
    const selectAfter = page.getByLabel('위원회');
    await expect(selectAfter).toHaveValue(TARGET_COMMITTEE);
  });

  test('changing 위원회 re-fetches dashboard data (KPIs re-render)', async ({ page }) => {
    await page.goto('/');

    // Wait for the initial dashboard load to settle.
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
    await expect(page.getByText('불러오는 중...')).toBeHidden({ timeout: 20_000 });
    // KPI cards present for the default committee.
    await expect(page.getByText('총 자료요구', { exact: true }).first()).toBeVisible();

    // The dashboard header echoes the selected committee as "— <name>".
    // Asserting this proves the page re-rendered against the new committee.
    await expect(page.getByText(`— ${DEFAULT_COMMITTEE}`, { exact: true })).toBeVisible();

    const select = page.getByLabel('위원회');
    await select.selectOption(TARGET_COMMITTEE);

    // useEffect([committee]) flips loading=true (so '불러오는 중...' is shown),
    // then re-fetches and settles. We assert the end state web-first to avoid
    // flakiness on the transient loading flash: the header now reflects the new
    // committee AND the KPI cards are rendered again (loading finished).
    await expect(page.getByText(`— ${TARGET_COMMITTEE}`, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('불러오는 중...')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText('총 자료요구', { exact: true }).first()).toBeVisible();
  });
});
