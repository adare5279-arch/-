import { test, expect } from '@playwright/test';

/**
 * P2-3: The two highest-traffic data screens (자료요구 /docs, 지적사항 /issues)
 * were only covered by smoke (which checks chrome + a body <h1>). These tests
 * assert the actual data region resolves to one of its real terminal states:
 * a populated list/table OR a defined empty-state message. A blank body where
 * the fetch silently failed (stuck past loading with neither) would fail here.
 */

test.describe('core data pages', () => {
  test('/docs renders the request list or its empty state', async ({ page }) => {
    await page.goto('/docs');

    // Body heading (scoped to <main> so it is the page's, not TopNav's).
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }).first(),
    ).toBeVisible();

    // Loading indicator must clear.
    await expect(page.getByText('불러오는 중...')).toBeHidden({ timeout: 20_000 });

    // Terminal state: either a result-count summary ("총 N건") with a table,
    // or the explicit "자료요구가 없습니다." empty state.
    await expect(
      page
        .getByText(/총 \d+건/)
        .or(page.getByText('자료요구가 없습니다.')),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('/issues renders the issue list or its empty state', async ({ page }) => {
    await page.goto('/issues');

    await expect(
      page.locator('main').getByRole('heading', { level: 1 }).first(),
    ).toBeVisible();

    await expect(page.getByText('불러오는 중...')).toBeHidden({ timeout: 20_000 });

    // Terminal state: a populated list ("총 N건"), or one of the two empty
    // messages the page can render ("등록된 지적사항이 없습니다." /
    // "검색 조건에 맞는 지적사항이 없습니다.").
    await expect(
      page
        .getByText(/총 \d+건/)
        .or(page.getByText('등록된 지적사항이 없습니다.'))
        .or(page.getByText('검색 조건에 맞는 지적사항이 없습니다.')),
    ).toBeVisible({ timeout: 20_000 });
  });
});
