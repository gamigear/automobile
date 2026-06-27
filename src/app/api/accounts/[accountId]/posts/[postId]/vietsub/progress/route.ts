import { NextResponse } from 'next/server';
// auth
import { requireRole } from 'src/lib/api-auth';
// progress registry
import { getVietsubProgress } from 'src/server/vietsub-progress';

// ----------------------------------------------------------------------
// Trạng thái tiến trình vietsub của 1 bài (UI poll trong lúc đang chạy).

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string; postId: string } };

export async function GET(request: Request, { params }: Params) {
  const auth = requireRole(request, 'EDITOR');
  if (auth.error) return auth.error;

  return NextResponse.json({ data: getVietsubProgress(params.postId) });
}
