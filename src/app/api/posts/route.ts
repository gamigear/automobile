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

const CreatePostSchema = z.object({
  title: z.string().min(1),
  caption: z.string().min(1),
  mediaAssetId: z.string().optional().nullable(),
  socialAccountId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  submitForApproval: z.boolean().default(false),
});

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: posts });

  const rows = await prisma.post.findMany({
    where: { deletedAt: null },
    include: {
      createdBy: true,
      targets: { include: { socialAccount: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: rows.map(formatPostRow) });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;

  const parsed = CreatePostSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu bài đăng không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        data: {
          id: `post_${Date.now()}`,
          status: parsed.data.submitForApproval ? 'WAITING_APPROVAL' : 'DRAFT',
          ...parsed.data,
        },
      },
      { status: 201 }
    );
  }

  const admin = await prisma.user.findUnique({ where: { id: auth.user!.sub } });

  if (!admin) {
    return NextResponse.json({ message: 'Chưa có user để tạo bài đăng' }, { status: 409 });
  }

  const status = parsed.data.submitForApproval ? PostStatus.WAITING_APPROVAL : PostStatus.DRAFT;
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;

  const post = await prisma.post.create({
    data: {
      title: parsed.data.title,
      caption: parsed.data.caption,
      status,
      scheduledAt,
      createdById: admin.id,
      media: parsed.data.mediaAssetId
        ? {
            create: {
              mediaAssetId: parsed.data.mediaAssetId,
            },
          }
        : undefined,
      targets: parsed.data.socialAccountId
        ? {
            create: {
              socialAccountId: parsed.data.socialAccountId,
              status,
            },
          }
        : undefined,
      versions: {
        create: {
          snapshot: parsed.data,
        },
      },
    },
    include: {
      createdBy: true,
      targets: { include: { socialAccount: true } },
    },
  });

  return NextResponse.json({ data: formatPostRow(post) }, { status: 201 });
}
