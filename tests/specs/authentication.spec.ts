import { test, expect } from '../fixtures/ui.js';
import { LoginPage } from '../pages/LoginPage.js';
import { ACCOUNTS } from '../data/testData.js';

test.describe('authentication (UI)', () => {
  test('valid login lands on the role dashboard; logout returns to sign-in', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(ACCOUNTS.reception.email, ACCOUNTS.reception.password);
    await expect(page).toHaveURL(/\/reception$/);
    await login.logout();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/reception');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('invalid login shows a friendly error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(ACCOUNTS.patient.email, 'Wrong-password-1');
    await expect(login.error()).toContainText('The email or password is incorrect.');
  });

  test('client-side validation for empty fields', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('protected route redirects to sign-in and back after login', async ({ page }) => {
    await page.goto('/portal/prescriptions');
    await expect(page).toHaveURL(/\/login\?next=%2Fportal%2Fprescriptions/);
    await new LoginPage(page).signIn(ACCOUNTS.patient.email, ACCOUNTS.patient.password);
    await expect(page).toHaveURL(/\/portal\/prescriptions$/);
  });

  test('wrong role sees an access-restricted state (UI) while the API also refuses', async ({ loginAs, page }) => {
    await loginAs('patient', '/admin');
    await expect(page.getByTestId('access-denied')).toBeVisible();
    const r = await page.request.get('/api/admin/users');
    expect(r.status()).toBe(403);
  });

  test('session expiry sends the user to sign-in with a message', async ({ loginAs, page }) => {
    await loginAs('reception', '/reception');
    await expect(page.getByRole('heading', { level: 1, name: 'Front desk' })).toBeVisible();
    const csrf = (await page.context().cookies()).find((c) => c.name === 'cf_csrf')?.value ?? '';
    await page.request.post('/api/test/sessions/expire-mine', { headers: { 'X-CSRF-Token': csrf } });
    await page.goto('/reception/appointments');
    await expect(page).toHaveURL(/\/login\?expired=1/);
    await expect(page.getByText('Your session has expired. Please sign in again.')).toBeVisible();
  });
});
