import { NextResponse } from 'next/server';

// ----------------------------------------------------------------------

export async function POST() {
  return NextResponse.json(
    {
      message: 'Đăng ký tài khoản công khai đang tắt. Admin tạo nhân viên trong dashboard.',
    },
    { status: 403 }
  );
}
