PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paper_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vol INTEGER NOT NULL,
  no INTEGER NOT NULL,
  publish_year INTEGER NOT NULL,
  publish_month INTEGER NOT NULL,
  UNIQUE (vol, no)
);

CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  vol INTEGER NOT NULL,
  no INTEGER NOT NULL,
  authors TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  abstracted_text TEXT,
  pdf_url TEXT,
  FOREIGN KEY (vol, no)
    REFERENCES paper_issues (vol, no)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_papers_vol_no ON papers (vol, no);
CREATE INDEX IF NOT EXISTS idx_papers_title ON papers (title);
CREATE INDEX IF NOT EXISTS idx_papers_authors ON papers (authors);
CREATE INDEX IF NOT EXISTS idx_papers_affiliation ON papers (affiliation);
