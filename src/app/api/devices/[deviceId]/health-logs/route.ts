import { format } from 'date-fns';
import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

function sanitizeMetadata(value: any) {
  if (!value || typeof value !== 'object') return value || null;

  const rest = { ...value };

  delete rest.rawProfile;
  delete rest.cookie;
  delete rest.cookies;

  return rest;
}

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.deviceHealthLog.findMany({
    where: { deviceId: params.deviceId },
    orderBy: { checkedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      status: row.status,
      message: row.message || '',
      metadata: sanitizeMetadata(row.metadata),
      metadataSummary: row.metadata ? JSON.stringify(sanitizeMetadata(row.metadata)).slice(0, 160) : '',
      checkedAt: format(row.checkedAt, 'yyyy-MM-dd HH:mm'),
    })),
  });
}
