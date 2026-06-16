import { test, expect } from '@playwright/test';

const KPI_LABELS = ['총 자료요구', '미제출', '제출완료', '마감임박'];

test.describe('dashboard', () => {
  test('renders KPI cards and export button after loading', async ({ page }) => {
    await page.goto('/');

    // Page heading.
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();

    // Loading indicator should disappear once data is fetched.
    await expect(page.getByText('불러오는 중...')).toBeHidden({ timeout: 20_000 });

    // Four KPI card labels.
    for (const label of KPI_LABELS) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Export-all button.
    await expect(
      page.getByRole('button', { name: /전체 엑셀 다운로드|내보내는 중/ }),
    ).toBeVisible();
  });
});
