import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { directoryApi } from '../../api/directory';
import { appointmentsApi } from '../../api/appointments';
import { Alert } from '../../components/Alert';
import { AppointmentCalendar } from '../../components/AppointmentCalendar';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { SlotPicker } from '../../components/SlotPicker';
import { useAuth } from '../../hooks/useAuth';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { patientsApi } from '../../api/patients';
import type { Appointment, AppointmentType, Slot } from '../../types/domain';
import { errorCode, errorMessage, SLOT_UNAVAILABLE_MESSAGE } from '../../utils/errors';
import { formatDateLong, formatMoney, formatTime, isoDayOf, todayIso } from '../../utils/format';
import { appointmentTypeHint, appointmentTypeLabel } from '../../utils/labels';
import { hasRole } from '../../utils/roles';

const STEPS = ['Visit type', 'Date & time', 'Patient & reason', 'Review', 'Confirmed'];
type Phase = 'idle' | 'checking' | 'reserved' | 'confirming' | 'done';

export function BookingPage() {
  const { doctorId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  const doctor = useQuery({ queryKey: ['doctor', doctorId], queryFn: () => directoryApi.doctor(doctorId) });

  const initialSlot = params.get('slot');
  const [type, setType] = useState<AppointmentType>((params.get('type') as AppointmentType | null) ?? 'IN_PERSON');
  const [date, setDate] = useState(initialSlot ? isoDayOf(initialSlot) : todayIso());
  const [slot, setSlot] = useState<string | null>(initialSlot);
  const [step, setStep] = useState(initialSlot ? 2 : 0);
  const [chosenPatientId, setPatientId] = useState<string | null>(null);
  const patientId = chosenPatientId ?? user?.patientId ?? null;
  const [reason, setReason] = useState(params.get('reason') ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  const slots = useQuery({ queryKey: ['availability', doctorId, date, type], queryFn: () => directoryApi.availability(doctorId, date, type), enabled: step === 1 });
  const dependents = useQuery({ queryKey: ['dependents'], queryFn: patientsApi.dependents, enabled: !!user && hasRole(user, ['PATIENT']) });


  useEffect(() => {
    const next = new URLSearchParams();
    if (slot) next.set('slot', slot);
    if (type !== 'IN_PERSON') next.set('type', type);
    if (reason) next.set('reason', reason);
    setParams(next, { replace: true });
  }, [slot, type, reason, setParams]);

  const patientOptions = [
    ...(user?.patientId ? [{ id: user.patientId, label: `${user.displayName} (myself)` }] : []),
    ...(dependents.data ?? []).filter((d) => d.status === 'ACTIVE').map((d) => ({ id: d.patient.id, label: `${d.patient.fullName} (${d.relationship.toLowerCase().replace(/_/g, ' ')})` })),
  ];
  const next = `/book/${doctorId}?${new URLSearchParams({ ...(slot ? { slot } : {}), ...(type !== 'IN_PERSON' ? { type } : {}) }).toString()}`;

  async function confirm() {
    if (!slot || !patientId) return;
    setError(null);
    const input = { doctorId, patientId, startAt: slot, type, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    try {
      setPhase('checking');
      const hold = await idem.run(`hold:${doctorId}:${slot}:${patientId}`, (k) => appointmentsApi.hold(input, k));
      setPhase('reserved');
      await new Promise((r) => setTimeout(r, 400));
      setPhase('confirming');
      const appt = await idem.run(`confirm:${hold.id}`, (k) => appointmentsApi.confirm(hold.id, input.reason, k));
      setBooked(appt);
      setPhase('done');
      setStep(4);
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err) {
      setPhase('idle');
      if (errorCode(err) === 'SLOT_UNAVAILABLE' || errorCode(err) === 'APPOINTMENT_SLOT_UNAVAILABLE') {
        setError(SLOT_UNAVAILABLE_MESSAGE);
        setSlot(null);
        setStep(1);
        void qc.invalidateQueries({ queryKey: ['availability', doctorId] });
      } else {
        setError(errorMessage(err));
      }
    }
  }

  return (
    <div className="page page-narrow">
      <QueryState query={doctor}>
        {(d) => (
          <div className="stack">
            <PageHeader title={`Book with ${d.displayName}`} subtitle={`${d.specialty} · ${d.departments[0]?.facility.name ?? ''}`} back={{ to: `/doctors/${d.id}`, label: 'Doctor profile' }} docTitle="Book appointment" />
            <ol className="stepper" aria-label="Booking progress">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? 'step' : undefined} data-done={i < step ? 'true' : undefined}>
                  <span aria-hidden="true">{i < step ? <Icon name="check" size={14} /> : i + 1}</span> {s}
                </li>
              ))}
            </ol>
            {error ? (
              <Alert tone="error" testId="booking-error">
                {error}
              </Alert>
            ) : null}

            <section className="card stack" data-testid="booking-step" data-step={step} aria-live="polite">
              {step === 0 ? (
                <>
                  <h2>What kind of visit do you need?</h2>
                  <fieldset className="choice-grid">
                    <legend className="visually-hidden">Visit type</legend>
                    {d.consultationTypes.map((t) => (
                      <label key={t} className="choice">
                        <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
                        <span>
                          <strong>{appointmentTypeLabel[t]}</strong>
                          <span className="small muted"> {appointmentTypeHint[t]}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="small muted">
                    Fee: {formatMoney(type === 'TELECONSULTATION' && d.teleconsultationFee ? d.teleconsultationFee : d.consultationFee)}. For severe or emergency symptoms, do not book online — contact emergency services (112) or go to the nearest emergency department.
                  </p>
                  <div className="button-row">
                    <Button variant="primary" onClick={() => setStep(1)}>
                      Continue
                    </Button>
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <h2>Choose a date and time</h2>
                  <AppointmentCalendar value={date} onChange={(v) => { setDate(v); setSlot(null); }} />
                  <SlotPicker slots={slots.data?.slots} loading={slots.isLoading} error={slots.error} onRetry={() => void slots.refetch()} selected={slot} onSelect={(s: Slot) => setSlot(s.startAt)} />
                  <div className="button-row">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button variant="primary" disabled={!slot} onClick={() => { setError(null); setStep(2); }}>
                      Continue
                    </Button>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                !user ? (
                  <>
                    <h2>Sign in to continue</h2>
                    <p>Your selected time is saved. Sign in or create an account to choose who the appointment is for.</p>
                    <div className="button-row">
                      <ButtonLink variant="primary" to={`/login?next=${encodeURIComponent(next)}`}>
                        Sign in
                      </ButtonLink>
                      <ButtonLink variant="secondary" to={`/register?next=${encodeURIComponent(next)}`}>
                        Create account
                      </ButtonLink>
                    </div>
                  </>
                ) : !hasRole(user, ['PATIENT']) ? (
                  <Alert tone="info">Staff accounts book appointments from the reception workspace. <Link to="/reception/book">Go to reception booking</Link>.</Alert>
                ) : (
                  <>
                    <h2>Who is this appointment for?</h2>
                    <fieldset className="choice-grid">
                      <legend className="visually-hidden">Patient</legend>
                      {patientOptions.map((o) => (
                        <label key={o.id} className="choice">
                          <input type="radio" name="patient" value={o.id} checked={patientId === o.id} onChange={() => setPatientId(o.id)} />
                          <span>{o.label}</span>
                        </label>
                      ))}
                    </fieldset>
                    <p className="small">
                      <Link to="/portal/dependents">Add a family member</Link>
                    </p>
                    <div className="field">
                      <label htmlFor="reason">Reason for visit</label>
                      <p className="hint" id="reason-hint">
                        A few words help the doctor prepare, e.g. “fever and cough for 3 days”.
                      </p>
                      <textarea id="reason" className="textarea" maxLength={500} aria-describedby="reason-hint" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                    <div className="button-row">
                      <Button variant="ghost" onClick={() => setStep(1)}>
                        Back
                      </Button>
                      <Button variant="primary" disabled={!patientId} onClick={() => setStep(3)}>
                        Review booking
                      </Button>
                    </div>
                  </>
                )
              ) : null}

              {step === 3 && slot ? (
                <>
                  <h2>Review your appointment</h2>
                  <dl className="kv booking-summary">
                    <dt>Doctor</dt>
                    <dd>{d.displayName}</dd>
                    <dt>Visit type</dt>
                    <dd>{appointmentTypeLabel[type]}</dd>
                    <dt>Date</dt>
                    <dd>{formatDateLong(slot)}</dd>
                    <dt>Time</dt>
                    <dd>{formatTime(slot)}</dd>
                    <dt>Patient</dt>
                    <dd>{patientOptions.find((o) => o.id === patientId)?.label}</dd>
                    <dt>Location</dt>
                    <dd>{d.departments[0]?.facility.name}</dd>
                    {reason ? (
                      <>
                        <dt>Reason</dt>
                        <dd>{reason}</dd>
                      </>
                    ) : null}
                  </dl>
                  {phase !== 'idle' ? (
                    <p className="booking-status" role="status">
                      <span className="spinner" aria-hidden="true" />{' '}
                      {phase === 'checking' ? 'Checking availability…' : phase === 'reserved' ? 'Slot reserved' : 'Confirming booking…'}
                    </p>
                  ) : null}
                  <div className="button-row">
                    <Button variant="ghost" disabled={phase !== 'idle'} onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button variant="primary" icon="check" loading={phase !== 'idle'} loadingText="Booking…" onClick={() => void confirm()}>
                      Confirm appointment
                    </Button>
                  </div>
                </>
              ) : null}

              {step === 4 && booked ? (
                <div className="confirmation-hero" data-testid="booking-confirmation">
                  <span className="check" aria-hidden="true">
                    <Icon name="checkCircle" size={40} />
                  </span>
                  <h2>Appointment confirmed</h2>
                  <p>
                    Appointment ID: <strong className="appointment-number" data-testid="appointment-number">{booked.appointmentNumber}</strong>
                  </p>
                  <p>
                    {booked.doctor.displayName} · {formatDateLong(booked.startAt)} at {formatTime(booked.startAt)} · {booked.facility.name}
                  </p>
                  <p className="muted small">We’ve sent a confirmation by SMS and WhatsApp to the channels you opted in to. A queue token is issued when you check in at the clinic.</p>
                  <div className="button-row">
                    <ButtonLink variant="primary" to={`/portal/appointments/${booked.id}`}>
                      Add visit details
                    </ButtonLink>
                    <ButtonLink variant="secondary" to="/portal">
                      Go to my dashboard
                    </ButtonLink>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
