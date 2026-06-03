import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { createNotification } from 'src/server/notifications';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const CreateMediaFolderSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['local', 'google_drive', 'r2']),
  externalId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

function formatMediaFolderRow(source: any) {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
    externalId: source.externalId,
    active: source.active,
    status: source.active ? 'ACTIVE' : 'INACTIVE',
    lastSyncAt: source.lastSyncAt ? source.lastSyncAt.toISOString() : '',
    updatedAt: source.updatedAt ? source.updatedAt.toISOString() : '',
  };
}

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.contentSource.findMany({
    where: { deviceId: params.deviceId },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatMediaFolderRow) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = CreateMediaFolderSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu thư mục media không hợp lệ' }, { status: 400 });

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy profile/device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Profile đang bị khóa, không thể thêm thư mục media' }, { status: 400 });

  const row = await prisma.contentSource.create({
    data: {
      deviceId: params.deviceId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      externalId: parsed.data.externalId || `${parsed.data.provider}_${params.deviceId}_${Date.now()}`,
      active: parsed.data.active,
    },
  });

  await createNotification({
    title: 'Thư mục media mới trong profile',
    message: `${row.name} · ${row.provider}`,
    category: 'Media',
    type: 'media.folder.create',
    severity: 'info',
    entity: 'ContentSource',
    entityId: row.id,
    href: `/dashboard/devices/${params.deviceId}`,
    metadata: { deviceId: params.deviceId, provider: row.provider },
  });

  return NextResponse.json({ data: formatMediaFolderRow(row) }, { status: 201 });
}
