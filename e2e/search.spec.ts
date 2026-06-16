import { test, expect } from '@playwright/test';

test.describe('global search', () => {
  test('submitting a term navigates to /search?q=<term> and renders search page', async ({ page }) => {
    await page.goto('/');

    const term = '예산';
    const input = page.getByPlaceholder('검색어를 입력하세요.');
    await expect(input.first()).toBeVisible();
    await input.first().fill(term);

    await page.getByRole('button', { name: '검색' }).first().click();

    // URL reflects the encoded term.
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(term)}$`));

    // Search page renders its main heading.
    await expect(page.getByRole('heading', { name: '통합 검색' })).toBeVisible();

    // The header-supplied term is applied to the in-page search box.
    // The search page input is identified by its placeholder text.
    const inPageInput = page.getByPlaceholder(/한 번에 검색하세요/);
    await expect(inPageInput).toBeVisible();
    await expect(inPageInput).toHaveValue(term);

    // P2-1: after the (debounced 300ms) search resolves, the page must show a
    // result summary — either "총 N건" (results found) or the empty-state text.
    // Both are guarded by `searched && !loading`, so seeing either proves the
    // query actually ran and rendered, not just that the box was filled.
    await expect(
      page
        .getByText(/총 \d+건/)
        .or(page.getByText('검색 결과가 없습니다.')),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('submitting an empty term navigates to /search', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '검색' }).first().click();

    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('heading', { name: '통합 검색' })).toBeVisible();
  });
});
