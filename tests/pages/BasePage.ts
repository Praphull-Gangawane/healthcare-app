import { expect, type Locator, type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(readonly page: Page) {}

  heading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { level: 1, name });
  }

  toast(): Locator {
    return this.page.getByTestId('toast');
  }

  async expectToast(text: string | RegExp) {
    await expect(this.page.getByRole('status').or(this.page.getByTestId('toast')).filter({ hasText: text }).first()).toBeVisible();
  }

  async expectNoHorizontalScroll() {
    const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
  }
}

/** Selects the first <option> whose text contains `text` in the select labelled `label`. */
export async function selectOptionContaining(page: Page, label: string, text: string) {
  const select = page.getByLabel(label, { exact: true });
  await expect(select.locator('option', { hasText: text }).first()).toBeAttached();
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}
