import { NextResponse } from 'next/server';
import { SourceImportStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { processSourceImport } from 'src/server/source-import-processor';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; importId: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const sourceImport = await prisma.sourceImport.findFirst({
    where: { id: params.importId, socialAccountId: params.accountId },
  });

  if (!sourceImport) return NextResponse.json({ message: 'Không tìm thấy source import' }, { status: 404 });
  const retryableStatuses: SourceImportStatus[] = [
    SourceImportStatus.FAILED,
    SourceImportStatus.CANCELLED,
    SourceImportStatus.QUEUED,
  ];

  if (!retryableStatuses.includes(sourceImport.status)) {
    return NextResponse.json({ message: 'Import hiện không thể retry' }, { status: 400 });
  }

  try {
    const result = await processSourceImport(sourceImport.id);

    return NextResponse.json({ data: result.sourceImport, postId: result.post.id });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Retry thất bại' }, { status: 400 });
  }
}
