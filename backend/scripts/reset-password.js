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
  const oldPassword = args['old-password'];
  const newPassword = args['new-password'];

  if (!username || !oldPassword || !newPassword) {
    console.error('Usage: node scripts/reset-password.js --username <id> --old-password <current-password> --new-password <new-password>');
    process.exit(1);
  }

  const [users] = await pool.query(
    `
    SELECT password_hash
    FROM users
    WHERE username = ?
    LIMIT 1
    `,
    [username]
  );

  if (users.length === 0) {
    console.error(`User not found: ${username}`);
    await pool.end();
    process.exit(1);
  }

  const isCurrentPasswordValid = await bcrypt.compare(oldPassword, users[0].password_hash);
  if (!isCurrentPasswordValid) {
    console.error('Old password is incorrect.');
    await pool.end();
    process.exit(1);
  }

  if (oldPassword === newPassword) {
    console.error('New password must be different from old password.');
    await pool.end();
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  const [result] = await pool.query(
    `
    UPDATE users
    SET password_hash = ?
    WHERE username = ?
    `,
    [hashedPassword, username]
  );

  console.log(`Password reset completed for user: ${username}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('reset-password error:', error.message);
  await pool.end();
  process.exit(1);
});
