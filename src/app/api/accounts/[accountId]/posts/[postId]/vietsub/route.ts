import path from 'node:path';
import fs from 'node:fs';
import { NextResponse } from 'next/server';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// service
import { vietsubVideo } from 'src/server/video-vietsub';
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
    const result = await vietsubVideo(orig.localPath as string, post.id);

    if (!fs.existsSync(result.outputHostPath)) {
      finishVietsubProgress(post.id, 'Không thấy file output');
      return NextResponse.json({ message: 'Vietsub xong nhưng không thấy file output' }, { status: 500 });
    }

    const size = fs.statSync(result.outputHostPath).size;

    const updated = await prisma.$transaction(async (tx) => {
      const variant = await tx.mediaAsset.upsert({
        where: { provider_externalId: { provider: orig.provider, externalId: `${orig.externalId}:vietsub` } },
        update: { localPath: result.outputHostPath, webViewLink: result.outputHostPath, size: BigInt(size) },
        create: {
          provider: orig.provider,
          externalId: `${orig.externalId}:vietsub`,
          deviceId: orig.deviceId || undefined,
          socialAccountId: orig.socialAccountId || params.accountId,
          sourceImportId: orig.sourceImportId || undefined,
          name: `${path.parse(orig.name).name}.vietsub.mp4`,
          mimeType: 'video/mp4',
          size: BigInt(size),
          webViewLink: result.outputHostPath,
          localPath: result.outputHostPath,
          folderName: orig.folderName,
          category: 'vietsub',
        },
      });

      // Gắn biến thể vào bài (nếu chưa có).
      const existing = await tx.postMedia.findUnique({
        where: { postId_mediaAssetId: { postId: post.id, mediaAssetId: variant.id } },
      });
      if (!existing) {
        const maxOrder = Math.max(0, ...post.media.map((m) => m.sortOrder || 0));
        await tx.postMedia.create({ data: { postId: post.id, mediaAssetId: variant.id, sortOrder: maxOrder + 1 } });
      }

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
