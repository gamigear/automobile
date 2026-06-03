import { NextResponse } from 'next/server';
import { DeviceRole } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

const AssignDeviceSchema = z.object({
  deviceId: z.string().min(1),
  role: z.nativeEnum(DeviceRole).default(DeviceRole.BACKUP),
  isPrimary: z.boolean().default(false),
});

function formatAccountDevice(mapping: any) {
  return formatDeviceRow({
    ...mapping.device,
    accountMapping: mapping,
    accounts: [
      {
        ...mapping,
        socialAccount: mapping.socialAccount,
      },
    ],
  });
}

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.socialAccountDevice.findMany({
    where: { socialAccountId: params.accountId },
    include: {
      device: true,
      socialAccount: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ data: rows.map(formatAccountDevice) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = AssignDeviceSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu gán device không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { id: `mapping_${Date.now()}`, ...parsed.data } }, { status: 201 });
  }

  const [account, device] = await Promise.all([
    prisma.socialAccount.findUnique({ where: { id: params.accountId } }),
    prisma.device.findUnique({ where: { id: parsed.data.deviceId } }),
  ]);

  if (!account) return NextResponse.json({ message: 'Không tìm thấy tài khoản' }, { status: 404 });
  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });

  if (parsed.data.isPrimary) {
    await prisma.socialAccountDevice.updateMany({
      where: { socialAccountId: params.accountId, isPrimary: true },
      data: { isPrimary: false, role: DeviceRole.BACKUP },
    });
  }

  const mapping = await prisma.socialAccountDevice.upsert({
    where: {
      socialAccountId_deviceId_role: {
        socialAccountId: params.accountId,
        deviceId: parsed.data.deviceId,
        role: parsed.data.role,
      },
    },
    update: {
      isPrimary: parsed.data.isPrimary,
      role: parsed.data.isPrimary ? DeviceRole.PRIMARY : parsed.data.role,
    },
    create: {
      socialAccountId: params.accountId,
      deviceId: parsed.data.deviceId,
      role: parsed.data.isPrimary ? DeviceRole.PRIMARY : parsed.data.role,
      isPrimary: parsed.data.isPrimary,
    },
    include: {
      device: true,
      socialAccount: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: parsed.data.isPrimary ? 'accountDevice.assignPrimary' : 'accountDevice.assign',
      entity: 'SocialAccountDevice',
      entityId: mapping.id,
      metadata: {
        socialAccountId: params.accountId,
        deviceId: parsed.data.deviceId,
        role: mapping.role,
        isPrimary: mapping.isPrimary,
      },
    },
  });

  return NextResponse.json({ data: formatAccountDevice(mapping) }, { status: 201 });
}
