import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatMediaRow } from 'src/lib/api-formatters';
// server
import { createNotification } from 'src/server/notifications';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const CreateProfileMediaSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1).default('image/jpeg'),
  provider: z.string().min(1).default('manual'),
  externalId: z.string().optional().nullable(),
  webViewLink: z.string().optional().nullable(),
  thumbnailLink: z.string().optional().nullable(),
  folderName: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  socialAccountId: z.string().optional().nullable(),
});

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.mediaAsset.findMany({
    where: { deviceId: params.deviceId },
    include: { socialAccount: true },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatMediaRow) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = CreateProfileMediaSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu media trong profile không hợp lệ' }, { status: 400 });

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy profile/device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Profile đang bị khóa, không thể thêm media' }, { status: 400 });

  if (parsed.data.socialAccountId) {
    const mapping = await prisma.socialAccountDevice.findFirst({
      where: { deviceId: params.deviceId, socialAccountId: parsed.data.socialAccountId, verificationStatus: 'VERIFIED' },
    });

    if (!mapping) return NextResponse.json({ message: 'Social Account không thuộc profile hoặc chưa verify' }, { status: 400 });
  }

  const row = await prisma.mediaAsset.create({
    data: {
      deviceId: params.deviceId,
      socialAccountId: parsed.data.socialAccountId || null,
      name: parsed.data.name,
      mimeType: parsed.data.mimeType,
      provider: parsed.data.provider,
      externalId: parsed.data.externalId || `profile_${params.deviceId}_${Date.now()}`,
      webViewLink: parsed.data.webViewLink || null,
      thumbnailLink: parsed.data.thumbnailLink || null,
      folderName: parsed.data.folderName || null,
      category: parsed.data.category || null,
    },
    include: { socialAccount: true },
  });

  await createNotification({
    title: 'Media mới trong profile',
    message: row.name,
    category: 'Media',
    type: 'media.create',
    severity: 'info',
    entity: 'MediaAsset',
    entityId: row.id,
    href: `/dashboard/devices/${params.deviceId}`,
    metadata: { deviceId: params.deviceId, folderName: row.folderName, category: row.category },
  });

  return NextResponse.json({ data: formatMediaRow(row) }, { status: 201 });
}
