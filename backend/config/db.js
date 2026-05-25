import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbFilePath = process.env.DB_FILE
  ? path.resolve(rootDir, process.env.DB_FILE)
  : path.resolve(rootDir, 'data/kdbc.sqlite');

fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const sqlite = new Database(dbFilePath);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');

function ensureSchema() {
  const usersTable = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).get();

  if (usersTable) return;

  const schemaPath = path.resolve(rootDir, '../database/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  sqlite.exec(schemaSql);
}

ensureSchema();

function normalizeSelectRows(rows) {
  return rows.map((row) => {
    const normalized = { ...row };
    for (const [key, value] of Object.entries(normalized)) {
      if (typeof value === 'bigint') {
        normalized[key] = Number(value);
      }
    }
    return normalized;
  });
}

const pool = {
  async query(sql, params = []) {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA')) {
      const stmt = sqlite.prepare(trimmed);
      const rows = stmt.all(params);
      return [normalizeSelectRows(rows)];
    }

    const stmt = sqlite.prepare(trimmed);
    const info = stmt.run(params);
    return [{
      affectedRows: info.changes,
      insertId: Number(info.lastInsertRowid || 0),
    }];
  },

  async end() {
    sqlite.close();
  },
};

export default pool;
