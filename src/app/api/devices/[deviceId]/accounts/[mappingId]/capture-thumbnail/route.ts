import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceAccountRow } from 'src/lib/api-formatters';
// server
import { captureAndroidScreenshot } from 'src/server/device-adapters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
    mappingId: string;
  };
};

async function accountCounts(accountId: string) {
  const [postsCount, scheduledPostsCount, failedPostsCount, mediaCount] = await Promise.all([
    prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null } }),
    prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null, status: 'SCHEDULED' } }),
    prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null, status: 'FAILED' } }),
    prisma.mediaAsset.count({ where: { socialAccountId: accountId } }),
  ]);

  return { postsCount, scheduledPostsCount, failedPostsCount, mediaCount };
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa được cấu hình' }, { status: 500 });

  const mapping = await prisma.socialAccountDevice.findFirst({
    where: {
      id: params.mappingId,
      deviceId: params.deviceId,
    },
    include: {
      device: true,
      socialAccount: true,
    },
  });

  if (!mapping) return NextResponse.json({ message: 'Không tìm thấy account trên device này' }, { status: 404 });

  const captured = await captureAndroidScreenshot(mapping.device, mapping.id).catch((error) => {
    throw new Error(error instanceof Error ? error.message : 'Không thể chụp screenshot Android');
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.socialAccount.update({
      where: { id: mapping.socialAccountId },
      data: { avatarUrl: `${captured.avatarUrl}?v=${Date.now()}` },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
        action: 'deviceAccount.captureThumbnail',
        entity: 'SocialAccountDevice',
        entityId: mapping.id,
        metadata: {
          socialAccountId: mapping.socialAccountId,
          deviceId: mapping.deviceId,
          avatarUrl: captured.avatarUrl,
          bytes: captured.bytes,
        },
      },
    });

    return tx.socialAccountDevice.findUniqueOrThrow({
      where: { id: mapping.id },
      include: { socialAccount: true },
    });
  });

  return NextResponse.json({
    data: formatDeviceAccountRow(updated, await accountCounts(updated.socialAccountId)),
    result: captured,
  });
}
