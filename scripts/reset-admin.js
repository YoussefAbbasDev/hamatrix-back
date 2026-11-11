/**
 * Recovery CLI: resets the single admin account.
 *
 * Use this only if the password was lost. It overwrites the username and
 * password with ADMIN_USERNAME / ADMIN_PASSWORD from .env, clears any lockout
 * and revokes every existing session.
 *
 * Usage:
 *   npm run reset-admin
 *   npm run reset-admin -- --username admin --password 123456
 */
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { env } from '../src/config/env.js';
import { User } from '../src/modules/users/model.js';
import { AuthSession } from '../src/modules/auth/session.model.js';

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

async function main() {
  const username = (readFlag('username') || env.ADMIN_USERNAME).trim().toLowerCase();
  const password = readFlag('password') || env.ADMIN_PASSWORD;
  const displayName = readFlag('display-name') || env.ADMIN_DISPLAY_NAME;

  if (username.length < 3) throw new Error('username must be at least 3 characters');
  if (password.length < 6) throw new Error('password must be at least 6 characters');

  await connectDb();

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await User.findOne().sort({ createdAt: 1 });

  if (existing) {
    existing.username = username;
    existing.passwordHash = passwordHash;
    existing.displayName = displayName;
    existing.status = 'active';
    existing.failedLoginCount = 0;
    existing.lockedUntil = null;
    existing.mustChangePassword = false;
    existing.tokenVersion += 1;
    await existing.save();
    await AuthSession.updateMany(
      { user: existing._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    console.log(`Admin updated. Username: ${username}`);
  } else {
    await User.create({
      username,
      passwordHash,
      displayName,
      mustChangePassword: false,
    });
    console.log(`Admin created. Username: ${username}`);
  }

  console.log('All previous sessions were revoked. Sign in with the new credentials.');
}

main()
  .catch((error) => {
    console.error('reset-admin failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
