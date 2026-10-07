-- INTEGER PRIMARY KEY bez AUTOINCREMENT nadal nadaje id = max(id) + 1, więc kolejność remisów (id ASC)
-- jest zachowana, a zapis nie aktualizuje sqlite_sequence (1 zapisany wiersz mniej na wynik).
CREATE TABLE scores_new (
  id         INTEGER PRIMARY KEY,
  chart_id   TEXT    NOT NULL,
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score >= 0),
  created_at INTEGER NOT NULL
);

INSERT INTO scores_new (id, chart_id, player, score, created_at)
  SELECT id, chart_id, player, score, created_at FROM scores;

DROP TABLE scores;

ALTER TABLE scores_new RENAME TO scores;

CREATE INDEX idx_scores_chart_score ON scores (chart_id, score DESC);
