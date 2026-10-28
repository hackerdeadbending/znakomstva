import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 5000
});
try {
  await pool.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
  const version = '001_initial_schema';
  const exists = await pool.query('select 1 from schema_migrations where version=$1', [version]);
  if (exists.rowCount) {
    console.log('Migration already applied:', version);
  } else {
    const sql = await readFile(resolve('db/migrations/001_initial_schema.sql'), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(version) values ($1)', [version]);
      await client.query('commit');
      console.log('Applied migration:', version);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
