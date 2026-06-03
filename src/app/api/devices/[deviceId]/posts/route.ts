import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// server
import { createNotification } from 'src/server/notifications';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const CreateProfilePostSchema = z.object({
  title: z.string().min(1),
  caption: z.string().min(1),
  mediaAssetId: z.string().optional().nullable(),
  socialAccountId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  submitForApproval: z.boolean().default(false),
});

async function ensureDevice(deviceId: string) {
  return prisma.device.findUnique({ where: { id: deviceId } });
}

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.post.findMany({
    where: { deviceId: params.deviceId, deletedAt: null },
    include: {
      createdBy: true,
      socialAccount: true,
      targets: { include: { socialAccount: true } },
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatPostRow) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = CreateProfilePostSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu bài viết trong profile không hợp lệ' }, { status: 400 });
  }

  const [device, user] = await Promise.all([
    ensureDevice(params.deviceId),
    prisma.user.findUnique({ where: { id: auth.user!.sub } }),
  ]);

  if (!device) return NextResponse.json({ message: 'Không tìm thấy profile/device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Profile đang bị khóa, không thể thêm bài viết' }, { status: 400 });
  if (!user) return NextResponse.json({ message: 'Chưa có user để tạo bài viết' }, { status: 409 });

  const status = parsed.data.submitForApproval ? PostStatus.WAITING_APPROVAL : PostStatus.DRAFT;
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;

  if (parsed.data.socialAccountId) {
    const mapping = await prisma.socialAccountDevice.findFirst({
      where: {
        deviceId: params.deviceId,
        socialAccountId: parsed.data.socialAccountId,
        verificationStatus: 'VERIFIED',
      },
    });

    if (!mapping) {
      return NextResponse.json(
        { message: 'Social Account target phải được verify trực tiếp trong profile trước khi gắn vào bài' },
        { status: 400 }
      );
    }
  }

  if (parsed.data.mediaAssetId) {
    const media = await prisma.mediaAsset.findFirst({
      where: { id: parsed.data.mediaAssetId, OR: [{ deviceId: params.deviceId }, { deviceId: null }] },
    });

    if (!media) return NextResponse.json({ message: 'Media không thuộc profile này' }, { status: 400 });
  }

  const post = await prisma.post.create({
    data: {
      deviceId: params.deviceId,
      socialAccountId: parsed.data.socialAccountId || null,
      title: parsed.data.title,
      caption: parsed.data.caption,
      status,
      scheduledAt,
      createdById: user.id,
      media: parsed.data.mediaAssetId ? { create: { mediaAssetId: parsed.data.mediaAssetId } } : undefined,
      targets: parsed.data.socialAccountId
        ? { create: { socialAccountId: parsed.data.socialAccountId, status } }
        : undefined,
      versions: { create: { snapshot: { ...parsed.data, deviceId: params.deviceId } } },
    },
    include: {
      createdBy: true,
      socialAccount: true,
      targets: { include: { socialAccount: true } },
    },
  });

  await createNotification({
    title: 'Draft mới trong profile',
    message: post.title,
    category: 'Nội dung',
    type: 'post.create',
    severity: 'info',
    entity: 'Post',
    entityId: post.id,
    href: `/dashboard/devices/${params.deviceId}`,
    metadata: { deviceId: params.deviceId, status },
  });

  return NextResponse.json({ data: formatPostRow(post) }, { status: 201 });
}
