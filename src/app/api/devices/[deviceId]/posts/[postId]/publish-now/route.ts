import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// server
import { createNotification } from 'src/server/notifications';
import { openDevice } from 'src/server/device-adapters';
import { publishFacebookViaBrowser } from 'src/server/facebook-browser-publisher';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
    postId: string;
  };
};

const PublishNowSchema = z.object({
  socialAccountId: z.string().min(1),
});

const publishableStatuses = new Set<PostStatus>([
  PostStatus.DRAFT,
  PostStatus.WAITING_APPROVAL,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHING,
  PostStatus.FAILED,
  PostStatus.CANCELLED,
]);

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = PublishNowSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Cần chọn Social Account để đăng ngay' }, { status: 400 });

  const [device, post, mapping] = await Promise.all([
    prisma.device.findUnique({ where: { id: params.deviceId } }),
    prisma.post.findFirst({
      where: { id: params.postId, deviceId: params.deviceId, deletedAt: null },
      include: { media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.socialAccountDevice.findFirst({
      where: {
        deviceId: params.deviceId,
        socialAccountId: parsed.data.socialAccountId,
        verificationStatus: 'VERIFIED',
      },
    }),
  ]);

  if (!device) return NextResponse.json({ message: 'Không tìm thấy profile/device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Profile đang bị khóa, không thể đăng ngay' }, { status: 400 });
  if (device.type === 'ANDROID_DEVICE' && (device.healthStatus === 'OFFLINE' || device.status === 'DISCONNECTED')) {
    return NextResponse.json(
      { message: 'Device Android đang offline. Bài vẫn có thể ở nháp/lên lịch, nhưng chưa thể đăng ngay.' },
      { status: 409 }
    );
  }
  if (device.status === 'INACTIVE') {
    return NextResponse.json({ message: 'Device đang ngưng kích hoạt, chưa thể đăng ngay.' }, { status: 409 });
  }
  if (!post) return NextResponse.json({ message: 'Không tìm thấy bài nháp trong profile' }, { status: 404 });
  if (!publishableStatuses.has(post.status)) {
    return NextResponse.json({ message: 'Bài đang publish hoặc đã public, không thể đăng lại bằng action này' }, { status: 400 });
  }
  if (!mapping) {
    return NextResponse.json(
      { message: 'Social Account phải được verify trực tiếp trong profile trước khi đăng' },
      { status: 400 }
    );
  }

  const publishStartedAt = new Date();
  const openResult = await openDevice(device);
  const cdpUrl = String((openResult.metadata as any)?.http || '');

  if (!cdpUrl) {
    return NextResponse.json(
      { message: 'MostLogin không trả về CDP endpoint để đăng Facebook thật', metadata: openResult.metadata || {} },
      { status: 400 }
    );
  }

  const mediaPaths = post.media.map((item) => item.mediaAsset.webViewLink).filter(Boolean) as string[];
  const publishResult = await publishFacebookViaBrowser({ cdpUrl, caption: post.caption, mediaPaths });
  const finalStatus = publishResult.status === 'PUBLISHED' ? PostStatus.PUBLISHED : PostStatus.FAILED;
  const publishedAt = publishResult.status === 'PUBLISHED' ? new Date() : null;
  const externalPostId = publishResult.externalPostId || publishResult.publishedUrl || null;
  const publishError = publishResult.status === 'PUBLISHED' ? null : publishResult.message;
  const publishPayload = JSON.parse(JSON.stringify({
    postId: params.postId,
    mediaCount: post.media.length,
    mediaPaths,
    result: publishResult,
    externalPostId,
  }));

  const updated = await prisma.$transaction(async (tx) => {
    await tx.postTarget.deleteMany({ where: { postId: params.postId } });
    await tx.postTarget.create({
      data: {
        postId: params.postId,
        socialAccountId: parsed.data.socialAccountId,
        status: finalStatus,
        externalPostId,
        errorMessage: publishError,
        publishedAt,
      },
    });
    await tx.jobLog.create({
      data: {
        jobId: `publish-now-${params.postId}-${Date.now()}`,
        type: 'post.publishNow',
        status: publishResult.status === 'PUBLISHED' ? 'completed' : 'failed',
        deviceId: params.deviceId,
        socialAccountId: parsed.data.socialAccountId,
        payload: publishPayload,
        attempts: 1,
        startedAt: publishStartedAt,
        finishedAt: new Date(),
        errorMessage: publishError,
      },
    });
    await tx.postVersion.create({
      data: {
        postId: params.postId,
        snapshot: JSON.parse(JSON.stringify({
          action: 'publish-now',
          beforeStatus: post.status,
          afterStatus: finalStatus,
          socialAccountId: parsed.data.socialAccountId,
          deviceId: params.deviceId,
          externalPostId,
          publishResult,
        })),
      },
    });

    return tx.post.update({
      where: { id: params.postId },
      data: {
        socialAccountId: parsed.data.socialAccountId,
        scheduledAt: null,
        status: finalStatus,
      },
      include: {
        createdBy: true,
        socialAccount: true,
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  await createNotification({
    title: publishResult.status === 'PUBLISHED' ? 'Đã đăng bài lên Facebook' : 'Đăng Facebook thất bại',
    message: updated.title,
    category: 'Nội dung',
    type: 'post.publishNow',
    severity: publishResult.status === 'PUBLISHED' ? 'success' : 'error',
    entity: 'Post',
    entityId: updated.id,
    href: `/dashboard/devices/${params.deviceId}`,
    metadata: { deviceId: params.deviceId, socialAccountId: parsed.data.socialAccountId, publishResult },
  });

  return NextResponse.json({
    data: formatPostRow(updated),
    message: publishResult.message,
  });
}
