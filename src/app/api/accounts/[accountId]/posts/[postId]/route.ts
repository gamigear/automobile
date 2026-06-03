import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
    postId: string;
  };
};

const UpdateAccountPostSchema = z.object({
  title: z.string().min(1).optional(),
  caption: z.string().min(1).optional(),
  scheduledAt: z.string().optional().nullable(),
  status: z.nativeEnum(PostStatus).optional(),
});

const mutableStatuses = new Set<PostStatus>([
  PostStatus.DRAFT,
  PostStatus.WAITING_APPROVAL,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
  PostStatus.CANCELLED,
]);

async function findAccountPost(accountId: string, postId: string) {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      OR: [{ socialAccountId: accountId }, { targets: { some: { socialAccountId: accountId } } }],
    },
    include: {
      createdBy: true,
      socialAccount: true,
      targets: { include: { socialAccount: true } },
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      sourceImport: true,
    },
  });

  if (!post) return { post: null, error: NextResponse.json({ message: 'Không tìm thấy bài viết' }, { status: 404 }) };

  return { post, error: null };
}

export async function GET(_request: Request, { params }: Params) {
  const { post, error } = await findAccountPost(params.accountId, params.postId);

  if (error) return error;

  return NextResponse.json({ data: formatPostRow(post) });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = UpdateAccountPostSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu cập nhật bài viết không hợp lệ' }, { status: 400 });

  const { post, error } = await findAccountPost(params.accountId, params.postId);

  if (error) return error;
  if (!mutableStatuses.has(post!.status)) {
    return NextResponse.json({ message: 'Bài đã public/đang publish không thể sửa trực tiếp' }, { status: 400 });
  }

  const scheduledAt = 'scheduledAt' in parsed.data ? (parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null) : undefined;
  const status = parsed.data.status || post!.status;

  if (status === PostStatus.SCHEDULED && !scheduledAt && !post!.scheduledAt) {
    return NextResponse.json({ message: 'Cần chọn thời gian lên lịch' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.postVersion.create({
      data: {
        postId: params.postId,
        snapshot: { beforeStatus: post!.status, ...parsed.data, accountId: params.accountId },
      },
    });

    await tx.postTarget.updateMany({
      where: { postId: params.postId, socialAccountId: params.accountId },
      data: { status },
    });

    return tx.post.update({
      where: { id: params.postId },
      data: {
        title: parsed.data.title,
        caption: parsed.data.caption,
        scheduledAt,
        status: parsed.data.status,
      },
      include: {
        createdBy: true,
        socialAccount: true,
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  return NextResponse.json({ data: formatPostRow(updated) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;
  const { post, error } = await findAccountPost(params.accountId, params.postId);

  if (error) return error;
  if (!mutableStatuses.has(post!.status)) {
    return NextResponse.json({ message: 'Bài đã public/đang publish không thể xóa trực tiếp' }, { status: 400 });
  }

  await prisma.post.update({ where: { id: params.postId }, data: { deletedAt: new Date() } });

  return NextResponse.json({ data: { id: params.postId } });
}
