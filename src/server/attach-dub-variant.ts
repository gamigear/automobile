import path from 'node:path';
import fs from 'node:fs';
import type { MediaAsset } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import type { DubResult } from './video-dub';

// ----------------------------------------------------------------------
// Gắn biến thể lồng tiếng (category 'dub', externalId `<orig>:dub`) vào bài.

export async function attachDubVariant(
  postId: string,
  orig: MediaAsset,
  result: DubResult,
  fallbackAccountId?: string
): Promise<void> {
  if (!fs.existsSync(result.outputHostPath)) {
    throw new Error('Lồng tiếng xong nhưng không thấy file output');
  }

  const size = fs.statSync(result.outputHostPath).size;

  await prisma.$transaction(async (tx) => {
    const variant = await tx.mediaAsset.upsert({
      where: { provider_externalId: { provider: orig.provider, externalId: `${orig.externalId}:dub` } },
      update: { localPath: result.outputHostPath, webViewLink: result.outputHostPath, size: BigInt(size) },
      create: {
        provider: orig.provider,
        externalId: `${orig.externalId}:dub`,
        deviceId: orig.deviceId || undefined,
        socialAccountId: orig.socialAccountId || fallbackAccountId,
        sourceImportId: orig.sourceImportId || undefined,
        name: `${path.parse(orig.name).name}.dub.mp4`,
        mimeType: 'video/mp4',
        size: BigInt(size),
        webViewLink: result.outputHostPath,
        localPath: result.outputHostPath,
        folderName: orig.folderName,
        category: 'dub',
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
