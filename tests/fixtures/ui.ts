import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test as apiTest } from './index.js';
import { ACCOUNTS, type Role } from '../data/testData.js';

export interface UiFixtures {
  /** Signs the page in as a seeded role via the API (sets httpOnly cookies in the browser context). */
  loginAs: (role: Role, landing?: string) => Promise<Page>;
  /** Runs axe (WCAG 2.1 A/AA) on the current page and fails on serious/critical violations. */
  checkA11y: (label: string) => Promise<void>;
}

export const test = apiTest.extend<UiFixtures>({
  loginAs: async ({ page }, use) => {
    await use(async (role, landing) => {
      const acct = ACCOUNTS[role];
      const res = await page.request.post('/api/auth/login', { data: { email: acct.email, password: acct.password } });
      expect(res.status(), await res.text()).toBe(200);
      if (landing) await page.goto(landing);
      return page;
    });
  },
  checkA11y: async ({ page }, use) => {
    await use(async (label) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(summary, `axe violations on ${label}`).toEqual([]);
    });
  },
});

export { expect };
