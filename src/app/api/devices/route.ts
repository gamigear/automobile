import { NextResponse } from 'next/server';
import { DeviceProvider, DeviceStatus, DeviceType } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const CreateDeviceSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(DeviceType),
  provider: z.nativeEnum(DeviceProvider),
  externalId: z.string().optional().nullable(),
  profileName: z.string().optional().nullable(),
  adbId: z.string().optional().nullable(),
  deviceModel: z.string().optional().nullable(),
  androidVersion: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  proxyInfo: z.any().optional(),
  metadata: z.any().optional(),
});

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') as DeviceProvider | null;
  const type = searchParams.get('type') as DeviceType | null;
  const status = searchParams.get('status') as DeviceStatus | null;
  const locked = searchParams.get('locked');
  const assigned = searchParams.get('assigned');
  const scope = searchParams.get('scope');
  const where: any = {};

  if (provider && Object.values(DeviceProvider).includes(provider)) where.provider = provider;
  if (type && Object.values(DeviceType).includes(type)) where.type = type;
  if (status && Object.values(DeviceStatus).includes(status)) where.status = status;
  if (locked === 'true') where.locked = true;
  if (locked === 'false') where.locked = false;
  if (assigned === 'true') where.accounts = { some: {} };
  if (assigned === 'false') where.accounts = { none: {} };

  if (scope === 'pool') {
    const devices = await prisma.device.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        provider: true,
        externalId: true,
        profileName: true,
        adbId: true,
        status: true,
        healthStatus: true,
        locked: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      data: devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        provider: device.provider,
        externalId: device.externalId || device.adbId || '',
        profileName: device.profileName || '',
        status: device.status,
        healthStatus: device.healthStatus,
        onlineStatus: device.locked ? 'LOCKED' : device.healthStatus === 'OK' ? 'ONLINE' : device.healthStatus === 'OFFLINE' ? 'OFFLINE' : 'UNKNOWN',
      })),
    });
  }

  const devices = await prisma.device.findMany({
    where,
    include: {
      accounts: {
        include: {
          socialAccount: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: devices.map(formatDeviceRow) });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = CreateDeviceSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu device không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { id: `device_${Date.now()}`, ...parsed.data } }, { status: 201 });
  }

  const device = await prisma.device.create({
    data: {
      ...parsed.data,
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

  return NextResponse.json({ data: formatDeviceRow(device) }, { status: 201 });
}
