import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { executePublish } from 'src/server/publish-post';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; postId: string } };

const PublishBodySchema = z.object({
  publishMode: z.enum(['gami', 'external_tiktok_studio']).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'STAFF');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa được cấu hình' }, { status: 500 });

  // Body optional: { publishMode?: 'gami' | 'external_tiktok_studio' }
  let parsedBody: { publishMode?: string } = {};
  try {
    const text = await request.text();
    if (text) {
      const parsed = PublishBodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json({ message: 'Dữ liệu publishMode không hợp lệ' }, { status: 400 });
      }
      parsedBody = parsed.data;
    }
  } catch {
    // body không phải JSON valid → coi như không có
  }

  const post = await prisma.post.findFirst({
    where: { id: params.postId, socialAccountId: params.accountId, deletedAt: null },
    include: { device: true, socialAccount: true },
  });

  if (!post) return NextResponse.json({ message: 'Không tìm thấy bài đăng' }, { status: 404 });
  if (post.status === 'PUBLISHED') return NextResponse.json({ message: 'Bài đã được đăng' }, { status: 400 });
  if (post.status === 'PUBLISHING') return NextResponse.json({ message: 'Bài đang được đăng' }, { status: 400 });
  if (post.status === 'SCHEDULED_EXTERNAL') {
    return NextResponse.json(
      { message: 'Bài đã được ủy nhiệm TikTok Studio schedule, không cần đăng lại' },
      { status: 400 }
    );
  }
  if (!post.device) return NextResponse.json({ message: 'Bài chưa gắn device để đăng' }, { status: 400 });
  if (post.device.type !== 'ANDROID_DEVICE') return NextResponse.json({ message: 'Đăng ngay chỉ hỗ trợ Android device' }, { status: 400 });
  if (post.device.locked) return NextResponse.json({ message: 'Device đang bị khóa' }, { status: 400 });
  if (post.device.healthStatus === 'OFFLINE' || post.device.status === 'DISCONNECTED') {
    return NextResponse.json({ message: 'Device đang offline, chưa thể đăng' }, { status: 409 });
  }

  // External TikTok Studio schedule mode: chỉ chấp nhận cho TIKTOK_BUSINESS account + có scheduledAt + 15p-10 ngày.
  if (parsedBody.publishMode === 'external_tiktok_studio') {
    if (post.socialAccount?.type !== 'TIKTOK_BUSINESS') {
      return NextResponse.json(
        { message: 'External TikTok Studio schedule chỉ áp dụng cho TIKTOK_BUSINESS account' },
        { status: 400 }
      );
    }
    if (!post.scheduledAt) {
      return NextResponse.json(
        { message: 'Cần đặt scheduledAt trước khi dùng External schedule' },
        { status: 400 }
      );
    }
    const now = Date.now();
    const scheduleMs = post.scheduledAt.getTime();
    const minMs = now + 15 * 60_000; // 15 phút
    const maxMs = now + 10 * 24 * 3600_000; // 10 ngày
    if (scheduleMs < minMs) {
      return NextResponse.json(
        { message: 'TikTok Studio yêu cầu lịch tối thiểu 15 phút từ bây giờ' },
        { status: 400 }
      );
    }
    if (scheduleMs > maxMs) {
      return NextResponse.json(
        { message: 'TikTok Studio yêu cầu lịch tối đa 10 ngày từ bây giờ' },
        { status: 400 }
      );
    }
    // Update publishMode trên Post trước khi gọi executePublish.
    await prisma.post.update({
      where: { id: post.id },
      data: { publishMode: 'external_tiktok_studio' },
    });
  } else {
    // Default mode: clear nếu trước đó là external.
    if (post.publishMode === 'external_tiktok_studio') {
      await prisma.post.update({ where: { id: post.id }, data: { publishMode: 'gami' } });
    }
  }

  // Thử chiếm lock device nhanh (3s). Nếu device đang bận đăng bài khác -> trả 409 để UI báo,
  // thay vì âm thầm xếp hàng dài. Sau khi chiếm được lock thì chạy nền (UI poll trạng thái).
  const launch = executePublish(post.id, 'manual', { lockMaxWaitMs: 3_000 });

  // Đợi tối đa ~3.5s: nếu lock bận sẽ trả RETRY sớm; nếu chiếm được, executePublish vẫn chạy tiếp nền.
  const raced = await Promise.race([
    launch,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3_500);
    }),
  ]);

  if (raced && raced.status === 'RETRY') {
    return NextResponse.json({ message: 'Device đang bận đăng bài khác, thử lại sau.' }, { status: 409 });
  }

  // Không chặn response chờ mobilerun (~120s) hoàn tất.
  launch.catch((error) => {
    console.error('manual publish failed', post.id, error);
  });

  const msg =
    parsedBody.publishMode === 'external_tiktok_studio'
      ? 'Đang ủy nhiệm TikTok Studio đặt lịch…'
      : 'Đang đăng bài qua app…';

  return NextResponse.json({ data: { postId: post.id, status: 'PUBLISHING' }, message: msg }, { status: 202 });
}
