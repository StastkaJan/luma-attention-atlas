CREATE TABLE IF NOT EXISTS luma_tasks_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL CHECK (length(owner) BETWEEN 3 AND 254),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  time TEXT NOT NULL CHECK (time GLOB '[0-2][0-9]:[0-5][0-9]'),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 1440),
  tone TEXT NOT NULL CHECK (tone IN ('coral', 'blue', 'moss')),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 10000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS luma_tasks_v2_owner_date_time_idx
  ON luma_tasks_v2 (owner, date, time, created_at);
