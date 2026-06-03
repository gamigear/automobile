import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatJobRow } from 'src/lib/api-formatters';
// data
import { jobs } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const RetryJobSchema = z.object({
  jobId: z.string().min(1),
});

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: jobs });

  const rows = await prisma.jobLog.findMany({ orderBy: { createdAt: 'desc' } });

  return NextResponse.json({ data: rows.map(formatJobRow) });
}

export async function PATCH(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = RetryJobSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu retry job không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { id: parsed.data.jobId, status: 'pending' } });
  }

  const job = await prisma.jobLog.update({
    where: { id: parsed.data.jobId },
    data: {
      status: 'pending',
      attempts: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  return NextResponse.json({ data: formatJobRow(job) });
}
