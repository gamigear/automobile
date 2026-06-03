import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';
import { formatAccountRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: null });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { id: params.accountId },
    include: {
      devices: {
        include: {
          device: true,
        },
      },
    },
  });

  if (!account) return NextResponse.json({ message: 'Không tìm thấy tài khoản' }, { status: 404 });

  return NextResponse.json({ data: formatAccountRow(account) });
}
