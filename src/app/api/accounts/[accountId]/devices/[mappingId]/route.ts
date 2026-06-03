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
    mappingId: string;
  };
};

const UpdateMappingSchema = z.object({
  role: z.nativeEnum(DeviceRole).optional(),
  isPrimary: z.boolean().optional(),
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

export async function PATCH(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = UpdateMappingSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu device mapping không hợp lệ' }, { status: 400 });
  }

  const mapping = await prisma.socialAccountDevice.findFirst({
    where: { id: params.mappingId, socialAccountId: params.accountId },
  });

  if (!mapping) return NextResponse.json({ message: 'Không tìm thấy device mapping' }, { status: 404 });

  if (parsed.data.isPrimary) {
    await prisma.socialAccountDevice.updateMany({
      where: { socialAccountId: params.accountId, isPrimary: true },
      data: { isPrimary: false, role: DeviceRole.BACKUP },
    });
  }

  const updated = await prisma.socialAccountDevice.update({
    where: { id: params.mappingId },
    data: {
      role: parsed.data.isPrimary ? DeviceRole.PRIMARY : parsed.data.role || mapping.role,
      isPrimary: parsed.data.isPrimary ?? mapping.isPrimary,
    },
    include: {
      device: true,
      socialAccount: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: updated.isPrimary ? 'accountDevice.setPrimary' : 'accountDevice.update',
      entity: 'SocialAccountDevice',
      entityId: updated.id,
      metadata: {
        socialAccountId: params.accountId,
        deviceId: updated.deviceId,
        role: updated.role,
        isPrimary: updated.isPrimary,
      },
    },
  });

  return NextResponse.json({ data: formatAccountDevice(updated) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const mapping = await prisma.socialAccountDevice.findFirst({
    where: { id: params.mappingId, socialAccountId: params.accountId },
  });

  if (!mapping) return NextResponse.json({ message: 'Không tìm thấy device mapping' }, { status: 404 });

  if (mapping.isPrimary) {
    return NextResponse.json(
      { message: 'Không thể bỏ primary device. Hãy đặt device khác làm primary trước.' },
      { status: 400 }
    );
  }

  await prisma.socialAccountDevice.delete({ where: { id: params.mappingId } });
  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'accountDevice.remove',
      entity: 'SocialAccountDevice',
      entityId: mapping.id,
      metadata: {
        socialAccountId: params.accountId,
        deviceId: mapping.deviceId,
        role: mapping.role,
        isPrimary: mapping.isPrimary,
      },
    },
  });

  return NextResponse.json({ data: { id: mapping.id } });
}
