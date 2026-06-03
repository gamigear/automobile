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
    deviceId: string;
    postId: string;
  };
};

const UpdateProfilePostSchema = z.object({
  title: z.string().min(1).optional(),
  caption: z.string().min(1).optional(),
  socialAccountId: z.string().optional().nullable(),
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

async function findMutablePost(deviceId: string, postId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, deviceId, deletedAt: null } });

  if (!post) return { post: null, error: NextResponse.json({ message: 'Không tìm thấy bài viết trong profile' }, { status: 404 }) };
  if (!mutableStatuses.has(post.status)) {
    return {
      post: null,
      error: NextResponse.json({ message: 'Bài đã public/đang publish không thể sửa trực tiếp' }, { status: 400 }),
    };
  }

  return { post, error: null };
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = UpdateProfilePostSchema.safeParse(await request.json());

  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu cập nhật bài viết không hợp lệ' }, { status: 400 });

  const { post, error } = await findMutablePost(params.deviceId, params.postId);

  if (error) return error;

  if (parsed.data.socialAccountId) {
    const mapping = await prisma.socialAccountDevice.findFirst({
      where: {
        deviceId: params.deviceId,
        socialAccountId: parsed.data.socialAccountId,
        verificationStatus: 'VERIFIED',
      },
    });

    if (!mapping) {
      return NextResponse.json(
        { message: 'Chỉ được chọn Social Account đã verify trực tiếp trong profile' },
        { status: 400 }
      );
    }
  }

  const status = parsed.data.status || post!.status;

  if (
    (status === PostStatus.SCHEDULED || status === PostStatus.PUBLISHING) &&
    !parsed.data.socialAccountId &&
    !post!.socialAccountId
  ) {
    return NextResponse.json({ message: 'Cần chọn Social Account đã verify trước khi lên lịch/publish' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    let scheduledAt: Date | null | undefined;

    if ('scheduledAt' in parsed.data) {
      scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    }

    if ('socialAccountId' in parsed.data) {
      await tx.postTarget.deleteMany({ where: { postId: params.postId } });

      if (parsed.data.socialAccountId) {
        await tx.postTarget.create({
          data: { postId: params.postId, socialAccountId: parsed.data.socialAccountId, status },
        });
      }
    }

    await tx.postVersion.create({
      data: {
        postId: params.postId,
        snapshot: { beforeStatus: post!.status, ...parsed.data, deviceId: params.deviceId },
      },
    });

    return tx.post.update({
      where: { id: params.postId },
      data: {
        title: parsed.data.title,
        caption: parsed.data.caption,
        socialAccountId: 'socialAccountId' in parsed.data ? parsed.data.socialAccountId || null : undefined,
        scheduledAt,
        status: parsed.data.status,
      },
      include: { createdBy: true, socialAccount: true, targets: { include: { socialAccount: true } } },
    });
  });

  return NextResponse.json({ data: formatPostRow(updated) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const { error } = await findMutablePost(params.deviceId, params.postId);

  if (error) return error;

  await prisma.post.update({ where: { id: params.postId }, data: { deletedAt: new Date() } });

  return NextResponse.json({ data: { id: params.postId } });
}
