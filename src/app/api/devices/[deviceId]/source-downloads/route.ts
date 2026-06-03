import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow, formatMediaRow } from 'src/lib/api-formatters';
// server
import { createNotification } from 'src/server/notifications';
import { downloadSourceContent } from 'src/server/source-download-adapters';
import { translateSourceContent } from 'src/server/source-content-translation';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { deviceId: string } };

const SourceDownloadSchema = z.object({
  url: z.string().url(),
  platform: z.enum(['auto', 'xiaohongshu', 'douyin']).default('auto'),
  submitForApproval: z.boolean().default(false),
  titleOverride: z.string().optional().nullable(),
  captionOverride: z.string().optional().nullable(),
});

function fallbackTitle(download: any) {
  return download.title || `${download.platform} ${download.jobId}`;
}

function fallbackCaption(download: any) {
  return download.captionRaw || download.title || download.sourceUrl;
}

export async function GET(_request: Request, { params }: Params) {
  const rows = await prisma.jobLog.findMany({
    where: { deviceId: params.deviceId, type: 'source.download' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      jobId: row.jobId || row.id,
      type: row.type,
      status: row.status,
      platform: (row.payload as any)?.platform || '',
      sourceUrl: (row.payload as any)?.url || (row.payload as any)?.sourceUrl || '',
      postId: (row.payload as any)?.postId || '',
      mediaCount: (row.payload as any)?.mediaAssetIds?.length || 0,
      error: row.errorMessage || '',
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = SourceDownloadSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu tải nguồn không hợp lệ' }, { status: 400 });

  const [device, user] = await Promise.all([
    prisma.device.findUnique({ where: { id: params.deviceId } }),
    prisma.user.findUnique({ where: { id: auth.user!.sub } }),
  ]);

  if (!device) return NextResponse.json({ message: 'Không tìm thấy profile/device' }, { status: 404 });
  if (device.locked) return NextResponse.json({ message: 'Profile đang bị khóa, không thể tải nguồn' }, { status: 400 });
  if (!user) return NextResponse.json({ message: 'Chưa có user để tạo bài viết' }, { status: 409 });

  const job = await prisma.jobLog.create({
    data: {
      deviceId: params.deviceId,
      type: 'source.download',
      status: 'running',
      payload: parsed.data,
      startedAt: new Date(),
      attempts: 1,
    },
  });

  try {
    const download = await downloadSourceContent(parsed.data);
    const status = parsed.data.submitForApproval ? PostStatus.WAITING_APPROVAL : PostStatus.DRAFT;
    const sourceTitle = parsed.data.titleOverride?.trim() || fallbackTitle(download);
    const sourceCaption = parsed.data.captionOverride?.trim() || fallbackCaption(download);
    const translated = await translateSourceContent({ title: sourceTitle, caption: sourceCaption, platform: download.platform });
    const title = parsed.data.titleOverride?.trim() || translated.title || sourceTitle;
    const caption = parsed.data.captionOverride?.trim() || translated.caption || sourceCaption;
    const folderName = `${download.platform}-${download.jobId}`;

    const result = await prisma.$transaction(async (tx) => {
      const mediaRows = await Promise.all(
        download.files.map((file, index) =>
          tx.mediaAsset.upsert({
          where: { provider_externalId: { provider: 'source_download', externalId: `${download.platform}:${download.jobId}:${index}` } },
          update: {
            deviceId: params.deviceId,
            name: file.fileName,
            mimeType: file.mimeType,
            size: file.size ? BigInt(file.size) : undefined,
            webViewLink: file.hostPath,
            folderName,
            category: 'source_download',
          },
          create: {
            deviceId: params.deviceId,
            name: file.fileName,
            mimeType: file.mimeType,
            size: file.size ? BigInt(file.size) : undefined,
            provider: 'source_download',
            externalId: `${download.platform}:${download.jobId}:${index}`,
            webViewLink: file.hostPath,
            folderName,
            category: 'source_download',
          },
        })
        )
      );

      const post = await tx.post.create({
        data: {
          deviceId: params.deviceId,
          title,
          caption,
          status,
          createdById: user.id,
          media: {
            create: mediaRows.map((media, index) => ({ mediaAssetId: media.id, sortOrder: index })),
          },
          versions: {
            create: {
              snapshot: {
                sourceDownload: JSON.parse(JSON.stringify(download)),
                translation: translated,
                title,
                caption,
                status,
              },
            },
          },
        },
        include: { createdBy: true, socialAccount: true, targets: { include: { socialAccount: true } } },
      });

      const updatedJob = await tx.jobLog.update({
        where: { id: job.id },
        data: {
          jobId: download.jobId,
          status: 'completed',
          finishedAt: new Date(),
          payload: JSON.parse(JSON.stringify({
            ...parsed.data,
            platform: download.platform,
            sourceUrl: download.sourceUrl,
            resolvedUrl: download.resolvedUrl,
            postId: post.id,
            mediaAssetIds: mediaRows.map((media) => media.id),
            folderName,
            translation: translated,
            download,
          })),
        },
      });

      return { post, mediaRows, updatedJob };
    });

    await createNotification({
      title: 'Download nguồn hoàn tất',
      message: `Đã tạo draft: ${title}`,
      category: 'Source Download',
      type: 'source.download.completed',
      severity: 'success',
      entity: 'Post',
      entityId: result.post.id,
      href: `/dashboard/devices/${params.deviceId}`,
      metadata: { deviceId: params.deviceId, platform: download.platform, jobId: download.jobId },
    });

    return NextResponse.json({
      data: {
        job: result.updatedJob,
        download,
        post: formatPostRow(result.post),
        media: result.mediaRows.map(formatMediaRow),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tải nội dung nguồn';

    await prisma.jobLog.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
    await createNotification({
      title: 'Download nguồn thất bại',
      message,
      category: 'Source Download',
      type: 'source.download.failed',
      severity: 'error',
      entity: 'Device',
      entityId: params.deviceId,
      href: `/dashboard/devices/${params.deviceId}`,
      metadata: { deviceId: params.deviceId, url: parsed.data.url, platform: parsed.data.platform },
    });

    return NextResponse.json({ message }, { status: 400 });
  }
}
