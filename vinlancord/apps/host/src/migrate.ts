/**
 * Aplica as migrações do Prisma (prisma/migrations/<nome>/migration.sql) sem o CLI,
 * registrando em "_prisma_migrations" no mesmo formato — compatível com `prisma migrate deploy`.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export async function migrate(connectionString: string, dir: string, log: (m: string) => void = () => {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const done = new Set(
      (await client.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map(
        (r) => r.migration_name,
      ),
    );
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'migration.sql')))
      .map((d) => d.name)
      .sort();
    let applied = 0;
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      log(`Aplicando migração ${name}…`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`,
          [randomUUID(), checksum, name],
        );
        await client.query('COMMIT');
        applied++;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Falha na migração ${name}: ${(e as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.end().catch(() => {});
  }
}
