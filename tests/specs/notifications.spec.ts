import { test, expect } from '../fixtures/ui.js';
import { NotificationPage } from '../pages/NotificationPage.js';
import { registerPortalUser } from '../utils/factories.js';

test.describe('notification preferences (UI)', () => {
  test('patient opts out of SMS and opts in to WhatsApp explicitly; history is recorded', async ({ page }) => {
    const me = await registerPortalUser({ consents: { sms: true, whatsapp: false, email: false } });
    await page.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    const n = new NotificationPage(page);
    await n.goto();
    await expect(n.toggle('sms')).toBeChecked();
    await expect(n.toggle('whatsapp')).not.toBeChecked();
    await n.toggle('sms').click();
    await expect(n.toggle('sms')).not.toBeChecked();
    await n.toggle('whatsapp').click();
    await expect(n.toggle('whatsapp')).toBeChecked();
    await page.reload();
    await expect(n.toggle('sms')).not.toBeChecked();
    await expect(n.toggle('whatsapp')).toBeChecked();
    await page.getByText('Consent history').click();
    await expect(page.getByText(/WHATSAPP · Opted in · via portal/)).toBeVisible();
  });
});
