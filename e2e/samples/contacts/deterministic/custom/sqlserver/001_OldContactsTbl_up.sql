-- Legacy contact table imported from an older application; field_mappings in datasource_types.yaml bridge to canonical snake_case.
CREATE TABLE [OldContactsTbl] (
  [CntID] NVARCHAR(64) NOT NULL PRIMARY KEY,
  [FirstNm] NVARCHAR(128) NOT NULL,
  [LastNm] NVARCHAR(128) NOT NULL,
  [EmailAddr] NVARCHAR(256),
  [ImpDate] DATETIME2
);
