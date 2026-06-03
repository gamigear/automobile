import { NextResponse } from 'next/server';
import { DeviceProvider, DeviceStatus, DeviceType } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';
// server
import { listAntidetectProfiles } from 'src/server/device-adapters';
import { createNotification } from 'src/server/notifications';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const SyncProfilesSchema = z.object({
  provider: z.nativeEnum(DeviceProvider).default(DeviceProvider.MOSTLOGIN),
});

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = SyncProfilesSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu sync profile không hợp lệ' }, { status: 400 });
  }

  if (parsed.data.provider !== DeviceProvider.MOSTLOGIN) {
    return NextResponse.json({ message: 'MVP hiện chỉ hỗ trợ MostLogin' }, { status: 400 });
  }

  let profiles;

  try {
    profiles = await listAntidetectProfiles(parsed.data.provider);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Không thể đồng bộ profile' },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      data: profiles.map((profile) => ({
        id: profile.externalId,
        ...profile,
        type: 'Antidetect Profile',
        provider: 'MostLogin',
        status: 'INACTIVE',
        healthStatus: 'UNKNOWN',
        accounts: '',
      })),
      count: profiles.length,
    });
  }

  const existingDevices = await prisma.device.findMany({
    where: {
      provider: parsed.data.provider,
      externalId: {
        in: profiles.map((profile) => profile.externalId),
      },
    },
    select: { externalId: true },
  });
  const existingExternalIds = new Set(existingDevices.map((device) => device.externalId).filter(Boolean));

  const devices = await Promise.all(
    profiles.map(async (profile) => {
      const proxyInfo = profile.proxyInfo ? JSON.parse(JSON.stringify(profile.proxyInfo)) : undefined;
      const metadata = profile.metadata ? JSON.parse(JSON.stringify(profile.metadata)) : undefined;

      return prisma.device.upsert({
        where: {
          provider_externalId: {
            provider: parsed.data.provider,
            externalId: profile.externalId,
          },
        },
        update: {
          name: profile.name,
          profileName: profile.profileName,
          proxyInfo,
          metadata,
        },
        create: {
          name: profile.name,
          type: DeviceType.ANTIDETECT_PROFILE,
          provider: parsed.data.provider,
          externalId: profile.externalId,
          profileName: profile.profileName,
          proxyInfo,
          metadata,
          status: DeviceStatus.INACTIVE,
          healthStatus: 'UNKNOWN',
        },
        include: {
          accounts: {
            include: {
              socialAccount: true,
            },
          },
        },
      });
    })
  );

  const job = await prisma.jobLog.create({
    data: {
      type: 'antidetect.syncProfiles',
      status: 'completed',
      payload: {
        provider: parsed.data.provider,
        count: devices.length,
      },
      attempts: 1,
      finishedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'device.syncProfiles',
      entity: 'Device',
      metadata: {
        provider: parsed.data.provider,
        count: devices.length,
        jobLogId: job.id,
      },
    },
  });

  await createNotification({
    title: 'Đã đồng bộ MostLogin profiles',
    message: `${devices.length} profile đã được đồng bộ, ${profiles.filter((profile) => !existingExternalIds.has(profile.externalId)).length} profile mới.`,
    category: 'Device',
    type: 'device.sync',
    severity: 'success',
    entity: 'Device',
    href: '/dashboard/devices/mostlogin',
    metadata: { provider: parsed.data.provider, jobLogId: job.id },
  });

  return NextResponse.json({
    data: devices.map(formatDeviceRow),
    count: devices.length,
    synced: devices.length,
    created: profiles.filter((profile) => !existingExternalIds.has(profile.externalId)).length,
    updated: profiles.filter((profile) => existingExternalIds.has(profile.externalId)).length,
    jobId: job.id,
  });
}
