import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatSourceRow } from 'src/lib/api-formatters';
// data
import { sources } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const SyncSourceSchema = z.object({
  sourceId: z.string().min(1),
});

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: sources });

  const rows = await prisma.contentSource.findMany({ orderBy: { createdAt: 'asc' } });

  return NextResponse.json({ data: rows.map(formatSourceRow) });
}

export async function PATCH(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = SyncSourceSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu sync nguồn không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { id: parsed.data.sourceId, status: 'pending' } });
  }

  const source = await prisma.contentSource.update({
    where: { id: parsed.data.sourceId },
    data: {
      lastSyncAt: new Date(),
    },
  });

  const job = await prisma.jobLog.create({
    data: {
      type: 'drive.syncFolder',
      status: 'pending',
      payload: {
        sourceId: source.id,
        provider: source.provider,
        externalId: source.externalId,
      },
    },
  });

  return NextResponse.json({
    data: {
      source: formatSourceRow(source),
      job,
    },
  });
}
