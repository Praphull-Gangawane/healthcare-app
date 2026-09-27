import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { Button } from '../../components/Button';
import { CheckboxField, TextField, TextareaField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import type { OrgSettings } from '../../types/domain';
import { errorMessage } from '../../utils/errors';

export function AdminSettings() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: adminApi.settings });
  const [edited, setV] = useState<OrgSettings | null>(null);
  const v = edited ?? q.data ?? null;
  const save = useMutation({ mutationFn: () => adminApi.updateSettings(v ?? {}), onSuccess: () => toast.success('Settings saved.'), onError: (e) => toast.error(errorMessage(e)) });
  const num = (k: keyof OrgSettings, label: string) => v && <TextField label={label} type="number" value={String(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />;
  return (
    <div className="page stack">
      <PageHeader title="Settings" docTitle="Settings" />
      <QueryState query={q}>
        {() =>
          v ? (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <div className="form-grid">
                {num('bookingHorizonDays', 'Booking horizon (days)')}
                {num('minBookingLeadMinutes', 'Minimum booking lead time (minutes)')}
                {num('holdMinutes', 'Slot hold time (minutes)')}
                {num('cancellationWindowHours', 'Online cancellation closes (hours before)')}
                {num('rescheduleWindowHours', 'Online rescheduling closes (hours before)')}
                {num('reminderLeadHours', 'Reminder lead time (hours)')}
              </div>
              <TextareaField label="Review message (out-of-range measurements)" value={v.reviewMessage} onChange={(e) => setV({ ...v, reviewMessage: e.target.value })} />
              <TextareaField label="Emergency guidance" hint="Jurisdiction-specific wording must be approved by your clinical governance." value={v.emergencyMessage} onChange={(e) => setV({ ...v, emergencyMessage: e.target.value })} />
              <TextareaField label="Prescription footer" value={v.prescriptionFooter} onChange={(e) => setV({ ...v, prescriptionFooter: e.target.value })} />
              <CheckboxField label="Release verified lab reports to patients automatically" checked={v.autoReleaseLabReports} onChange={(e) => setV({ ...v, autoReleaseLabReports: e.target.checked })} />
              <div>
                <Button type="submit" variant="primary" loading={save.isPending}>
                  Save settings
                </Button>
              </div>
            </form>
          ) : null
        }
      </QueryState>
    </div>
  );
}
