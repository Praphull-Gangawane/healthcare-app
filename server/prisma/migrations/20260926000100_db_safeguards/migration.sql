-- Database-level safeguards that Prisma schema syntax cannot express.

-- 1) Concurrency-safe booking: at most one active appointment per (doctor, start time, overbook seat).
--    Walk-ins are exempt (they are queued, not slotted). Cancelled/rescheduled rows release the seat.
CREATE UNIQUE INDEX "Appointment_active_slot_key"
  ON "Appointment" ("doctorId", "startAt", "slotSeq")
  WHERE "isWalkIn" = false AND "status" NOT IN ('CANCELLED', 'RESCHEDULED');

-- 2) Append-only tables: audit log and consent history can never be updated or deleted by the app role.
CREATE OR REPLACE FUNCTION cf_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION cf_reject_mutation();

CREATE TRIGGER "NotificationConsent_append_only"
  BEFORE UPDATE OR DELETE ON "NotificationConsent"
  FOR EACH ROW EXECUTE FUNCTION cf_reject_mutation();

-- 3) Finalized prescription versions are immutable. The only permitted update is attaching the
--    generated PDF document id once (NULL -> value).
CREATE OR REPLACE FUNCTION cf_guard_prescription_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PrescriptionVersion rows cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."snapshot"::text IS DISTINCT FROM OLD."snapshot"::text
     OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."prescriptionId" IS DISTINCT FROM OLD."prescriptionId"
     OR NEW."signedById" IS DISTINCT FROM OLD."signedById"
     OR NEW."signatureMethod" IS DISTINCT FROM OLD."signatureMethod"
     OR NEW."amendmentReason" IS DISTINCT FROM OLD."amendmentReason"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."documentId" IS NOT NULL AND NEW."documentId" IS DISTINCT FROM OLD."documentId") THEN
    RAISE EXCEPTION 'Finalized prescription versions are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrescriptionVersion_immutable"
  BEFORE UPDATE OR DELETE ON "PrescriptionVersion"
  FOR EACH ROW EXECUTE FUNCTION cf_guard_prescription_version();

-- 4) Value sanity checks.
ALTER TABLE "DoctorSchedule"
  ADD CONSTRAINT "DoctorSchedule_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT "DoctorSchedule_slotMinutes_check" CHECK ("slotMinutes" > 0 AND "bufferMinutes" >= 0 AND "overbookPerSlot" >= 0);
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_time_check" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "Appointment_slotSeq_check" CHECK ("slotSeq" >= 0);
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_amounts_check" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0 AND "amountPaid" >= 0);
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Vital"
  ADD CONSTRAINT "Vital_value_check" CHECK ("value" >= 0);
ALTER TABLE "DoctorLeave"
  ADD CONSTRAINT "DoctorLeave_range_check" CHECK ("endAt" > "startAt");
