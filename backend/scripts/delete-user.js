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

  if (!username) {
    console.error('Usage: node scripts/delete-user.js --username <id>');
    process.exit(1);
  }

  const [result] = await pool.query(
    `
    DELETE FROM users
    WHERE username = ?
    `,
    [username]
  );

  if (result.affectedRows === 0) {
    console.log(`User not found: ${username}`);
  } else {
    console.log(`User deleted: ${username}`);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error('delete-user error:', error.message);
  await pool.end();
  process.exit(1);
});
