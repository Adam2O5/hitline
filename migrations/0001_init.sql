CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id   TEXT    NOT NULL,
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score >= 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_scores_chart_score ON scores (chart_id, score DESC);

CREATE TABLE challenges (
  code       TEXT    PRIMARY KEY,
  chart_id   TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
