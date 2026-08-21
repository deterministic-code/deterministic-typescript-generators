-- Legacy contact table imported from an older application; field_mappings in datasource_types.yaml bridge to canonical snake_case.
CREATE TABLE "OldContactsTbl" (
  "CntID" VARCHAR2(64) NOT NULL PRIMARY KEY,
  "FirstNm" VARCHAR2(128) NOT NULL,
  "LastNm" VARCHAR2(128) NOT NULL,
  "EmailAddr" VARCHAR2(256),
  "ImpDate" TIMESTAMP
);
