import path from 'node:path';
import fs from 'node:fs';
import type { MediaAsset } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import type { VietsubResult } from './video-vietsub';

// ----------------------------------------------------------------------
// Gắn biến thể vietsub (file output) vào bài: upsert MediaAsset category 'vietsub'
// (externalId = `<orig>:vietsub`) + nối PostMedia nếu chưa có. Dùng chung cho vietsub
// route (đăng tay) và combine processor (auto vietsub sau khi ghép).

export async function attachVietsubVariant(
  postId: string,
  orig: MediaAsset,
  result: VietsubResult,
  fallbackAccountId?: string
): Promise<void> {
  if (!fs.existsSync(result.outputHostPath)) {
    throw new Error('Vietsub xong nhưng không thấy file output');
  }

  const size = fs.statSync(result.outputHostPath).size;

  await prisma.$transaction(async (tx) => {
    const variant = await tx.mediaAsset.upsert({
      where: { provider_externalId: { provider: orig.provider, externalId: `${orig.externalId}:vietsub` } },
      update: { localPath: result.outputHostPath, webViewLink: result.outputHostPath, size: BigInt(size) },
      create: {
        provider: orig.provider,
        externalId: `${orig.externalId}:vietsub`,
        deviceId: orig.deviceId || undefined,
        socialAccountId: orig.socialAccountId || fallbackAccountId,
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

    const existing = await tx.postMedia.findUnique({
      where: { postId_mediaAssetId: { postId, mediaAssetId: variant.id } },
    });
    if (!existing) {
      const media = await tx.postMedia.findMany({ where: { postId }, select: { sortOrder: true } });
      const maxOrder = Math.max(0, ...media.map((m) => m.sortOrder || 0));
      await tx.postMedia.create({ data: { postId, mediaAssetId: variant.id, sortOrder: maxOrder + 1 } });
    }
  });
}
