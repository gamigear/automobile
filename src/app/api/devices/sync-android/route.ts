import { NextResponse } from 'next/server';
import { DeviceProvider, DeviceStatus, DeviceType } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';
// server
import { listAdbDevices } from 'src/server/device-adapters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const devices = await listAdbDevices();
  const rows = await Promise.all(
    devices.map((device) =>
      prisma.device.upsert({
        where: { provider_adbId: { provider: DeviceProvider.ADB, adbId: device.adbId } },
        update: {
          name: device.name,
          type: DeviceType.ANDROID_DEVICE,
          provider: DeviceProvider.ADB,
          deviceModel: device.deviceModel,
          androidVersion: device.androidVersion,
          metadata: device.metadata,
          status: DeviceStatus.ACTIVE,
          healthStatus: 'OK',
          lastSeenAt: new Date(),
        },
        create: {
          name: device.name,
          type: DeviceType.ANDROID_DEVICE,
          provider: DeviceProvider.ADB,
          adbId: device.adbId,
          externalId: `adb-${device.adbId}`,
          deviceModel: device.deviceModel,
          androidVersion: device.androidVersion,
          metadata: device.metadata,
          status: DeviceStatus.ACTIVE,
          healthStatus: 'OK',
          lastSeenAt: new Date(),
        },
        include: { accounts: { include: { socialAccount: true } } },
      })
    )
  );

  await prisma.jobLog.create({
    data: {
      type: 'android.syncDevices',
      status: 'completed',
      attempts: 1,
      payload: { count: rows.length, adbIds: devices.map((device) => device.adbId) },
      finishedAt: new Date(),
    },
  });

  return NextResponse.json({ data: rows.map(formatDeviceRow), count: rows.length });
}
