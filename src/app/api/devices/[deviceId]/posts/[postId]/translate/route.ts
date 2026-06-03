import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// server
import { translateSourceContent } from 'src/server/source-content-translation';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
    postId: string;
  };
};

const editableStatuses = new Set<PostStatus>([
  PostStatus.DRAFT,
  PostStatus.WAITING_APPROVAL,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
  PostStatus.CANCELLED,
]);

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const post = await prisma.post.findFirst({
    where: { id: params.postId, deviceId: params.deviceId, deletedAt: null },
    include: {
      createdBy: true,
      socialAccount: true,
      targets: { include: { socialAccount: true } },
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!post) return NextResponse.json({ message: 'Không tìm thấy bài nháp trong profile' }, { status: 404 });
  if (!editableStatuses.has(post.status)) {
    return NextResponse.json({ message: 'Bài đã public/đang publish không thể Việt hóa trực tiếp' }, { status: 400 });
  }

  const translated = await translateSourceContent({ title: post.title, caption: post.caption });

  if (!translated.translated) {
    return NextResponse.json(
      { message: translated.error || 'Chưa bật cấu hình Việt hóa nội dung nguồn' },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.postVersion.create({
      data: {
        postId: params.postId,
        snapshot: {
          action: 'translate-source-content',
          beforeTitle: post.title,
          beforeCaption: post.caption,
          translation: translated,
        },
      },
    });

    return tx.post.update({
      where: { id: params.postId },
      data: { title: translated.title, caption: translated.caption },
      include: {
        createdBy: true,
        socialAccount: true,
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  return NextResponse.json({ data: formatPostRow(updated), translation: translated });
}
