import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatPostRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.post.findMany({
    where: {
      deletedAt: null,
      OR: [{ socialAccountId: params.accountId }, { targets: { some: { socialAccountId: params.accountId } } }],
    },
    include: {
      createdBy: true,
      targets: {
        include: {
          socialAccount: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatPostRow) });
}
