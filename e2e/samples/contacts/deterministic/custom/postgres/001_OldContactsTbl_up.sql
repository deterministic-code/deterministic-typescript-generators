-- Legacy contact table imported from an older application; field_mappings in datasource_types.yaml bridge to canonical snake_case.
CREATE TABLE "OldContactsTbl" (
  "CntID" VARCHAR(64) NOT NULL PRIMARY KEY,
  "FirstNm" VARCHAR(128) NOT NULL,
  "LastNm" VARCHAR(128) NOT NULL,
  "EmailAddr" VARCHAR(256),
  "ImpDate" TIMESTAMPTZ
);
