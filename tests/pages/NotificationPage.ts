import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class NotificationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/portal/notifications');
    await expect(this.heading('Notification settings')).toBeVisible();
  }

  toggle(channel: 'sms' | 'whatsapp' | 'email') {
    return this.page.getByTestId(`consent-toggle-${channel}`);
  }
}
