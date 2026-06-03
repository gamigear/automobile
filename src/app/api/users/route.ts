import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatUserRow } from 'src/lib/api-formatters';
// data
import { users } from 'src/sections/social-admin/mock';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
});

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: users });

  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });

  return NextResponse.json({ data: rows.map(formatUserRow) });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = CreateUserSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu nhân viên không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        data: {
          id: `user_${Date.now()}`,
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          status: 'Active',
        },
      },
      { status: 201 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (existing) {
    return NextResponse.json({ message: 'Email đã tồn tại' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
  });

  return NextResponse.json({ data: formatUserRow(user) }, { status: 201 });
}
