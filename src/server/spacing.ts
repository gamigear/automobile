import { PostStatus } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------
// Tiện ích giãn cách đăng bài theo account (dùng chung worker + handler).
// Tính cả PUBLISHED lẫn PUBLISHING: một bài ĐANG đăng cũng chặn bài kế cùng account
// (PUBLISHING dùng updatedAt làm mốc) -> tránh đăng dồn trong cửa sổ 30 phút.

export async function lastPublishTimeForAccount(
  socialAccountId: string,
  excludePostId: string
): Promise<Date | null> {
  const last = await prisma.post.findFirst({
    where: {
      socialAccountId,
      id: { not: excludePostId },
      status: { in: [PostStatus.PUBLISHED, PostStatus.PUBLISHING] },
    },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    select: { publishedAt: true, updatedAt: true, status: true },
  });

  if (!last) return null;

  return last.publishedAt || (last.status === PostStatus.PUBLISHING ? last.updatedAt : null);
}
