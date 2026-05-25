import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pool from '../config/db.js';

dotenv.config();

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const value = argv[index + 1];
    args[key] = value;
    index += 1;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username;
  const password = args.password;
  const role = args.role || 'user';
  const approved = Number(args.approved ?? 1) === 1 ? 1 : 0;

  if (!username || !password) {
    console.error('Usage: node scripts/create-user.js --username <id> --password <pw> [--approved 1]');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await pool.query(
    `
    INSERT INTO users (username, password_hash, role, approved)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      role = excluded.role,
      approved = excluded.approved
    `,
    [username, hashedPassword, role, approved]
  );

  console.log(`User upserted: ${username} (approved=${approved}, role=${role})`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('create-user error:', error.message);
  await pool.end();
  process.exit(1);
});
