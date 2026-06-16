import { test, expect, type Page } from '@playwright/test';

/**
 * Opens a desktop nav dropdown section by its button label, then clicks the
 * destination link inside it. The nav is `hidden md:block`, so this relies on
 * the Desktop Chrome viewport configured in playwright.config.ts.
 */
async function navigateVia(page: Page, section: string, item: string, expectedPath: string) {
  const sectionButton = page.getByRole('button', { name: section, exact: true });
  await expect(sectionButton).toBeVisible();

  // The dropdown is hover-driven (onMouseEnter sets openMenu); hovering is the
  // reliable way to reveal it. A click would only toggle and can race with the
  // document mousedown outside-click handler.
  await sectionButton.hover();

  const link = page.getByRole('link', { name: item, exact: true });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(new RegExp(`${expectedPath.replace('/', '\\/')}(\\?.*)?$`));
}

test.describe('navigation', () => {
  test('자료 · 부서 -> 자료요구 (/docs)', async ({ page }) => {
    await page.goto('/');
    await navigateVia(page, '자료 · 부서', '자료요구', '/docs');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('자료 · 부서 -> 의원명부 (/members)', async ({ page }) => {
    await page.goto('/');
    await navigateVia(page, '자료 · 부서', '의원명부', '/members');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('감사 진행 -> 지적사항 (/issues)', async ({ page }) => {
    await page.goto('/');
    await navigateVia(page, '감사 진행', '지적사항', '/issues');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('종합 현황 -> 감사 일정 (/calendar)', async ({ page }) => {
    await page.goto('/');
    await navigateVia(page, '종합 현황', '감사 일정', '/calendar');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});
