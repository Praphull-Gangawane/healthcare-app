import { test, expect } from '../fixtures/ui.js';
import { PatientRegistrationPage } from '../pages/PatientRegistrationPage.js';
import { adultDob, uniqueEmail, uniqueLetters, uniqueMobile } from '../utils/factories.js';
import { STRONG_PASSWORD } from '../data/testData.js';

test.describe('patient registration (UI)', () => {
  test('self-registration creates an account and opens the portal', async ({ page }) => {
    const reg = new PatientRegistrationPage(page);
    await reg.goto();
    await reg.fill({ firstName: `Ui${uniqueLetters(6)}`, lastName: `Reg${uniqueLetters(5)}`, dateOfBirth: adultDob(), gender: 'Female', mobile: uniqueMobile().slice(3), email: uniqueEmail('ui'), password: STRONG_PASSWORD });
    await reg.submit();
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Hello/ })).toBeVisible();
  });

  test('validation errors are shown next to fields', async ({ page }) => {
    const reg = new PatientRegistrationPage(page);
    await reg.goto();
    await reg.submit();
    await expect(page.getByText('Enter your first name')).toBeVisible();
    await expect(page.getByText('Enter a 10-digit Indian mobile number')).toBeVisible();
    await expect(page.getByText('You must accept the terms and privacy notice')).toBeVisible();
  });

  test('reception registration detects possible duplicates and never auto-merges', async ({ loginAs, page }) => {
    await loginAs('reception', '/reception/register');
    const first = `Dup${uniqueLetters(6)}`;
    const last = `Case${uniqueLetters(4)}`;
    const dob = adultDob();
    const fill = async () => {
      await page.getByLabel('First name').fill(first);
      await page.getByLabel(/^Last name/).fill(last);
      await page.getByLabel('Date of birth').fill(dob);
      await page.getByLabel('Gender').selectOption('FEMALE');
      await page.getByRole('button', { name: 'Register patient' }).click();
    };
    await fill();
    await expect(page).toHaveURL(/\/reception\/patients\//);
    await page.goto('/reception/register');
    await fill();
    await expect(page.getByTestId('duplicate-candidates')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm new patient' }).click();
    await expect(page).toHaveURL(/\/reception\/patients\//);
  });
});
