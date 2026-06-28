import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DraftOrigin, PostStatus, SourceImportStatus, SourcePlatform } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
// server
import { createNotification } from './notifications';
import {
  downloadSourceContent,
  organizeSourceMediaIntoPostFolder,
  getSourceMediaRoot,
  type SourcePlatform as AdapterSourcePlatform,
  type NormalizedSourceDownload,
} from './source-download-adapters';
import { translateSourceContent } from './source-content-translation';
import { getImportSpacingMs } from './source-import-processor';
import { concatVideos, type ConcatAspectRatio } from './video-concat';
import { vietsubVideo } from './video-vietsub';
import { attachVietsubVariant } from './attach-vietsub-variant';

// ----------------------------------------------------------------------
// Ghép NHIỀU link video gốc -> nối thành 1 video dài -> 1 bài nháp -> (tuỳ chọn) vietsub.
// Chỉ xử lý link có video; link không phải video bị đánh FAILED và bỏ qua khi nối.

function toDbPlatform(platform: string): SourcePlatform {
  if (platform === 'xiaohongshu') return SourcePlatform.XSH;
  if (platform === 'douyin') return SourcePlatform.DOUYIN;

  return SourcePlatform.UNKNOWN;
}

function toAdapterPlatform(platform?: SourcePlatform | 'auto'): AdapterSourcePlatform {
  if (platform === SourcePlatform.XSH) return 'xiaohongshu';
  if (platform === SourcePlatform.DOUYIN) return 'douyin';

  return 'auto';
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type DownloadedVideo = {
  importId: string;
  videoHostPath: string;
  download: NormalizedSourceDownload;
};

export type CombineOptions = { autoVietsub?: boolean; contextHint?: string; aspectRatio?: ConcatAspectRatio };

// Fire-and-forget. Tiến độ theo dõi qua status từng SourceImport + danh sách bài nháp.
export async function processCombineImports(importIds: string[], opts: CombineOptions = {}) {
  if (importIds.length === 0) return;

  const spacingMs = getImportSpacingMs();
  const downloaded: DownloadedVideo[] = [];

  // 1) Tải tuần tự (có giãn cách), chọn video đầu tiên của mỗi link.
  for (let i = 0; i < importIds.length; i += 1) {
    const importId = importIds[i];
    // eslint-disable-next-line no-await-in-loop
    const sourceImport = await prisma.sourceImport.findUnique({ where: { id: importId } });
    if (!sourceImport) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.sourceImport.update({
        where: { id: importId },
        data: { status: SourceImportStatus.DOWNLOADING, errorMessage: null },
      });

      // eslint-disable-next-line no-await-in-loop
      const rawDownload = await downloadSourceContent({
        url: sourceImport.sourceUrl,
        platform: toAdapterPlatform(sourceImport.sourcePlatform),
      });
      const postKey = rawDownload.sourcePostId || rawDownload.jobId;
      const download = organizeSourceMediaIntoPostFolder(rawDownload, postKey);

      const videoFile = (download.files || []).find((f) => (f.mimeType || '').startsWith('video/'));
      if (!videoFile) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.sourceImport.update({
          where: { id: importId },
          data: {
            status: SourceImportStatus.FAILED,
            errorMessage: 'Link không phải video — bỏ qua khi ghép.',
            metadata: JSON.parse(JSON.stringify({ download })),
          },
        });
        continue;
      }

      downloaded.push({ importId, videoHostPath: videoFile.hostPath, download });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được link';
      // eslint-disable-next-line no-await-in-loop
      await prisma.sourceImport.update({
        where: { id: importId },
        data: { status: SourceImportStatus.FAILED, errorMessage: message },
      });
    }

    if (spacingMs > 0 && i < importIds.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(spacingMs);
    }
  }

  // 2) Barrier
  if (downloaded.length === 0) {
    await createNotification({
      title: 'Ghép link thất bại',
      message: 'Không có link nào chứa video để ghép.',
      category: 'Source Import',
      type: 'source.combine.failed',
      severity: 'error',
    }).catch(() => undefined);

    return;
  }

  const first = downloaded[0];
  const sourceImport = await prisma.sourceImport.findUnique({
    where: { id: first.importId },
    include: {
      socialAccount: { include: { devices: { where: { isPrimary: true }, include: { device: true }, take: 1 } } },
    },
  });
  if (!sourceImport) return;

  try {
    const batchId = randomUUID();
    const platform = toDbPlatform(first.download.platform);

    // 3) Nối (>=2 video) hoặc dùng thẳng (1 video).
    let mergedHostPath: string;
    if (downloaded.length >= 2) {
      const outDir = path.join(getSourceMediaRoot(), 'combined', batchId);
      fs.mkdirSync(outDir, { recursive: true });
      const result = await concatVideos(
        downloaded.map((d) => d.videoHostPath),
        path.join(outDir, 'combined.mp4'),
        { aspectRatio: opts.aspectRatio }
      );
      mergedHostPath = result.outputHostPath;
    } else {
      mergedHostPath = first.videoHostPath;
    }

    // 4) Dịch tiêu đề/caption từ link đầu.
    const sourceTitle = first.download.title || `${first.download.platform} ${first.download.jobId}`;
    const sourceCaption = first.download.captionRaw || first.download.title || first.download.sourceUrl;
    const translated = await translateSourceContent({
      title: sourceTitle,
      caption: sourceCaption,
      platform: first.download.platform,
    });
    const title = translated.title || sourceTitle;
    const caption = translated.caption || sourceCaption;

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('Chưa có admin user để tạo draft');

    const deviceId = sourceImport.deviceId || sourceImport.socialAccount.devices[0]?.deviceId;
    const size = fs.existsSync(mergedHostPath) ? fs.statSync(mergedHostPath).size : 0;

    // 5) Tạo 1 MediaAsset video đã nối + 1 Post nháp; link tất cả import -> post.
    const post = await prisma.$transaction(async (tx) => {
      const media = await tx.mediaAsset.upsert({
        where: { provider_externalId: { provider: 'source_download', externalId: `combined:${batchId}:0` } },
        update: { localPath: mergedHostPath, webViewLink: mergedHostPath, size: size ? BigInt(size) : undefined },
        create: {
          provider: 'source_download',
          externalId: `combined:${batchId}:0`,
          deviceId: deviceId || undefined,
          socialAccountId: sourceImport.socialAccountId,
          sourceImportId: first.importId,
          name: 'combined.mp4',
          mimeType: 'video/mp4',
          size: size ? BigInt(size) : undefined,
          webViewLink: mergedHostPath,
          localPath: mergedHostPath,
          folderName: `combined/${batchId}`,
          category: 'source_download',
          storageStatus: 'skipped',
        },
      });

      const created = await tx.post.create({
        data: {
          deviceId: deviceId || undefined,
          socialAccountId: sourceImport.socialAccountId,
          sourceImportId: first.importId,
          sourceUrl: first.download.sourceUrl,
          sourcePlatform: platform,
          draftOrigin: DraftOrigin.SOURCE_URL,
          title,
          caption,
          status: PostStatus.DRAFT,
          createdById: admin.id,
          targets: { create: { socialAccountId: sourceImport.socialAccountId, status: PostStatus.DRAFT } },
          media: { create: { mediaAssetId: media.id, sortOrder: 0 } },
          versions: {
            create: {
              snapshot: {
                combinedBatchId: batchId,
                sourceImportIds: downloaded.map((d) => d.importId),
                sourceUrls: downloaded.map((d) => d.download.sourceUrl),
                translation: translated,
                title,
                caption,
                status: PostStatus.DRAFT,
              },
            },
          },
        },
      });

      // Tất cả import đã tải -> trỏ về post nháp ghép.
      await tx.sourceImport.updateMany({
        where: { id: { in: downloaded.map((d) => d.importId) } },
        data: {
          postId: created.id,
          status: SourceImportStatus.DRAFT_CREATED,
          translatedTitle: title,
          translatedCaption: caption,
        },
      });

      return { post: created, mediaId: media.id };
    });

    // 6) Auto vietsub (tuỳ chọn).
    if (opts.autoVietsub) {
      try {
        const orig = await prisma.mediaAsset.findUnique({ where: { id: post.mediaId } });
        if (orig) {
          const result = await vietsubVideo(mergedHostPath, post.post.id, { contextHint: opts.contextHint });
          await attachVietsubVariant(post.post.id, orig, result, sourceImport.socialAccountId);
        }
      } catch (error) {
        // Vietsub lỗi không huỷ bài nháp — chỉ ghi log; admin có thể bấm vietsub lại.
        console.error('[combine] auto vietsub failed', error);
      }
    }

    await createNotification({
      title: 'Đã tạo nháp ghép từ nhiều link',
      message: `${title} (nối ${downloaded.length} video)`,
      category: 'Source Import',
      type: 'source.combine.completed',
      severity: 'success',
      entity: 'Post',
      entityId: post.post.id,
      href: `/dashboard/accounts/${sourceImport.socialAccountId}`,
      metadata: { batchId, socialAccountId: sourceImport.socialAccountId },
    }).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể ghép link nguồn';
    await prisma.sourceImport.updateMany({
      where: { id: { in: downloaded.map((d) => d.importId) } },
      data: { status: SourceImportStatus.FAILED, errorMessage: message },
    });
    await createNotification({
      title: 'Ghép link thất bại',
      message,
      category: 'Source Import',
      type: 'source.combine.failed',
      severity: 'error',
    }).catch(() => undefined);
  }
}
