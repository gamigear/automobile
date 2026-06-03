import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { NextResponse } from 'next/server';
// utils
import { authUserFromPayload, signAccessToken } from 'src/lib/auth-token';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu đăng nhập không hợp lệ' }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@gami.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const { email, password } = parsed.data;

  if (process.env.DATABASE_URL) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user?.active && user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
      const payload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const accessToken = signAccessToken(payload);

      return NextResponse.json({
        accessToken,
        user: authUserFromPayload({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3 }),
      });
    }
  }

  const passwordMatched = adminPasswordHash
    ? await bcrypt.compare(password, adminPasswordHash)
    : password === adminPassword;

  if (email !== adminEmail || !passwordMatched) {
    return NextResponse.json({ message: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }

  const payload = {
    sub: 'admin',
    email,
    name: 'Admin',
    role: 'ADMIN',
  };
  const accessToken = signAccessToken(payload);

  return NextResponse.json({
    accessToken,
    user: authUserFromPayload({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3 }),
  });
}
