import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://vinlancord:vinlancord_dev@localhost:5432/vinlancord_test';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  rmSync('./data/test-uploads', { recursive: true, force: true });
}
