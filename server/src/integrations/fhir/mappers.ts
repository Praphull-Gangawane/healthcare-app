/**
 * Internal domain → FHIR R4 mapping layer. The core database is NOT a FHIR store; resources are
 * produced on demand for interoperability (e.g., future ABDM health-information exchange).
 * Profiles (e.g., NRCeS/ABDM FHIR IG) must be validated before any production exchange.
 */
type Json = Record<string, unknown>;

const ref = (type: string, id: string) => ({ reference: `${type}/${id}` });
const LOINC: Record<string, { code: string; display: string }> = {
  HEART_RATE: { code: '8867-4', display: 'Heart rate' },
  BLOOD_PRESSURE: { code: '85354-9', display: 'Blood pressure panel' },
  RESPIRATORY_RATE: { code: '9279-1', display: 'Respiratory rate' },
  TEMPERATURE: { code: '8310-5', display: 'Body temperature' },
  OXYGEN_SATURATION: { code: '59408-5', display: 'Oxygen saturation by pulse oximetry' },
  HEIGHT: { code: '8302-2', display: 'Body height' },
  WEIGHT: { code: '29463-7', display: 'Body weight' },
  BMI: { code: '39156-5', display: 'Body mass index' },
};

export function toFhirPatient(p: { id: string; uhid: string; firstName: string; lastName: string | null; gender: string; dateOfBirth: Date; mobile: string | null; email: string | null }): Json {
  return {
    resourceType: 'Patient',
    id: p.id,
    identifier: [{ system: 'urn:careflow:uhid', value: p.uhid }],
    name: [{ given: [p.firstName], family: p.lastName ?? undefined }],
    gender: ({ FEMALE: 'female', MALE: 'male', OTHER: 'other' } as Record<string, string>)[p.gender] ?? 'unknown',
    birthDate: p.dateOfBirth.toISOString().slice(0, 10),
    telecom: [...(p.mobile ? [{ system: 'phone', value: p.mobile }] : []), ...(p.email ? [{ system: 'email', value: p.email }] : [])],
  };
}

export function toFhirPractitioner(d: { id: string; displayName: string; registrationNumber: string | null; qualifications: string }): Json {
  return {
    resourceType: 'Practitioner',
    id: d.id,
    name: [{ text: d.displayName }],
    identifier: d.registrationNumber ? [{ system: 'urn:careflow:medical-registration', value: d.registrationNumber }] : [],
    qualification: [{ code: { text: d.qualifications } }],
  };
}

export function toFhirEncounter(e: { id: string; patientId: string; doctorId: string; status: string; startedAt: Date; completedAt: Date | null }): Json {
  return {
    resourceType: 'Encounter',
    id: e.id,
    status: e.status === 'COMPLETED' ? 'finished' : e.status === 'CANCELLED' ? 'cancelled' : 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: ref('Patient', e.patientId),
    participant: [{ individual: ref('Practitioner', e.doctorId) }],
    period: { start: e.startedAt.toISOString(), end: e.completedAt?.toISOString() },
  };
}

export function toFhirObservation(v: { id: string; patientId: string; encounterId: string | null; type: string; value: unknown; value2: unknown; unit: string; measuredAt: Date; source: string }): Json {
  const code = LOINC[v.type] ?? { code: 'unknown', display: v.type };
  const base: Json = {
    resourceType: 'Observation',
    id: v.id,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
    code: { coding: [{ system: 'http://loinc.org', ...code }] },
    subject: ref('Patient', v.patientId),
    encounter: v.encounterId ? ref('Encounter', v.encounterId) : undefined,
    effectiveDateTime: v.measuredAt.toISOString(),
    device: v.source === 'MANUAL' ? undefined : { display: v.source },
  };
  if (v.type === 'BLOOD_PRESSURE') {
    base.component = [
      { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: Number(v.value), unit: v.unit } },
      { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: Number(v.value2), unit: v.unit } },
    ];
  } else {
    base.valueQuantity = { value: Number(v.value), unit: v.unit };
  }
  return base;
}

