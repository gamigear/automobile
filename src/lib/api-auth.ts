import { NextResponse } from 'next/server';
// utils
import { verifyAccessToken } from 'src/lib/auth-token';

const roleRank: Record<string, number> = {
  VIEWER: 0,
  STAFF: 1,
  EDITOR: 2,
  APPROVER: 3,
  ADMIN: 4,
};

export function requireRole(request: Request, minimumRole: keyof typeof roleRank) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    return {
      error: NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 }),
      user: null,
    };
  }

  if ((roleRank[payload.role] ?? -1) < roleRank[minimumRole]) {
    return {
      error: NextResponse.json({ message: 'Bạn không có quyền thực hiện thao tác này' }, { status: 403 }),
      user: null,
    };
  }

  return { error: null, user: payload };
}
