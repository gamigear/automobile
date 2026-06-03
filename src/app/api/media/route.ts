import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatMediaRow } from 'src/lib/api-formatters';
// data
import { mediaAssets } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: mediaAssets });

  const rows = await prisma.mediaAsset.findMany({
    include: { socialAccount: true },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatMediaRow) });
}
