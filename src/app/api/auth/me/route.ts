import { NextResponse } from 'next/server';
// utils
import { authUserFromPayload, verifyAccessToken } from 'src/lib/auth-token';

// ----------------------------------------------------------------------

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    return NextResponse.json({ message: 'Phiên đăng nhập không hợp lệ' }, { status: 401 });
  }

  return NextResponse.json({ user: authUserFromPayload(payload) });
}
