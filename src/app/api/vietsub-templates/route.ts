import { NextResponse } from 'next/server';
import { z } from 'zod';
// auth
import { requireRole } from 'src/lib/api-auth';
// service
import {
  listVietsubTemplates,
  addVietsubTemplate,
  deleteVietsubTemplate,
} from 'src/server/vietsub-templates';

// ----------------------------------------------------------------------
// Template bối cảnh/nhân vật cho vietsub (builtin + custom).

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  hint: z.string().min(1).max(2000),
});

export async function GET(request: Request) {
  const auth = requireRole(request, 'EDITOR');
  if (auth.error) return auth.error;

  return NextResponse.json({ data: await listVietsubTemplates() });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'EDITOR');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Tên và nội dung template không hợp lệ' }, { status: 400 });

  const template = await addVietsubTemplate(parsed.data.name, parsed.data.hint);

  return NextResponse.json({ data: template }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = requireRole(request, 'EDITOR');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ message: 'Thiếu id template' }, { status: 400 });

  const ok = await deleteVietsubTemplate(id);
  if (!ok) return NextResponse.json({ message: 'Không thể xoá (template dựng sẵn hoặc không tồn tại)' }, { status: 400 });

  return NextResponse.json({ data: { id } });
}
