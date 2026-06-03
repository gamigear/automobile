import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatJobRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.jobLog.findMany({
    where: { deviceId: params.deviceId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ data: rows.map(formatJobRow) });
}
