import { NextResponse } from 'next/server';
import { PostStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatPostRow } from 'src/lib/api-formatters';
// data
import { posts } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const ApprovalSchema = z.object({
  postId: z.string().min(1),
  action: z.enum(['approve', 'request_changes', 'reject']),
  comment: z.string().optional(),
});

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      data: posts.filter((post) => post.status === 'WAITING_APPROVAL'),
    });
  }

  const rows = await prisma.post.findMany({
    where: { status: PostStatus.WAITING_APPROVAL, deletedAt: null },
    include: {
      createdBy: true,
      targets: { include: { socialAccount: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    data: rows.map(formatPostRow),
  });
}

export async function PATCH(request: Request) {
  const auth = requireRole(request, 'APPROVER');

  if (auth.error) return auth.error;

  const parsed = ApprovalSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu phê duyệt không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: { id: parsed.data.postId, action: parsed.data.action } });
  }

  const statusByAction = {
    approve: PostStatus.APPROVED,
    request_changes: PostStatus.DRAFT,
    reject: PostStatus.CANCELLED,
  };

  const post = await prisma.post.update({
    where: { id: parsed.data.postId },
    data: {
      status: statusByAction[parsed.data.action],
      approvals: {
        create: {
          actorId: auth.user!.sub,
          action: parsed.data.action,
          comment: parsed.data.comment,
        },
      },
      targets: {
        updateMany: {
          where: {},
          data: { status: statusByAction[parsed.data.action] },
        },
      },
    },
    include: {
      createdBy: true,
      targets: { include: { socialAccount: true } },
    },
  });

  return NextResponse.json({ data: formatPostRow(post) });
}
