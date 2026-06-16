import { test, expect, type Page } from '@playwright/test';

const TITLE = '경기도의회 행정사무감사 자료관리';
const BRAND = '행정사무감사 자료관리';

const ROUTES = [
  '/',
  '/calendar',
  '/stats',
  '/docs',
  '/docs/print',
  '/dept',
  '/members',
  '/statements',
  '/meetings',
  '/press',
  '/archive',
  '/issues',
  '/witnesses',
  '/report',
  '/laws',
  '/budget',
  '/settlement',
  '/analysis',
  '/fiscal',
  '/demo',
  '/query',
  '/inquiry', // permanent redirect -> /query; asserts the redirect lands on a real page
  '/search',
  '/history',
];

/**
 * Asserts the Next.js dev error overlay is NOT present on the page.
 *
 * NOTE: In Next.js dev mode a `<nextjs-portal>` host element is ALWAYS present
 * (it hosts the "Open Next.js Dev Tools" button), so its mere existence is not
 * an error. The actual runtime/build error overlay renders a dialog
 * `[data-nextjs-dialog]` and/or specific error text — we assert only on those.
 */
async function expectNoErrorOverlay(page: Page) {
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-nextjs-error-overlay]')).toHaveCount(0);
  await expect(
    page.getByText(/Unhandled Runtime Error|Build Error|Failed to compile/i),
  ).toHaveCount(0);
}

/**
 * console.error patterns that indicate a real *application* bug (React/runtime),
 * as opposed to data/network noise. Only these fail the test.
 *
 * Intentionally NOT included (data-dependent / environmental noise):
 *   - Supabase client errors, "Failed to fetch", "net::ERR_*"
 *   - 4xx/5xx resource load failures, CORS, favicon, etc.
 */
const APP_BUG_PATTERNS: RegExp[] = [
  /hydrat/i, // hydration mismatch ("Hydration failed", "did not match")
  /did not match/i,
  /^Warning:/i, // React dev warnings logged via console.error
  /\bWarning: /i,
  /Unhandled/i,
  /Cannot read propert/i, // "Cannot read properties of undefined"
  /is not a function/i,
  /is not defined/i,
  /Maximum update depth exceeded/i,
  /Each child in a list should have a unique "key"/i,
];

/**
 * Returns the subset of console.error messages that look like genuine app bugs.
 * Network/Supabase noise is filtered out first so it can never trip the gate.
 */
function appBugConsoleErrors(messages: string[]): string[] {
  return messages.filter((text) => {
    const isNoise =
      /failed to fetch/i.test(text) ||
      /net::ERR/i.test(text) ||
      /supabase/i.test(text) ||
      /\b(4\d\d|5\d\d)\b.*(status|resource|response)/i.test(text) ||
      /Failed to load resource/i.test(text) ||
      /the server responded with a status of/i.test(text) ||
      /ERR_/i.test(text);
    if (isNoise) return false;
    return APP_BUG_PATTERNS.some((re) => re.test(text));
  });
}

for (const route of ROUTES) {
  test(`route ${route} loads without crashing`, async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

    // HTTP status should be a success/redirect, never a 4xx/5xx.
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `bad status for ${route}`).toBeLessThan(400);

    // Document title is set globally via root layout metadata.
    await expect(page).toHaveTitle(TITLE);

    // TopNav brand text is rendered on every page (root layout).
    await expect(page.getByText(BRAND, { exact: true }).first()).toBeVisible();

    // ── P1-1: page BODY must render meaningful content, not just chrome ──
    // The root layout wraps page children in <main>. Every page.tsx renders an
    // <h1> as its first body element, so a blank/failed body (children crashed
    // or silently returned null) would NOT show a <main>-scoped <h1>. Scoping to
    // <main> excludes the TopNav so this can't pass on layout chrome alone.
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }).first(),
    ).toBeVisible();

    // No Next.js error overlay.
    await expectNoErrorOverlay(page);

    // ── P1-2: app-bug console.errors fail; data/network noise is ignored ──
    const bugErrors = appBugConsoleErrors(consoleErrors);
    if (consoleErrors.length > 0) {
      // Keep noise visible for debugging without failing the run.
      console.warn(`[${route}] console errors:`, consoleErrors.slice(0, 5));
    }
    expect(
      bugErrors,
      `app-bug console.error on ${route}:\n${bugErrors.join('\n')}`,
    ).toEqual([]);

    // Uncaught page errors are real bugs -> fail.
    expect(pageErrors, `uncaught page errors on ${route}`).toEqual([]);
  });
}
