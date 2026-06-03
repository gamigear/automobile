import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; importId: string } };

export async function GET(_request: Request, { params }: Params) {
  const row = await prisma.sourceImport.findFirst({
    where: { id: params.importId, socialAccountId: params.accountId },
  });

  if (!row) return NextResponse.json({ message: 'Không tìm thấy source import' }, { status: 404 });

  return NextResponse.json({ data: row });
}
