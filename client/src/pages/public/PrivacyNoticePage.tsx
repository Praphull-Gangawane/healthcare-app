import { Alert } from '../../components/Alert';
import { PageHeader } from '../../components/PageHeader';
import { useConfig } from '../../hooks/useConfig';

export function PrivacyNoticePage() {
  const { appName } = useConfig();
  return (
    <div className="page page-narrow stack">
      <PageHeader title="Privacy notice" docTitle="Privacy notice" />
      <Alert tone="warning" title="Placeholder — requires legal review">
        This notice is a template for demonstration. The deploying organisation must replace it with a notice reviewed by qualified counsel for the Digital Personal Data Protection Act, 2023 and applicable rules.
      </Alert>
      <section className="card stack-sm">
        <h2>What we collect</h2>
        <p>{appName} processes identity and contact details, appointment information and the health records your care team creates, only to provide and coordinate your care.</p>
        <h2>Your choices</h2>
        <p>You control SMS, WhatsApp and email updates in Notification settings. You can export your data, ask for corrections, or ask to deactivate your account from “Privacy &amp; my data”. Some medical records must be retained by law and cannot be deleted on request.</p>
        <h2>Who can see your records</h2>
        <p>Access is limited by role: your treating doctors and nurses see clinical records; reception sees contact and scheduling details; billing staff see invoices. Every access to your record is logged.</p>
      </section>
    </div>
  );
}
