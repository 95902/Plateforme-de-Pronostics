import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('🔄 Running migrations...');

  try {
    const migrationPath = join(__dirname, 'migrations', '001_create_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await pool.query(migrationSQL);

    console.log('✅ Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
