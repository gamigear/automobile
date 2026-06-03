import { NextResponse } from 'next/server';
import { SourceImportStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; importId: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const row = await prisma.sourceImport.findFirst({ where: { id: params.importId, socialAccountId: params.accountId } });

  if (!row) return NextResponse.json({ message: 'Không tìm thấy source import' }, { status: 404 });

  const updated = await prisma.sourceImport.update({
    where: { id: row.id },
    data: { status: SourceImportStatus.CANCELLED },
  });

  return NextResponse.json({ data: updated });
}
