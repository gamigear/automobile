import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatJobRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.jobLog.findMany({
    where: { socialAccountId: params.accountId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatJobRow) });
}
