import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const rows = await prisma.socialAccountMember.findMany({
    where: { socialAccountId: params.accountId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    data: rows.map((member) => ({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      status: member.user.active ? 'Active' : 'Inactive',
    })),
  });
}
