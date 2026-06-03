import { NextResponse } from 'next/server';
import { DeviceStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const StateSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'lock', 'unlock']),
  reason: z.string().optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = StateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu trạng thái device không hợp lệ' }, { status: 400 });
  }

  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    include: { accounts: { include: { socialAccount: true } } },
  });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });

  const { action, reason } = parsed.data;

  if (action === 'activate' && device.locked) {
    return NextResponse.json({ message: 'Device đang bị khóa. Hãy mở khóa trước khi kích hoạt.' }, { status: 400 });
  }

  const data = (() => {
    if (action === 'activate') return { status: DeviceStatus.ACTIVE };
    if (action === 'deactivate') return { status: DeviceStatus.INACTIVE };
    if (action === 'lock') {
      return {
        locked: true,
        lockedAt: new Date(),
        lockedReason: reason || null,
        status: DeviceStatus.INACTIVE,
      };
    }

    return {
      locked: false,
      lockedAt: null,
      lockedReason: null,
    };
  })();

  const updated = await prisma.device.update({
    where: { id: params.deviceId },
    data,
    include: { accounts: { include: { socialAccount: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: `device.${action}`,
      entity: 'Device',
      entityId: device.id,
      metadata: {
        previousStatus: device.status,
        nextStatus: updated.status,
        previousLocked: device.locked,
        nextLocked: updated.locked,
        reason: reason || null,
      },
    },
  });

  return NextResponse.json({ data: formatDeviceRow(updated) });
}
