import { NextResponse } from 'next/server';
import { DeviceStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceDetail } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const UpdateDeviceSchema = z.object({
  name: z.string().min(1).optional(),
  profileName: z.string().optional().nullable(),
  deviceModel: z.string().optional().nullable(),
  androidVersion: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(DeviceStatus).optional(),
  metadata: z.any().optional(),
});

const includeDeviceRelations = {
  accounts: {
    include: {
      socialAccount: true,
    },
  },
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa được cấu hình' }, { status: 400 });

  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    include: includeDeviceRelations,
  });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });

  return NextResponse.json({ data: formatDeviceDetail(device) });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = UpdateDeviceSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu cập nhật device không hợp lệ' }, { status: 400 });
  }

  const existing = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!existing) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });

  const device = await prisma.device.update({
    where: { id: params.deviceId },
    data: parsed.data,
    include: includeDeviceRelations,
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'device.update',
      entity: 'Device',
      entityId: device.id,
      metadata: parsed.data,
    },
  });

  return NextResponse.json({ data: formatDeviceDetail(device) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    include: { accounts: true },
  });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });

  if (device.accounts.length > 0) {
    return NextResponse.json(
      { message: 'Device đang gắn với tài khoản. Hãy bỏ gán device trước khi xóa.' },
      { status: 400 }
    );
  }

  await prisma.device.delete({ where: { id: params.deviceId } });
  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'device.delete',
      entity: 'Device',
      entityId: device.id,
      metadata: { name: device.name, provider: device.provider, externalId: device.externalId },
    },
  });

  return NextResponse.json({ data: { id: device.id } });
}
