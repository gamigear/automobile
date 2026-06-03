import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';
// server
import { deviceStatusFromHealth, healthCheckDevice } from 'src/server/device-adapters';

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

  const result = await healthCheckDevice(device).catch((error) => ({
    status: 'ERROR',
    message: error instanceof Error ? error.message : 'Health check thất bại',
  }));
  const metadata = 'metadata' in result ? JSON.parse(JSON.stringify(result.metadata || {})) : undefined;

  const updatedDevice = await prisma.device.update({
    where: { id: device.id },
    data: {
      status: deviceStatusFromHealth(result.status),
      healthStatus: result.status,
      lastSeenAt: result.status === 'OK' ? new Date() : device.lastSeenAt,
      healthLogs: {
        create: {
          status: result.status,
          message: result.message,
          metadata,
        },
      },
      jobs: {
        create: {
          type: 'device.healthCheck',
          status: result.status === 'OK' ? 'completed' : 'failed',
          payload: { deviceId: device.id },
          attempts: 1,
          errorMessage: result.status === 'OK' ? null : result.message,
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
}
