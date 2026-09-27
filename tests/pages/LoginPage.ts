import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(next?: string) {
    await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    await expect(this.heading('Sign in')).toBeVisible();
  }

  async signIn(email: string, password: string) {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }

  error() {
    return this.page.getByTestId('login-error');
  }

  async logout() {
    await this.page.getByTestId('user-menu').click();
    await this.page.getByTestId('logout-button').click();
  }
}
