import pool from '../config/database.js';
import { runMigrations } from './migrator.js';

async function main() {
  console.log('🔄 Running migrations...');

  try {
    const applied = await runMigrations(pool);
    for (const name of applied) {
      console.log(`   ✔ ${name}`);
    }
    console.log(applied.length > 0 ? `✅ ${applied.length} migration(s) applied` : '✅ Database is up to date');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
