import PgBoss from 'pg-boss';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the worker');
}

const boss = new PgBoss({ connectionString });

async function registerJobs() {
  await boss.work('drive.syncFolder', async ([job]) => {
    console.log('drive.syncFolder', job.id, job.data);
  });

  await boss.work('meta.syncAccounts', async ([job]) => {
    console.log('meta.syncAccounts', job.id, job.data);
  });

  await boss.work('post.publishTarget', async ([job]) => {
    console.log('post.publishTarget', job.id, job.data);
  });
}

async function main() {
  boss.on('error', (error) => console.error(error));

  await boss.start();
  await registerJobs();

  console.log('Gami worker started');
}

main().catch(async (error) => {
  console.error(error);
  await boss.stop();
  process.exit(1);
});
