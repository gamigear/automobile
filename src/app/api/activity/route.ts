import { NextResponse } from 'next/server';
import { PostStatus, SourceImportStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { listActiveVietsubProgress } from 'src/server/vietsub-progress';

// ----------------------------------------------------------------------
// Tổng hợp công việc đang chạy/chờ (toàn hệ thống) cho thanh trạng thái đáy màn hình.
// Không yêu cầu auth token (giống /api/jobs) — chạy sau guard dashboard, poll bằng fetch thường.

export const dynamic = 'force-dynamic';

const DRAFTING_STATUSES = [SourceImportStatus.QUEUED, SourceImportStatus.DOWNLOADING, SourceImportStatus.TRANSLATING];

const IMPORT_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Đang chờ tải',
  DOWNLOADING: 'Đang tải nguồn',
  TRANSLATING: 'Đang dịch',
};

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { drafting: [], publishing: [], scheduled: [], media: [] } });
  }

  const [importing, publishing, scheduled] = await Promise.all([
    // Đang tạo nháp từ link nguồn.
    prisma.sourceImport.findMany({
      where: { status: { in: DRAFTING_STATUSES } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { socialAccount: { select: { name: true } } },
    }),
    // Đang đăng.
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHING, deletedAt: null },
      orderBy: { updatedAt: 'asc' },
      take: 50,
      include: { socialAccount: { select: { name: true } }, device: { select: { name: true } } },
    }),
    // Chờ đăng (đã tới hoặc sắp tới hạn), theo thứ tự lịch.
    prisma.post.findMany({
      where: { status: PostStatus.SCHEDULED, deletedAt: null, deviceId: { not: null } },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
      include: { socialAccount: { select: { name: true } }, device: { select: { name: true } } },
    }),
  ]);

  // Tiến trình media (vietsub/lồng tiếng) đang chạy -> gắn tên account + tiêu đề.
  const active = listActiveVietsubProgress();
  const mediaPostIds = active.map((p) => p.postId);
  const mediaPosts = mediaPostIds.length
    ? await prisma.post.findMany({
        where: { id: { in: mediaPostIds } },
        select: { id: true, title: true, socialAccount: { select: { name: true } } },
      })
    : [];
  const postMap = new Map(mediaPosts.map((p) => [p.id, p]));

  return NextResponse.json({
    data: {
      drafting: importing.map((s) => ({
        id: s.id,
        account: s.socialAccount?.name || '—',
        url: s.sourceUrl,
        status: s.status,
        label: IMPORT_STATUS_LABEL[s.status] || s.status,
      })),
      publishing: publishing.map((p) => ({
        id: p.id,
        account: p.socialAccount?.name || '—',
        device: p.device?.name || '—',
        title: p.title,
      })),
      scheduled: scheduled.map((p) => ({
        id: p.id,
        account: p.socialAccount?.name || '—',
        device: p.device?.name || '—',
        title: p.title,
        scheduledAt: p.scheduledAt,
      })),
      media: active.map((p) => ({
        postId: p.postId,
        account: postMap.get(p.postId)?.socialAccount?.name || '—',
        title: postMap.get(p.postId)?.title || p.postId,
        phase: p.phase,
        label: p.label,
        percent: p.percent,
      })),
    },
  });
}
