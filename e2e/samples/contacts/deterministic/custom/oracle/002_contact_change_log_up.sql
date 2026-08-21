-- No-PK append-only audit log; target: None means no CRUD is contracted.
CREATE TABLE "contact_change_log" (
  "occurred_at" TIMESTAMP NOT NULL,
  "contact_id" NUMBER(10) NOT NULL,
  "changed_by" VARCHAR2(128) NOT NULL,
  "change_summary" CLOB NOT NULL
);
