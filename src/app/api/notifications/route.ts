import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const CreateNotificationSchema = z.object({
  title: z.string().min(1),
  message: z.string().optional().nullable(),
  category: z.string().optional(),
  type: z.string().optional(),
  severity: z.enum(['info', 'success', 'warning', 'error']).optional(),
  entity: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  href: z.string().optional().nullable(),
});

const PatchNotificationSchema = z.object({
  action: z.enum(['mark_read', 'mark_all_read', 'archive']),
  id: z.string().optional(),
});

function formatNotification(notification: any) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message || '',
    category: notification.category,
    type: notification.type,
    severity: notification.severity,
    entity: notification.entity || '',
    entityId: notification.entityId || '',
    href: notification.href || '',
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    isUnRead: !notification.readAt,
    avatarUrl: null,
  };
}

export async function GET(request: Request) {
  const auth = requireRole(request, 'VIEWER');

  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'active';

  const rows = await prisma.notification.findMany({
    where: {
      archivedAt: status === 'archived' ? { not: null } : null,
      OR: [{ userId: null }, { userId: auth.user?.sub === 'admin' ? null : auth.user?.sub }],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      readAt: null,
      archivedAt: null,
      OR: [{ userId: null }, { userId: auth.user?.sub === 'admin' ? null : auth.user?.sub }],
    },
  });

  return NextResponse.json({ data: rows.map(formatNotification), unreadCount });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = CreateNotificationSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu thông báo không hợp lệ' }, { status: 400 });

  const row = await prisma.notification.create({ data: parsed.data });

  return NextResponse.json({ data: formatNotification(row) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = requireRole(request, 'VIEWER');

  if (auth.error) return auth.error;

  const parsed = PatchNotificationSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu cập nhật thông báo không hợp lệ' }, { status: 400 });

  const scope = { OR: [{ userId: null }, { userId: auth.user?.sub === 'admin' ? null : auth.user?.sub }] };

  if (parsed.data.action === 'mark_all_read') {
    await prisma.notification.updateMany({ where: { ...scope, readAt: null }, data: { readAt: new Date() } });
  }

  if (parsed.data.action === 'mark_read' && parsed.data.id) {
    await prisma.notification.updateMany({ where: { ...scope, id: parsed.data.id }, data: { readAt: new Date() } });
  }

  if (parsed.data.action === 'archive' && parsed.data.id) {
    await prisma.notification.updateMany({ where: { ...scope, id: parsed.data.id }, data: { archivedAt: new Date() } });
  }

  return NextResponse.json({ data: { ok: true } });
}
