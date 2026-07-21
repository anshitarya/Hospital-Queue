const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for stuck/failed migrations in _prisma_migrations table...');
  try {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET "rolled_back_at" = NOW() WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`
    );
    console.log(`Cleared ${updated} stuck migration entry/entries.`);
  } catch (err) {
    console.log('Migration check info:', err.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Applying pending migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
