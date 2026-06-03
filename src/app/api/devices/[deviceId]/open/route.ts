import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';
// server
import { openDevice } from 'src/server/device-adapters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      data: {
        id: params.deviceId,
        healthStatus: 'UNKNOWN',
        message: 'DATABASE_URL chưa được cấu hình',
      },
    });
  }

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Device đang bị khóa, không thể mở.' }, { status: 400 });
  if (device.status === 'INACTIVE') {
    return NextResponse.json({ message: 'Device đang ngưng kích hoạt, không thể mở.' }, { status: 400 });
  }

  try {
    const result = await openDevice(device);
    const payload = JSON.parse(JSON.stringify({ deviceId: device.id, result }));
    const updatedDevice = await prisma.device.update({
      where: { id: device.id },
      data: {
        healthStatus: result.status,
        lastSeenAt: new Date(),
        jobs: {
          create: {
            type: device.type === 'ANTIDETECT_PROFILE' ? 'antidetect.openProfile' : 'android.openDevice',
            status: 'completed',
            payload,
            attempts: 1,
            finishedAt: new Date(),
          },
        },
      },
      include: {
        accounts: {
          include: {
            socialAccount: true,
          },
        },
      },
    });

    return NextResponse.json({ data: formatDeviceRow(updatedDevice), result });
  } catch (error) {
    await prisma.jobLog.create({
      data: {
        type: device.type === 'ANTIDETECT_PROFILE' ? 'antidetect.openProfile' : 'android.openDevice',
        status: 'failed',
        deviceId: device.id,
        payload: { deviceId: device.id },
        attempts: 1,
        errorMessage: error instanceof Error ? error.message : 'Open device thất bại',
        finishedAt: new Date(),
      },
    });

    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Open device thất bại' },
      { status: 500 }
    );
  }
}
