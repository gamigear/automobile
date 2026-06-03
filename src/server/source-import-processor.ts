import { DraftOrigin, PostStatus, SourceImportStatus, SourcePlatform } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
// server
import { createNotification } from './notifications';
import { detectSourcePlatform, downloadSourceContent, type SourcePlatform as AdapterSourcePlatform } from './source-download-adapters';
import { translateSourceContent } from './source-content-translation';

// ----------------------------------------------------------------------

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

function fallbackTitle(download: any) {
  return download.title || `${download.platform} ${download.jobId}`;
}

function fallbackCaption(download: any) {
  return download.captionRaw || download.title || download.sourceUrl;
}

export function detectDbSourcePlatform(url: string) {
  return toDbPlatform(detectSourcePlatform(url));
}

export async function processSourceImport(importId: string) {
  const sourceImport = await prisma.sourceImport.findUnique({
    where: { id: importId },
    include: { socialAccount: { include: { devices: { where: { isPrimary: true }, include: { device: true }, take: 1 } } } },
  });

  if (!sourceImport) throw new Error('Không tìm thấy source import');

  await prisma.sourceImport.update({
    where: { id: importId },
    data: { status: SourceImportStatus.DOWNLOADING, errorMessage: null },
  });

  const job = await prisma.jobLog.create({
    data: {
      socialAccountId: sourceImport.socialAccountId,
      deviceId: sourceImport.deviceId,
      type: 'source.importFromUrl',
      status: 'running',
      payload: { sourceImportId: importId, url: sourceImport.sourceUrl, platform: sourceImport.sourcePlatform },
      attempts: 1,
      startedAt: new Date(),
    },
  });

  try {
    const download = await downloadSourceContent({
      url: sourceImport.sourceUrl,
      platform: toAdapterPlatform(sourceImport.sourcePlatform),
    });
    const sourceTitle = fallbackTitle(download);
    const sourceCaption = fallbackCaption(download);

    await prisma.sourceImport.update({
      where: { id: importId },
      data: {
        status: SourceImportStatus.TRANSLATING,
        sourcePlatform: toDbPlatform(download.platform),
        sourceTitle,
        sourceCaption,
        metadata: JSON.parse(JSON.stringify({ download })),
      },
    });

    const translated = await translateSourceContent({ title: sourceTitle, caption: sourceCaption, platform: download.platform });
    const title = translated.title || sourceTitle;
    const caption = translated.caption || sourceCaption;
    const folderName = `${download.platform}-${download.jobId}`;
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { createdAt: 'asc' } });

    if (!admin) throw new Error('Chưa có admin user để tạo draft');

    const result = await prisma.$transaction(async (tx) => {
      const mediaRows = await Promise.all(
        download.files.map((file, index) =>
          tx.mediaAsset.upsert({
            where: { provider_externalId: { provider: 'source_download', externalId: `${download.platform}:${download.jobId}:${index}` } },
            update: {
              deviceId: sourceImport.deviceId || undefined,
              socialAccountId: sourceImport.socialAccountId,
              sourceImportId: importId,
              name: file.fileName,
              mimeType: file.mimeType,
              size: file.size ? BigInt(file.size) : undefined,
              webViewLink: file.hostPath,
              localPath: file.hostPath,
              folderName,
              category: 'source_download',
            },
            create: {
              deviceId: sourceImport.deviceId || undefined,
              socialAccountId: sourceImport.socialAccountId,
              sourceImportId: importId,
              name: file.fileName,
              mimeType: file.mimeType,
              size: file.size ? BigInt(file.size) : undefined,
              provider: 'source_download',
              externalId: `${download.platform}:${download.jobId}:${index}`,
              webViewLink: file.hostPath,
              localPath: file.hostPath,
              folderName,
              category: 'source_download',
            },
          })
        )
      );

      const post = await tx.post.create({
        data: {
          deviceId: sourceImport.deviceId || sourceImport.socialAccount.devices[0]?.deviceId,
          socialAccountId: sourceImport.socialAccountId,
          sourceImportId: importId,
          sourceUrl: download.sourceUrl,
          sourcePlatform: toDbPlatform(download.platform),
          draftOrigin: DraftOrigin.SOURCE_URL,
          title,
          caption,
          status: PostStatus.DRAFT,
          createdById: admin.id,
          targets: {
            create: { socialAccountId: sourceImport.socialAccountId, status: PostStatus.DRAFT },
          },
          media: {
            create: mediaRows.map((media, index) => ({ mediaAssetId: media.id, sortOrder: index })),
          },
          versions: {
            create: {
              snapshot: {
                sourceImportId: importId,
                sourceDownload: JSON.parse(JSON.stringify(download)),
                translation: translated,
                title,
                caption,
                status: PostStatus.DRAFT,
              },
            },
          },
        },
        include: { createdBy: true, socialAccount: true, targets: { include: { socialAccount: true } } },
      });

      const updatedImport = await tx.sourceImport.update({
        where: { id: importId },
        data: {
          postId: post.id,
          status: SourceImportStatus.DRAFT_CREATED,
          translatedTitle: title,
          translatedCaption: caption,
          metadata: JSON.parse(JSON.stringify({ download, translation: translated, mediaAssetIds: mediaRows.map((media) => media.id) })),
        },
      });

      const updatedJob = await tx.jobLog.update({
        where: { id: job.id },
        data: {
          jobId: download.jobId,
          status: 'completed',
          finishedAt: new Date(),
          payload: JSON.parse(JSON.stringify({ sourceImportId: importId, postId: post.id, download, translation: translated })),
        },
      });

      return { post, mediaRows, sourceImport: updatedImport, job: updatedJob };
    });

    await createNotification({
      title: 'Đã tạo nháp từ link nguồn',
      message: title,
      category: 'Source Import',
      type: 'source.import.completed',
      severity: 'success',
      entity: 'Post',
      entityId: result.post.id,
      href: `/dashboard/accounts/${sourceImport.socialAccountId}`,
      metadata: { sourceImportId: importId, socialAccountId: sourceImport.socialAccountId },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể import link nguồn';

    await prisma.sourceImport.update({
      where: { id: importId },
      data: { status: SourceImportStatus.FAILED, errorMessage: message },
    });
    await prisma.jobLog.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });

    throw new Error(message);
  }
}
