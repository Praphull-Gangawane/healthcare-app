import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi } from '../../api/appointments';
import { directoryApi } from '../../api/directory';
import { AppointmentCalendar } from '../../components/AppointmentCalendar';
import { Button, ButtonLink } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { SlotPicker } from '../../components/SlotPicker';
import { StatusBadge } from '../../components/StatusBadge';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { useToast } from '../../hooks/useToast';
import type { Appointment } from '../../types/domain';
import { errorCode, errorMessage, SLOT_UNAVAILABLE_MESSAGE } from '../../utils/errors';
import { formatDateLong, formatTime, isoDayOf } from '../../utils/format';
import { appointmentStatusLabel, appointmentTypeLabel } from '../../utils/labels';

export function RescheduleDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const idem = useIdempotencyKey();
  const [date, setDate] = useState(appt ? isoDayOf(appt.startAt) : '');
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slots = useQuery({ queryKey: ['availability', appt?.doctorId, date], queryFn: () => directoryApi.availability(appt?.doctorId ?? '', date, appt?.type), enabled: !!appt && !!date });
  const m = useMutation({
    mutationFn: () => idem.run(`reschedule:${appt?.id}:${slot}`, (k) => appointmentsApi.reschedule(appt?.id ?? '', slot ?? '', k)),
    onSuccess: (a) => {
      toast.success(`Rescheduled to ${formatDateLong(a.startAt)} at ${formatTime(a.startAt)}.`);
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => {
      setError(errorCode(e) === 'SLOT_UNAVAILABLE' ? SLOT_UNAVAILABLE_MESSAGE : errorMessage(e));
      void slots.refetch();
    },
  });
  return (
    <Modal
      open={!!appt}
      title="Reschedule appointment"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep current time
          </Button>
          <Button variant="primary" disabled={!slot} loading={m.isPending} loadingText="Rescheduling…" onClick={() => m.mutate()}>
            Confirm new time
          </Button>
        </>
      }
    >
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <AppointmentCalendar value={date} onChange={(d) => { setDate(d); setSlot(null); }} />
      <SlotPicker slots={slots.data?.slots} loading={slots.isLoading} error={slots.error} selected={slot} onSelect={(s) => setSlot(s.startAt)} />
    </Modal>
  );
}

export function AppointmentList({ items, onReschedule, onCancel, linkBase }: { items: Appointment[]; onReschedule?: (a: Appointment) => void; onCancel?: (a: Appointment) => void; linkBase: string }) {
  return (
    <ul className="list">
      {items.map((a) => {
        const active = ['BOOKED', 'CONFIRMED'].includes(a.status) && new Date(a.startAt) > new Date();
        return (
          <li key={a.id} className="list-item" data-testid="appointment-row" data-appointment-id={a.id} data-status={a.status}>
            <div className="list-item-main">
              <Link className="list-item-title" to={`${linkBase}/${a.id}`}>
                {formatDateLong(a.startAt)} · {formatTime(a.startAt)}
              </Link>
              <p className="list-item-meta">
                {a.doctor.displayName} · {appointmentTypeLabel[a.type]} · {a.patient.fullName} · <span className="mono">{a.appointmentNumber}</span>
              </p>
            </div>
            <StatusBadge status={a.status} label={appointmentStatusLabel[a.status]} />
            {active && (onReschedule || onCancel) ? (
              <div className="button-row">
                {onReschedule ? (
                  <Button size="sm" variant="secondary" onClick={() => onReschedule(a)}>
                    Reschedule
                  </Button>
                ) : null}
                {onCancel ? (
                  <Button size="sm" variant="danger-outline" onClick={() => onCancel(a)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MyAppointments() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const q = useQuery({ queryKey: ['appointments', 'mine', page], queryFn: () => appointmentsApi.list({ mine: true, page, pageSize: 20 }) });
  const cancel = useMutation({
    mutationFn: (a: Appointment) => appointmentsApi.cancel(a.id, 'Cancelled by patient'),
    onSuccess: () => {
      toast.success('Your appointment has been cancelled.');
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return (
    <div className="page stack">
      <PageHeader title="My appointments" actions={<ButtonLink to="/doctors" variant="primary" icon="plus">Book appointment</ButtonLink>} docTitle="My appointments" />
      <QueryState query={q} isEmpty={(d) => !d.items.length} emptyTitle="No appointments yet" emptyMessage="Book your first appointment to see it here.">
        {(d) => (
          <>
            <AppointmentList items={d.items} linkBase="/portal/appointments" onCancel={setCancelling} onReschedule={setRescheduling} />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
      <ConfirmationDialog
        open={!!cancelling}
        title="Cancel this appointment?"
        message={cancelling ? `${cancelling.doctor.displayName} on ${formatDateLong(cancelling.startAt)} at ${formatTime(cancelling.startAt)}.` : ''}
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        tone="danger"
        loading={cancel.isPending}
        error={cancel.error ? errorMessage(cancel.error) : null}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        onCancel={() => { setCancelling(null); cancel.reset(); }}
      />
      {rescheduling ? <RescheduleDialog appt={rescheduling} onClose={() => setRescheduling(null)} /> : null}
    </div>
  );
}
