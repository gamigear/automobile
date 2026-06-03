import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatSourceRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.contentSource.findMany({
    where: { socialAccountId: params.accountId },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatSourceRow) });
}
