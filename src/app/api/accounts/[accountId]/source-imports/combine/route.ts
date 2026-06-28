import { NextResponse } from 'next/server';
import { SourceImportStatus, SourcePlatform } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { detectDbSourcePlatform } from 'src/server/source-import-processor';
import { processCombineImports } from 'src/server/source-combine-processor';

// ----------------------------------------------------------------------
// Ghép nhiều link video gốc -> nối thành 1 video -> 1 bài nháp (+ tuỳ chọn vietsub).

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string } };

const CombineSchema = z.object({
  text: z.string().optional(),
  urls: z.array(z.string()).optional(),
  platform: z.enum(['auto', 'xsh', 'douyin']).default('auto'),
  autoVietsub: z.boolean().optional(),
  contextHint: z.string().max(2000).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '3:4']).optional(),
});

const ACTIVE_STATUSES: SourceImportStatus[] = [
  SourceImportStatus.QUEUED,
  SourceImportStatus.DOWNLOADING,
  SourceImportStatus.TRANSLATING,
  SourceImportStatus.DRAFT_CREATED,
];

function platformFromInput(url: string, platform: string): SourcePlatform | null {
  if (platform === 'xsh') return SourcePlatform.XSH;
  if (platform === 'douyin') return SourcePlatform.DOUYIN;

  try {
    return detectDbSourcePlatform(url);
  } catch {
    return null;
  }
}

function extractUrls(text?: string, urls?: string[]) {
  const fromText = (text || '')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const all = [...(urls || []), ...fromText].map((value) => value.trim()).filter((value) => /^https?:\/\//i.test(value));

  return Array.from(new Set(all));
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa được cấu hình' }, { status: 500 });

  const parsed = CombineSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu danh sách link không hợp lệ' }, { status: 400 });

  const account = await prisma.socialAccount.findUnique({
    where: { id: params.accountId },
    include: { devices: { where: { isPrimary: true }, take: 1 } },
  });

  if (!account) return NextResponse.json({ message: 'Không tìm thấy Social Account' }, { status: 404 });

  const urls = extractUrls(parsed.data.text, parsed.data.urls);

  if (urls.length < 2) {
    return NextResponse.json({ message: 'Cần ít nhất 2 link video để ghép' }, { status: 400 });
  }

  // Bỏ qua link đang xử lý trùng (giữ thứ tự cho phần còn lại).
  const existing = await prisma.sourceImport.findMany({
    where: { socialAccountId: account.id, sourceUrl: { in: urls }, status: { in: ACTIVE_STATUSES } },
    select: { sourceUrl: true },
  });
  const existingUrls = new Set(existing.map((row) => row.sourceUrl));

  const skippedInvalid: string[] = [];
  const skippedExisting: string[] = [];
  const toCreate: Array<{ url: string; platform: SourcePlatform }> = [];

  for (const url of urls) {
    if (existingUrls.has(url)) {
      skippedExisting.push(url);
      continue;
    }

    const platform = platformFromInput(url, parsed.data.platform);

    if (!platform || platform === SourcePlatform.UNKNOWN) {
      skippedInvalid.push(url);
      continue;
    }

    toCreate.push({ url, platform });
  }

  if (toCreate.length < 2) {
    return NextResponse.json(
      { message: 'Cần ít nhất 2 link hợp lệ (chưa xử lý) để ghép' },
      { status: 400 }
    );
  }

  const created = await prisma.$transaction(
    toCreate.map((item) =>
      prisma.sourceImport.create({
        data: {
          socialAccountId: account.id,
          deviceId: account.devices[0]?.deviceId,
          sourceUrl: item.url,
          sourcePlatform: item.platform,
          status: SourceImportStatus.QUEUED,
          createdById: auth.user?.sub === 'admin' ? null : auth.user?.sub,
        },
      })
    )
  );

  // Fire-and-forget: tải + nối + tạo nháp + (tuỳ chọn) vietsub chạy nền.
  processCombineImports(created.map((row) => row.id), {
    autoVietsub: parsed.data.autoVietsub,
    contextHint: parsed.data.contextHint,
    aspectRatio: parsed.data.aspectRatio,
  }).catch((error) => console.error('combine source import failed', error));

  return NextResponse.json(
    {
      data: { importIds: created.map((row) => row.id) },
      summary: {
        totalLinks: urls.length,
        queued: created.length,
        skippedExisting: skippedExisting.length,
        skippedInvalid: skippedInvalid.length,
      },
      skippedInvalid,
      skippedExisting,
      message: `Đang ghép ${created.length} link thành 1 bài nháp${parsed.data.autoVietsub ? ' + vietsub' : ''}…`,
    },
    { status: 202 }
  );
}
