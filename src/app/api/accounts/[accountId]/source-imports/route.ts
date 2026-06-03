import { NextResponse } from 'next/server';
import { SourceImportStatus, SourcePlatform } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { detectDbSourcePlatform, processSourceImport } from 'src/server/source-import-processor';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string } };

const SourceImportSchema = z.object({
  url: z.string().url(),
  platform: z.enum(['auto', 'xsh', 'douyin']).default('auto'),
  async: z.boolean().optional().default(false),
});

function platformFromInput(url: string, platform: string) {
  if (platform === 'xsh') return SourcePlatform.XSH;
  if (platform === 'douyin') return SourcePlatform.DOUYIN;

  return detectDbSourcePlatform(url);
}

function formatSourceImport(row: any) {
  return {
    id: row.id,
    socialAccountId: row.socialAccountId,
    postId: row.postId || '',
    sourcePlatform: row.sourcePlatform,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle || '',
    sourceCaption: row.sourceCaption || '',
    translatedTitle: row.translatedTitle || '',
    translatedCaption: row.translatedCaption || '',
    status: row.status,
    errorMessage: row.errorMessage || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(_request: Request, { params }: Params) {
  const rows = await prisma.sourceImport.findMany({
    where: { socialAccountId: params.accountId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ data: rows.map(formatSourceImport) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = SourceImportSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Link nguồn không hợp lệ' }, { status: 400 });

  const account = await prisma.socialAccount.findUnique({
    where: { id: params.accountId },
    include: { devices: { where: { isPrimary: true }, take: 1 } },
  });

  if (!account) return NextResponse.json({ message: 'Không tìm thấy Social Account' }, { status: 404 });

  const sourceImport = await prisma.sourceImport.create({
    data: {
      socialAccountId: account.id,
      deviceId: account.devices[0]?.deviceId,
      sourceUrl: parsed.data.url,
      sourcePlatform: platformFromInput(parsed.data.url, parsed.data.platform),
      status: SourceImportStatus.QUEUED,
      createdById: auth.user?.sub === 'admin' ? null : auth.user?.sub,
    },
  });

  if (parsed.data.async) {
    processSourceImport(sourceImport.id).catch((error) => {
      console.error('source import async failed', sourceImport.id, error);
    });

    return NextResponse.json({ data: formatSourceImport(sourceImport), message: 'Đã đưa vào hàng xử lý' }, { status: 202 });
  }

  try {
    const result = await processSourceImport(sourceImport.id);

    return NextResponse.json({ data: formatSourceImport(result.sourceImport), postId: result.post.id }, { status: 201 });
  } catch (error) {
    const updated = await prisma.sourceImport.findUnique({ where: { id: sourceImport.id } });

    return NextResponse.json(
      { data: updated ? formatSourceImport(updated) : formatSourceImport(sourceImport), message: error instanceof Error ? error.message : 'Import thất bại' },
      { status: 202 }
    );
  }
}
