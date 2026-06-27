import fs from 'node:fs';
import { Platform, PostStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { createNotification } from './notifications';
import { publishViaMobileRun } from './android-publisher';
import { getDriverForPublish } from './platforms/registry';
import type { PublisherDriver } from './platforms/types';
import { acquireDevicePublishLock, releaseDevicePublishLock } from './device-publish-lock';
import { resolvePublishMapping } from './resolve-account-device';

// ----------------------------------------------------------------------

export const MAX_PUBLISH_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 2 * 60_000; // đăng lại sau 2 phút

export type PublishMode = 'scheduled' | 'manual';

export type ExecutePublishResult = {
  status: 'PUBLISHED' | 'SCHEDULED_EXTERNAL' | 'RETRY' | 'FAILED' | 'SKIPPED';
  message: string;
  attempts?: number;
};

// Quyết định nhạc TikTok cho 1 post:
// - Có tên cụ thể -> dùng tên đó.
// - Random + có list yêu thích (account) -> bốc ngẫu nhiên 1 tên trong list.
// - Random + list rỗng -> để agent tự chọn 1 bài bất kỳ trong tab Yêu thích trên app.
function resolveMusicSelection(post: {
  tiktokMusicName: string | null;
  tiktokRandomMusic: boolean;
  tiktokMuteOriginal: boolean;
  socialAccount?: { tiktokFavoriteMusic?: unknown } | null;
}): { musicName?: string; randomFavorite?: boolean; muteOriginalSound?: boolean } {
  const explicit = (post.tiktokMusicName || '').trim();
  if (explicit) {
    return { musicName: explicit, muteOriginalSound: post.tiktokMuteOriginal };
  }

  if (post.tiktokRandomMusic) {
    const favorites = Array.isArray(post.socialAccount?.tiktokFavoriteMusic)
      ? (post.socialAccount!.tiktokFavoriteMusic as string[]).filter((s) => typeof s === 'string' && s.trim())
      : [];

    if (favorites.length) {
      const picked = favorites[Math.floor(Math.random() * favorites.length)];

      return { musicName: picked.trim(), muteOriginalSound: post.tiktokMuteOriginal };
    }

    // List rỗng -> agent tự chọn bất kỳ trong Favorites trên app.
    return { randomFavorite: true, muteOriginalSound: post.tiktokMuteOriginal };
  }

  return {};
}

// Wrapper: serialize đăng bài theo device (across processes). Bài 2,3,4 trên cùng device
// xếp hàng chờ bài 1 xong mới chạy -> không lẫn lộn automation trên 1 thiết bị.
export async function executePublish(
  postId: string,
  mode: PublishMode,
  opts?: { lockMaxWaitMs?: number }
): Promise<ExecutePublishResult> {
  const ref = await prisma.post.findUnique({ where: { id: postId }, select: { deviceId: true } });

  // Không có device -> để inner trả lỗi phù hợp, không cần khóa.
  if (!ref?.deviceId) return executePublishInner(postId, mode);

  const lock = await acquireDevicePublishLock(ref.deviceId, postId, { maxWaitMs: opts?.lockMaxWaitMs });
  if (!lock.acquired) {
    // Không tới lượt: scheduler (wait=0) bỏ qua, để bài giữ nguyên SCHEDULED -> retry tick sau.
    return { status: 'RETRY', message: 'Thiết bị đang bận đăng bài khác, sẽ thử lại sau.' };
  }

  try {
    return await executePublishInner(postId, mode);
  } finally {
    await releaseDevicePublishLock(ref.deviceId, postId).catch(() => undefined);
  }
}

async function executePublishInner(postId: string, mode: PublishMode): Promise<ExecutePublishResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      device: true,
      socialAccount: true,
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!post) return { status: 'FAILED', message: 'Không tìm thấy bài đăng' };
  if (post.status === PostStatus.PUBLISHED) return { status: 'SKIPPED', message: 'Bài đã đăng' };
  if (post.status === PostStatus.SCHEDULED_EXTERNAL) {
    return { status: 'SKIPPED', message: 'Bài đã được ủy nhiệm app schedule, không cần re-publish' };
  }
  if (!post.device) return { status: 'FAILED', message: 'Bài chưa gắn device để đăng' };
  if (post.device.type !== 'ANDROID_DEVICE') return { status: 'FAILED', message: 'Hiện chỉ đăng tự động qua Android device' };
  if (post.device.locked) return { status: 'SKIPPED', message: 'Device đang bị khóa' };

  if (!post.socialAccountId) return { status: 'FAILED', message: 'Bài chưa gắn account để đăng' };

  // Chọn mapping VERIFIED tất định (ưu tiên role PUBLISHING/PRIMARY) -> tránh đăng nhầm account.
  const mapping = await resolvePublishMapping(post.socialAccountId, post.deviceId!);

  if (!mapping) {
    return {
      status: 'FAILED',
      message: 'Account chưa được xác minh (VERIFIED) trên device này — không thể đăng. Vào Devices > scan lại social login.',
    };
  }

  // Nếu một video gốc đã có biến thể vietsub (externalId `<orig>:vietsub`) trong cùng bài,
  // đăng bản vietsub thay cho bản gốc — KHÔNG push cả hai.
  const supersededExternalIds = new Set(
    post.media
      .map((item) => item.mediaAsset)
      .filter((a) => a?.category === 'vietsub' && a.externalId.endsWith(':vietsub'))
      .map((a) => a!.externalId.slice(0, -':vietsub'.length))
  );

  const mediaHostPaths = post.media
    .filter((item) => {
      const ext = item.mediaAsset?.externalId;
      return !(ext && supersededExternalIds.has(ext));
    })
    .map((item) => item.mediaAsset?.localPath || '')
    .filter((p) => p && fs.existsSync(p));

  const startedAt = new Date();
  const publishMode = post.publishMode || 'gami'; // 'gami' | 'external_tiktok_studio'
  const isExternalSchedule = publishMode === 'external_tiktok_studio';

  // Atomic claim: chỉ chiếm khi đang SCHEDULED -> chống race giữa scheduler và đăng thủ công.
  // Bài DRAFT/APPROVED... (đăng tay) vẫn cho qua, chỉ chặn khi 2 tiến trình tranh cùng bài SCHEDULED.
  if (post.status === PostStatus.SCHEDULED) {
    const claimed = await prisma.post.updateMany({
      where: { id: post.id, status: PostStatus.SCHEDULED },
      data: { status: PostStatus.PUBLISHING },
    });

    if (claimed.count !== 1) {
      return { status: 'SKIPPED', message: 'Bài đã được tiến trình khác xử lý' };
    }
  } else {
    await prisma.post.update({ where: { id: post.id }, data: { status: PostStatus.PUBLISHING } });
  }

  const job = await prisma.jobLog.create({
    data: {
      socialAccountId: post.socialAccountId,
      deviceId: post.deviceId,
      type: `post.publish.${mode}${isExternalSchedule ? '.external' : ''}`,
      status: 'running',
      payload: { postId: post.id, mode, mediaCount: mediaHostPaths.length, publishMode },
      attempts: post.publishAttempts + 1,
      startedAt,
    },
  });

  let result;
  try {
    const detectedName = (mapping as any)?.detectedAccountName || undefined;
    const detectedUrl = (mapping as any)?.detectedAccountUrl || undefined;
    const accountUid =
      typeof detectedName === 'string' && /^\d{5,}$/.test(detectedName) ? detectedName : undefined;
    const platform = post.socialAccount?.platform || Platform.FACEBOOK;
    const profileUrl =
      post.socialAccount?.profileUrl ||
      detectedUrl ||
      (accountUid && platform === Platform.FACEBOOK
        ? `https://www.facebook.com/${accountUid}`
        : undefined);

    // Resolve app cần mở: packageName + androidUserId lưu trong verificationMetadata.
    // FB FANPAGE thường kế thừa parent profile mapping.
    const meta = (mapping as any)?.verificationMetadata || {};
    let packageName: string | undefined = meta.packageName || undefined;
    let androidUserId: string | undefined =
      meta.androidUserId !== undefined ? String(meta.androidUserId) : undefined;

    if ((!packageName || androidUserId === undefined) && meta.parentMappingId) {
      const parent = await prisma.socialAccountDevice.findUnique({
        where: { id: String(meta.parentMappingId) },
      });
      const parentMeta = (parent?.verificationMetadata as any) || {};
      packageName = packageName || parentMeta.packageName || undefined;
      androidUserId =
        androidUserId !== undefined
          ? androidUserId
          : parentMeta.androidUserId !== undefined
            ? String(parentMeta.androidUserId)
            : undefined;
    }

    // KHÔNG fallback mặc định. Tránh đăng nhầm.
    if (!packageName || androidUserId === undefined) {
      await prisma.$transaction([
        prisma.post.update({
          where: { id: post.id },
          data: {
            status: PostStatus.FAILED,
            lastPublishError:
              'Account chưa được gán instance app trên device. Vào trang Device > thẻ account > chọn "Instance đăng bài".',
          },
        }),
        prisma.jobLog.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: 'Account chưa gán instance', finishedAt: new Date() },
        }),
      ]);

      return {
        status: 'FAILED',
        message:
          'Account chưa được gán instance app trên device. Vào trang Device > thẻ account > chọn "Instance đăng bài".',
      };
    }

    // Driver chính xác cho việc đăng: dùng packageName để phân biệt TikTok personal vs Studio.
    const driver: PublisherDriver | null = getDriverForPublish(packageName, platform);
    if (!driver) {
      await prisma.$transaction([
        prisma.post.update({
          where: { id: post.id },
          data: { status: PostStatus.FAILED, lastPublishError: `Chưa hỗ trợ đăng cho platform ${platform}` },
        }),
        prisma.jobLog.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: `Chưa hỗ trợ platform ${platform}`, finishedAt: new Date() },
        }),
      ]);
      return { status: 'FAILED', message: `Chưa hỗ trợ đăng cho platform ${platform}` };
    }

    // Preflight check (driver-specific). Vd TikTok yêu cầu video.
    if (driver.preflightCheck) {
      const pre = driver.preflightCheck({ post: post as any });
      if (!pre.ok) {
        await prisma.$transaction([
          prisma.post.update({
            where: { id: post.id },
            data: { status: PostStatus.FAILED, lastPublishError: pre.message },
          }),
          prisma.jobLog.update({
            where: { id: job.id },
            data: { status: 'failed', errorMessage: pre.message, finishedAt: new Date() },
          }),
        ]);
        return { status: 'FAILED', message: pre.message };
      }
    }

    // External schedule mode (TikTok Studio): cần buildScheduleGoal + scheduledAt.
    if (isExternalSchedule) {
      if (!driver.buildScheduleGoal) {
        const msg = `Driver ${platform}:${packageName} không hỗ trợ built-in schedule.`;
        await prisma.$transaction([
          prisma.post.update({ where: { id: post.id }, data: { status: PostStatus.FAILED, lastPublishError: msg } }),
          prisma.jobLog.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: msg, finishedAt: new Date() } }),
        ]);
        return { status: 'FAILED', message: msg };
      }
      if (!post.scheduledAt) {
        const msg = 'External schedule mode cần scheduledAt nhưng bài chưa có thời điểm.';
        await prisma.$transaction([
          prisma.post.update({ where: { id: post.id }, data: { status: PostStatus.FAILED, lastPublishError: msg } }),
          prisma.jobLog.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: msg, finishedAt: new Date() } }),
        ]);
        return { status: 'FAILED', message: msg };
      }
    }

    result = await publishViaMobileRun({
      driver,
      device: post.device,
      postId: post.id,
      caption: post.caption,
      mediaHostPaths,
      accountName: post.socialAccount?.name,
      detectedAccountName: detectedName,
      profileUrl,
      accountUid,
      isPage:
        post.socialAccount?.type === 'FANPAGE' ||
        post.socialAccount?.type === 'TIKTOK_BUSINESS',
      packageName,
      androidUserId,
      mode: isExternalSchedule ? 'schedule' : 'publish',
      scheduledAt: isExternalSchedule ? (post.scheduledAt ?? undefined) : undefined,
      ...resolveMusicSelection(post),
    });
  } catch (error) {
    result = {
      status: 'ERROR' as const,
      message: error instanceof Error ? error.message : 'Lỗi đăng bài',
      pushedPaths: [],
    };
  }

  const finishedAt = new Date();

  // SUCCESS: đăng ngay
  if (result.status === 'PUBLISHED') {
    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.PUBLISHED,
          publishedAt: finishedAt,
          lastPublishError: null,
          nextPublishAt: null,
          publishAttempts: post.publishAttempts + 1,
        },
      }),
      prisma.postTarget.updateMany({
        where: { postId: post.id },
        data: { status: PostStatus.PUBLISHED, publishedAt: finishedAt, errorMessage: null },
      }),
      prisma.jobLog.update({ where: { id: job.id }, data: { status: 'completed', finishedAt } }),
    ]);

    await createNotification({
      title: 'Đã đăng bài',
      message: post.title,
      category: 'Đăng bài',
      type: 'post.published',
      severity: 'success',
      entity: 'Post',
      entityId: post.id,
      href: post.socialAccountId ? `/dashboard/accounts/${post.socialAccountId}` : undefined,
    }).catch(() => undefined);

    return { status: 'PUBLISHED', message: result.message, attempts: post.publishAttempts + 1 };
  }

  // SUCCESS: external schedule accepted (TikTok Studio sẽ tự đăng sau)
  if (result.status === 'SCHEDULED_EXTERNAL') {
    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.SCHEDULED_EXTERNAL,
          lastPublishError: null,
          nextPublishAt: null,
          publishedAt: null,
          publishAttempts: post.publishAttempts + 1,
        },
      }),
      prisma.postTarget.updateMany({
        where: { postId: post.id },
        data: { status: PostStatus.SCHEDULED_EXTERNAL, errorMessage: null },
      }),
      prisma.jobLog.update({ where: { id: job.id }, data: { status: 'completed', finishedAt } }),
    ]);

    await createNotification({
      title: 'Đã ủy nhiệm app schedule',
      message: `${post.title} — TikTok Studio sẽ tự đăng vào ${post.scheduledAt?.toISOString() || ''}`,
      category: 'Đăng bài',
      type: 'post.scheduledExternal',
      severity: 'info',
      entity: 'Post',
      entityId: post.id,
      href: post.socialAccountId ? `/dashboard/accounts/${post.socialAccountId}` : undefined,
    }).catch(() => undefined);

    return { status: 'SCHEDULED_EXTERNAL', message: result.message, attempts: post.publishAttempts + 1 };
  }

  // MUSIC_NOT_FOUND: không tìm thấy nhạc trong Favorites -> lưu nháp, KHÔNG đăng, không retry.
  if (result.status === 'MUSIC_NOT_FOUND') {
    const musicMsg = `Không tìm thấy nhạc "${post.tiktokMusicName || ''}" trong Yêu thích trên app — đã lưu nháp, chưa đăng.`;
    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.DRAFT, lastPublishError: musicMsg, nextPublishAt: null },
      }),
      prisma.postTarget.updateMany({
        where: { postId: post.id },
        data: { status: PostStatus.DRAFT, errorMessage: musicMsg },
      }),
      prisma.jobLog.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: musicMsg, finishedAt } }),
    ]);

    await createNotification({
      title: 'Chưa đăng — thiếu nhạc',
      message: `${post.title}: ${musicMsg}`,
      category: 'Đăng bài',
      type: 'post.musicNotFound',
      severity: 'warning',
      entity: 'Post',
      entityId: post.id,
      href: post.socialAccountId ? `/dashboard/accounts/${post.socialAccountId}` : undefined,
    }).catch(() => undefined);

    return { status: 'SKIPPED', message: musicMsg };
  }

  // FAIL
  const attempts = post.publishAttempts + 1;
  const isMismatch = result.status === 'ACCOUNT_MISMATCH';
  // External schedule mode: KHÔNG retry tự động (Gami không chủ động hành động lại — admin xử lý).
  const canRetry =
    mode === 'scheduled' && attempts < MAX_PUBLISH_ATTEMPTS && !isMismatch && !isExternalSchedule;
  const nextStatus = canRetry ? PostStatus.SCHEDULED : PostStatus.FAILED;

  await prisma.$transaction([
    prisma.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        publishAttempts: attempts,
        lastPublishError: result.message,
        nextPublishAt: canRetry ? new Date(finishedAt.getTime() + RETRY_DELAY_MS) : null,
      },
    }),
    prisma.postTarget.updateMany({
      where: { postId: post.id },
      data: { status: nextStatus, errorMessage: result.message },
    }),
    prisma.jobLog.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: result.message, finishedAt } }),
  ]);

  if (!canRetry) {
    await createNotification({
      title: 'Đăng bài thất bại',
      message: `${post.title}: ${result.message}`,
      category: 'Đăng bài',
      type: 'post.publishFailed',
      severity: 'error',
      entity: 'Post',
      entityId: post.id,
      href: post.socialAccountId ? `/dashboard/accounts/${post.socialAccountId}` : undefined,
    }).catch(() => undefined);
  }

  return {
    status: canRetry ? 'RETRY' : 'FAILED',
    message: canRetry
      ? `${result.message} — sẽ thử lại lần ${attempts + 1}/${MAX_PUBLISH_ATTEMPTS} sau 2 phút`
      : result.message,
    attempts,
  };
}
