-- No-PK append-only audit log; target: None means no CRUD is contracted.
CREATE TABLE "contact_change_log" (
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "contact_id" INTEGER NOT NULL,
  "changed_by" VARCHAR(128) NOT NULL,
  "change_summary" TEXT NOT NULL
);