export function toFhirCondition(d: { id: string; patientId: string; encounterId: string; description: string; code: string | null; codeSystem: string; type: string }): Json {
  return {
    resourceType: 'Condition',
    id: d.id,
    subject: ref('Patient', d.patientId),
    encounter: ref('Encounter', d.encounterId),
    verificationStatus: { coding: [{ code: d.type === 'PROVISIONAL' || d.type === 'DIFFERENTIAL' ? 'provisional' : 'confirmed' }] },
    code: { text: d.description, coding: d.code ? [{ system: d.codeSystem === 'ICD10' ? 'http://hl7.org/fhir/sid/icd-10' : `urn:careflow:${d.codeSystem}`, code: d.code }] : [] },
  };
}

export function toFhirAllergy(a: { id: string; patientId: string; substance: string; severity: string }): Json {
  return { resourceType: 'AllergyIntolerance', id: a.id, patient: ref('Patient', a.patientId), code: { text: a.substance }, criticality: a.severity === 'SEVERE' ? 'high' : 'low' };
}

export function toFhirMedicationRequests(rx: { id: string; patientId: string; doctorId: string; encounterId: string; createdAt: Date }, items: { medicineName: string; strength: string | null; dose: string; route: string; frequency: string; durationDays: number; instructions: string | null }[]): Json[] {
  return items.map((it, i) => ({
    resourceType: 'MedicationRequest',
    id: `${rx.id}-${i + 1}`,
    status: 'active',
    intent: 'order',
    subject: ref('Patient', rx.patientId),
    requester: ref('Practitioner', rx.doctorId),
    encounter: ref('Encounter', rx.encounterId),
    authoredOn: rx.createdAt.toISOString(),
    medicationCodeableConcept: { text: `${it.medicineName}${it.strength ? ` ${it.strength}` : ''}` },
    dosageInstruction: [{ text: `${it.dose} ${it.frequency} for ${it.durationDays} days${it.instructions ? ` — ${it.instructions}` : ''}`, route: { text: it.route } }],
  }));
}

export function toFhirDiagnosticReport(o: { id: string; patientId: string; orderNumber: string; status: string; verifiedAt: Date | null; investigation: { code: string; name: string } }, results: { id: string; parameterName: string; valueNumeric: unknown; valueText: string | null; unit: string | null }[]): Json[] {
  const observations = results.map((r) => ({
    resourceType: 'Observation',
    id: r.id,
    status: 'final',
    code: { text: r.parameterName },
    subject: ref('Patient', o.patientId),
    ...(r.valueNumeric !== null ? { valueQuantity: { value: Number(r.valueNumeric), unit: r.unit ?? undefined } } : { valueString: r.valueText }),
  }));
  return [
    {
      resourceType: 'DiagnosticReport',
      id: o.id,
      identifier: [{ system: 'urn:careflow:order', value: o.orderNumber }],
      status: o.status === 'VERIFIED' ? 'final' : 'preliminary',
      code: { text: o.investigation.name, coding: [{ system: 'urn:careflow:investigation', code: o.investigation.code }] },
      subject: ref('Patient', o.patientId),
      issued: o.verifiedAt?.toISOString(),
      result: observations.map((ob) => ref('Observation', ob.id)),
    },
    ...observations,
  ];
}

export function toFhirAppointment(a: { id: string; patientId: string; doctorId: string; status: string; startAt: Date; endAt: Date }): Json {
  const map: Record<string, string> = { HELD: 'pending', BOOKED: 'booked', CONFIRMED: 'booked', CHECKED_IN: 'checked-in', WAITING: 'arrived', IN_CONSULTATION: 'arrived', COMPLETED: 'fulfilled', CANCELLED: 'cancelled', RESCHEDULED: 'cancelled', NO_SHOW: 'noshow' };
  return { resourceType: 'Appointment', id: a.id, status: map[a.status] ?? 'proposed', start: a.startAt.toISOString(), end: a.endAt.toISOString(), participant: [{ actor: ref('Patient', a.patientId), status: 'accepted' }, { actor: ref('Practitioner', a.doctorId), status: 'accepted' }] };
}

export function toFhirDocumentReference(d: { id: string; patientId: string; title: string; mimeType: string; createdAt: Date; type: string }): Json {
  return { resourceType: 'DocumentReference', id: d.id, status: 'current', type: { text: d.type }, subject: ref('Patient', d.patientId), date: d.createdAt.toISOString(), description: d.title, content: [{ attachment: { contentType: d.mimeType, title: d.title } }] };
}

export const bundle = (resources: Json[]): Json => ({ resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), entry: resources.map((resource) => ({ resource })) });
