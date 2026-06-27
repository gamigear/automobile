import fs from 'node:fs';
import path from 'node:path';
import PgBoss from 'pg-boss';
import { PostStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { checkSpacing } from './schedule-core';
import { lastPublishTimeForAccount } from './spacing';
import { executePublish } from './publish-post';
import { scanDueDouyinFollows } from './douyin-follow';

// Nạp .env (tsx không auto-load như Next.js).
(() => {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
})();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the worker');
}

const boss = new PgBoss({ connectionString });

// Queue đăng bài: scanner enqueue mỗi bài tới hạn (singletonKey=postId chống trùng),
// handler chạy song song theo device (batchSize), lock device giữ serial trên từng máy.
const PUBLISH_QUEUE = 'post.publish';
const SCAN_INTERVAL_MS = Number(process.env.SCHEDULER_SCAN_MS || 15_000);
const PUBLISH_BATCH_SIZE = Number(process.env.PUBLISH_BATCH_SIZE || 4); // số device chạy song song
const PUBLISH_LOCK_WAIT_MS = Number(process.env.PUBLISH_LOCK_WAIT_MS || 5_000);
const JOB_EXPIRE_SECONDS = Number(process.env.PUBLISH_JOB_EXPIRE_SECONDS || 240); // > thời gian mobilerun
const DEVICE_BUSY_STALE_MS = 15 * 60_000; // khớp stale của device-publish-lock

type PublishJobData = { postId: string };

// Quét các bài tới hạn rồi enqueue. Chỉ enqueue — không đăng trực tiếp.
// singletonKey=postId: nếu bài đã có job đang chờ/đang chạy thì lần gửi này bị bỏ (idempotent).
async function scanAndEnqueue() {
  const now = new Date();
  const due = await prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      deletedAt: null,
      deviceId: { not: null },
      scheduledAt: { lte: now },
      OR: [{ nextPublishAt: null }, { nextPublishAt: { lte: now } }],
    },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true },
  });

  for (const post of due) {
    // eslint-disable-next-line no-await-in-loop
    await boss.send(
      PUBLISH_QUEUE,
      { postId: post.id } satisfies PublishJobData,
      { singletonKey: post.id, retryLimit: 0, expireInSeconds: JOB_EXPIRE_SECONDS }
    );
  }
}

// Đọc rẻ trạng thái bận của device (KHÔNG chiếm lock). True nếu đang bận bởi bài khác & chưa stale.
async function isDeviceBusy(deviceId: string, postId: string): Promise<boolean> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { publishBusyPostId: true, publishBusyAt: true },
  });

  if (!device?.publishBusyPostId) return false;
  if (device.publishBusyPostId === postId) return false;

  const busyAt = device.publishBusyAt?.getTime() ?? 0;

  return Date.now() - busyAt < DEVICE_BUSY_STALE_MS;
}

// Xử lý 1 job đăng. Defer = chỉ return (scanner sẽ enqueue lại chu kỳ sau) -> tránh xung đột singletonKey.
async function handlePublishJob(data: PublishJobData) {
  const now = new Date();
  const post = await prisma.post.findUnique({
    where: { id: data.postId },
    select: { id: true, status: true, deviceId: true, socialAccountId: true, nextPublishAt: true },
  });

  if (!post) return;
  // Không còn tới hạn / đã rời SCHEDULED -> bỏ qua.
  if (post.status !== PostStatus.SCHEDULED) return;
  if (!post.deviceId) return;
  if (post.nextPublishAt && post.nextPublishAt > now) return;

  // Device đang bận đăng bài khác -> để chu kỳ scan sau thử lại (không giữ slot worker).
  if (await isDeviceBusy(post.deviceId, post.id)) return;

  // Giãn cách 30 phút/account (tính cả bài đang PUBLISHING).
  if (post.socialAccountId) {
    const lastTime = await lastPublishTimeForAccount(post.socialAccountId, post.id);
    if (!checkSpacing(lastTime, now).allowed) return;
  }

  const result = await executePublish(post.id, 'scheduled', { lockMaxWaitMs: PUBLISH_LOCK_WAIT_MS });
  console.log(`[scheduler] post ${post.id}: ${result.status} — ${result.message}`);
}

async function registerJobs() {
  await boss.createQueue('drive.syncFolder');
  await boss.createQueue('meta.syncAccounts');
  await boss.createQueue(PUBLISH_QUEUE);

  await boss.work('drive.syncFolder', async ([job]) => {
    console.log('drive.syncFolder', job.id, job.data);
  });

  await boss.work('meta.syncAccounts', async ([job]) => {
    console.log('meta.syncAccounts', job.id, job.data);
  });

  // batchSize = số job lấy mỗi vòng -> chạy song song trên nhiều device. Mỗi job giữ lock device riêng.
  await boss.work<PublishJobData>(PUBLISH_QUEUE, { batchSize: PUBLISH_BATCH_SIZE }, async (jobs) => {
    await Promise.allSettled(
      jobs.map((job) =>
        handlePublishJob(job.data).catch((error) => console.error('[scheduler] job error', job.id, error))
      )
    );
  });
}

async function main() {
  boss.on('error', (error) => console.error(error));

  await boss.start();
  await registerJobs();

  // Vòng quét tự lên lịch (await xong mới hẹn lần kế) -> không chồng tick, không kẹt cờ in-memory.
  const scanLoop = () => {
    scanAndEnqueue()
      .catch((error) => console.error('[scheduler] scan error', error))
      .finally(() => {
        setTimeout(scanLoop, SCAN_INTERVAL_MS);
      });
  };
  scanLoop();

  // Quét user Douyin theo dõi: chạy mỗi giờ, chỉ xử lý follow tới hạn theo cadence (mặc định 1 lần/ngày).
  let scanningFollows = false;
  const runFollowScan = () => {
    if (scanningFollows) return;
    scanningFollows = true;
    scanDueDouyinFollows()
      .catch((error) => console.error('[douyin-follow]', error))
      .finally(() => {
        scanningFollows = false;
      });
  };
  setInterval(runFollowScan, 60 * 60_000);
  runFollowScan(); // chạy 1 lần khi khởi động

  console.log(
    `Gami worker started (scan ${SCAN_INTERVAL_MS}ms, publish batch ${PUBLISH_BATCH_SIZE}, lock wait ${PUBLISH_LOCK_WAIT_MS}ms)`
  );
}

main().catch(async (error) => {
  console.error(error);
  await boss.stop();
  process.exit(1);
});
