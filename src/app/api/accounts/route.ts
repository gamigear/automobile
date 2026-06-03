import { NextResponse } from 'next/server';
import { DeviceRole, Platform, SocialAccountType } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatAccountRow } from 'src/lib/api-formatters';
// data
import { socialAccounts } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const CreateAccountSchema = z.object({
  action: z.literal('create_account').optional(),
  name: z.string().min(1),
  platform: z.nativeEnum(Platform),
  type: z.nativeEnum(SocialAccountType),
  externalId: z.string().optional().nullable(),
  profileUrl: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  primaryDeviceId: z.string().min(1),
  approvalRequired: z.boolean().optional(),
  defaultTimezone: z.string().optional(),
});

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: socialAccounts });

  const rows = await prisma.socialAccount.findMany({
    include: {
      devices: {
        include: {
          device: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: rows.map(formatAccountRow) });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({ action: 'sync_meta' }));

  if (!process.env.DATABASE_URL) {
    if (body.action === 'create_account') {
      return NextResponse.json(
        {
          data: {
            id: `account_${Date.now()}`,
            name: body.name,
            platform: body.platform,
            type: body.type,
            primaryDevice: body.primaryDeviceId,
            status: 'Đã kết nối',
            tokenStatus: 'Hợp lệ',
            approvalRequired: body.approvalRequired ? 'Bật' : 'Tắt',
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json({ data: { type: 'meta.syncAccounts', status: 'pending' } }, { status: 201 });
  }

  if (body.action === 'create_account') {
    const parsed = CreateAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: 'Dữ liệu tài khoản không hợp lệ' }, { status: 400 });
    }

    const device = await prisma.device.findUnique({ where: { id: parsed.data.primaryDeviceId } });

    if (!device) return NextResponse.json({ message: 'Primary device không tồn tại' }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: auth.user?.sub || '' } });
    const account = await prisma.socialAccount.create({
      data: {
        name: parsed.data.name,
        platform: parsed.data.platform,
        type: parsed.data.type,
        externalId: parsed.data.externalId || null,
        profileUrl: parsed.data.profileUrl || null,
        avatarUrl: parsed.data.avatarUrl || null,
        approvalRequired: parsed.data.approvalRequired ?? true,
        defaultTimezone: parsed.data.defaultTimezone || 'Asia/Ho_Chi_Minh',
        devices: {
          create: {
            deviceId: device.id,
            role: DeviceRole.PRIMARY,
            isPrimary: true,
          },
        },
        members: user
          ? {
              create: {
                userId: user.id,
                role: 'OWNER',
              },
            }
          : undefined,
      },
      include: {
        devices: {
          include: {
            device: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user?.id,
        action: 'socialAccount.create',
        entity: 'SocialAccount',
        entityId: account.id,
        metadata: {
          primaryDeviceId: device.id,
          platform: account.platform,
          type: account.type,
        },
      },
    });

    return NextResponse.json({ data: formatAccountRow(account) }, { status: 201 });
  }

  const job = await prisma.jobLog.create({
    data: {
      type: 'meta.syncAccounts',
      status: 'pending',
      payload: {
        reason: 'manual_dashboard_request',
      },
    },
  });

  return NextResponse.json({ data: job }, { status: 201 });
}
