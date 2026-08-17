/** The sqlite `CREATE TABLE` set for the demo-backend fixture entities exercised by the createBackendApp m2m suites (user/post/tag plus the `post_tag` and `user_tag` junctions). Shared so each suite layers only its own seeds/indexes on top. */
export const DEMO_BACKEND_TABLE_DDL: readonly string[] = [
  `CREATE TABLE user_type (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT, description TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE post_type (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT, description TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE "user" (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT,
     user_type_id INTEGER REFERENCES user_type(id),
     username TEXT, email TEXT, password_hash TEXT,
     age INTEGER, is_active INTEGER, last_login_at TEXT, avatar BLOB,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE post (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT,
     post_type_id INTEGER REFERENCES post_type(id),
     author_id INTEGER REFERENCES "user"(id),
     title TEXT, body TEXT, published_at TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE post_tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT,
     post_id INTEGER REFERENCES post(id),
     tag_id INTEGER REFERENCES tag(id),
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE user_tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT,
     user_id INTEGER REFERENCES "user"(id),
     tag_id INTEGER REFERENCES tag(id),
     created TEXT, updated TEXT
   )`,
];
