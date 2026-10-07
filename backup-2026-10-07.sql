PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_init.sql','2026-10-07 07:06:41');
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id   TEXT    NOT NULL,
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score >= 0),
  created_at INTEGER NOT NULL
);
INSERT INTO "scores" ("id","chart_id","player","score","created_at") VALUES(1,'demo-01','Aaa',3780,1791357404787);
CREATE TABLE challenges (
  code       TEXT    PRIMARY KEY,
  chart_id   TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',1);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('scores',2);
CREATE INDEX idx_scores_chart_score ON scores (chart_id, score DESC);
