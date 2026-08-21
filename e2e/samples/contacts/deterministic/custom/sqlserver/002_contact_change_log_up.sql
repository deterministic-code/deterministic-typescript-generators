-- No-PK append-only audit log; target: None means no CRUD is contracted.
CREATE TABLE [contact_change_log] (
  [occurred_at] DATETIME2 NOT NULL,
  [contact_id] INT NOT NULL,
  [changed_by] NVARCHAR(128) NOT NULL,
  [change_summary] NVARCHAR(MAX) NOT NULL
);
