import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatMediaRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.mediaAsset.findMany({
    where: { socialAccountId: params.accountId },
    include: { socialAccount: true },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatMediaRow) });
}
