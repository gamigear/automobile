import fs from 'node:fs';
import { NextResponse } from 'next/server';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// service
import { vietsubVideo } from 'src/server/video-vietsub';
import { attachVietsubVariant } from 'src/server/attach-vietsub-variant';
import { startVietsubProgress, finishVietsubProgress } from 'src/server/vietsub-progress';

// ----------------------------------------------------------------------
// On-demand: burn phụ đề tiếng Việt cho video của bài, tạo MediaAsset biến thể gắn vào bài.

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; postId: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'EDITOR');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const post = await prisma.post.findFirst({
    where: { id: params.postId, deletedAt: null, OR: [{ socialAccountId: params.accountId }, { targets: { some: { socialAccountId: params.accountId } } }] },
    include: { media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } } },
  });

  if (!post) return NextResponse.json({ message: 'Không tìm thấy bài viết' }, { status: 404 });

  // Body optional: { contextHint?: string } — gợi ý bối cảnh/nhân vật để dịch xưng hô đúng.
  let contextHint = '';
  try {
    const text = await request.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (typeof parsed?.contextHint === 'string') contextHint = parsed.contextHint.slice(0, 2000);
    }
  } catch {
    // body không phải JSON valid → bỏ qua
  }

  // Chọn video gốc (chưa phải bản vietsub) có localPath.
  const videoItem = post.media.find(
    (m) =>
      m.mediaAsset?.mimeType?.startsWith('video/') &&
      m.mediaAsset?.localPath &&
      m.mediaAsset?.category !== 'vietsub'
  );

  if (!videoItem?.mediaAsset?.localPath) {
    return NextResponse.json({ message: 'Bài chưa có video local để vietsub' }, { status: 400 });
  }

  const orig = videoItem.mediaAsset;

  startVietsubProgress(post.id);

  try {
    const result = await vietsubVideo(orig.localPath as string, post.id, { contextHint });

    await attachVietsubVariant(post.id, orig, result, params.accountId);

    const updated = await prisma.post.findUnique({
      where: { id: post.id },
      include: {
        createdBy: true,
        socialAccount: true,
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    finishVietsubProgress(post.id);

    return NextResponse.json({
      data: formatPostRow(updated),
      message: `Đã tạo bản vietsub (${result.segments} câu phụ đề)`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Vietsub thất bại';
    finishVietsubProgress(post.id, msg);
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}

// Xoá (các) bản vietsub của bài → quay lại đăng bản gốc.
export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'EDITOR');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const post = await prisma.post.findFirst({
    where: { id: params.postId, deletedAt: null, OR: [{ socialAccountId: params.accountId }, { targets: { some: { socialAccountId: params.accountId } } }] },
    include: { media: { include: { mediaAsset: true } } },
  });

  if (!post) return NextResponse.json({ message: 'Không tìm thấy bài viết' }, { status: 404 });

  const variants = post.media
    .map((m) => m.mediaAsset)
    .filter((a): a is NonNullable<typeof a> => Boolean(a) && a!.category === 'vietsub');

  if (variants.length === 0) {
    return NextResponse.json({ message: 'Bài không có bản vietsub để xoá' }, { status: 400 });
  }

  const variantIds = variants.map((a) => a.id);
  const localFiles = variants.map((a) => a.localPath).filter((p): p is string => Boolean(p));

  const updated = await prisma.$transaction(async (tx) => {
    // FK order: gỡ liên kết PostMedia trước, rồi xoá MediaAsset (không có cascade).
    await tx.postMedia.deleteMany({ where: { mediaAssetId: { in: variantIds } } });
    await tx.mediaAsset.deleteMany({ where: { id: { in: variantIds } } });

    return tx.post.findUnique({
      where: { id: post.id },
      include: {
        createdBy: true,
        socialAccount: true,
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  // Dọn file local sau khi DB commit (không chặn nếu lỗi xoá file).
  for (const file of localFiles) {
    for (const f of [file, `${file}.thumb.jpg`]) {
      try {
        if (f.startsWith('/') && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // bỏ qua lỗi xoá file
      }
    }
  }

  return NextResponse.json({
    data: formatPostRow(updated),
    message: `Đã xoá ${variants.length} bản vietsub — sẽ đăng bản gốc`,
  });
}
