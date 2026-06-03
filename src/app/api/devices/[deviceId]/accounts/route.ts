import { NextResponse } from 'next/server';
import { AccountMemberRole, DeviceRole, Platform, SocialAccountType } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceAccountRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const AttachAccountSchema = z.object({
  action: z.literal('attach_existing').default('attach_existing'),
  accountId: z.string().min(1),
  role: z.nativeEnum(DeviceRole).default(DeviceRole.BACKUP),
  isPrimary: z.boolean().default(false),
});

const CreateAccountSchema = z.object({
  action: z.literal('create_account'),
  name: z.string().min(1),
  platform: z.nativeEnum(Platform),
  type: z.nativeEnum(SocialAccountType),
  externalId: z.string().optional().nullable(),
  profileUrl: z.string().optional().nullable(),
  approvalRequired: z.boolean().default(true),
});

const DeviceAccountActionSchema = z.union([CreateAccountSchema, AttachAccountSchema]);

async function accountCounts(accountIds: string[]) {
  const counts = new Map<string, any>();

  await Promise.all(
    accountIds.map(async (accountId) => {
      const [postsCount, scheduledPostsCount, failedPostsCount, mediaCount, lastPublishedTarget] = await Promise.all([
        prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null } }),
        prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null, status: 'SCHEDULED' } }),
        prisma.post.count({ where: { socialAccountId: accountId, deletedAt: null, status: 'FAILED' } }),
        prisma.mediaAsset.count({ where: { socialAccountId: accountId } }),
        prisma.postTarget.findFirst({
          where: { socialAccountId: accountId, publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          select: { publishedAt: true },
        }),
      ]);

      counts.set(accountId, {
        postsCount,
        scheduledPostsCount,
        failedPostsCount,
        mediaCount,
        lastPublishedAt: lastPublishedTarget?.publishedAt,
      });
    })
  );

  return counts;
}

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.socialAccountDevice.findMany({
    where: { deviceId: params.deviceId },
    include: { socialAccount: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });
  const counts = await accountCounts(rows.map((row) => row.socialAccountId));

  return NextResponse.json({
    data: rows.map((row) => formatDeviceAccountRow(row, counts.get(row.socialAccountId))),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = DeviceAccountActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu gắn tài khoản vào device không hợp lệ' }, { status: 400 });
  }

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });
  if (device.locked) {
    return NextResponse.json({ message: 'Device đang bị khóa, không thể gắn hoặc tạo account.' }, { status: 400 });
  }

  const payload = parsed.data;
  const isCreate = payload.action === 'create_account';
  const requestedRole = isCreate ? DeviceRole.PRIMARY : payload.role;
  const role = isCreate || requestedRole === DeviceRole.PRIMARY ? DeviceRole.PRIMARY : requestedRole;
  const isPrimary = isCreate || (!isCreate && payload.isPrimary) || role === DeviceRole.PRIMARY;

  const result = await prisma.$transaction(async (tx) => {
    const account = payload.action === 'create_account'
      ? await tx.socialAccount.create({
          data: {
            name: payload.name,
            platform: payload.platform,
            type: payload.type,
            externalId: payload.externalId || null,
            profileUrl: payload.profileUrl || null,
            approvalRequired: payload.approvalRequired,
          },
        })
      : await tx.socialAccount.findUnique({ where: { id: payload.accountId } });

    if (!account) throw new Error('Không tìm thấy tài khoản');

    if (isPrimary) {
      await tx.socialAccountDevice.updateMany({
        where: { socialAccountId: account.id, isPrimary: true },
        data: { isPrimary: false, role: DeviceRole.BACKUP },
      });
    }

    const mapping = await tx.socialAccountDevice.upsert({
      where: {
        socialAccountId_deviceId_role: {
          socialAccountId: account.id,
          deviceId: params.deviceId,
          role,
        },
      },
      update: {
        role,
        isPrimary,
      },
      create: {
        socialAccountId: account.id,
        deviceId: params.deviceId,
        role,
        isPrimary,
      },
      include: { socialAccount: true },
    });

    if (isCreate && auth.user?.sub && auth.user.sub !== 'admin') {
      await tx.socialAccountMember.upsert({
        where: { socialAccountId_userId: { socialAccountId: account.id, userId: auth.user.sub } },
        update: { role: AccountMemberRole.OWNER },
        create: { socialAccountId: account.id, userId: auth.user.sub, role: AccountMemberRole.OWNER },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
        action: isCreate ? 'deviceAccount.createAccountOnDevice' : 'deviceAccount.attach',
        entity: 'SocialAccountDevice',
        entityId: mapping.id,
        metadata: {
          socialAccountId: account.id,
          deviceId: params.deviceId,
          role: mapping.role,
          isPrimary: mapping.isPrimary,
        },
      },
    });

    return mapping;
  });

  const counts = await accountCounts([result.socialAccountId]);

  return NextResponse.json({ data: formatDeviceAccountRow(result, counts.get(result.socialAccountId)) }, { status: 201 });
}
