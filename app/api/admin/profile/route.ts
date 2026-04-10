import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../../lib/db';
import { requireAuth } from '../../../../../lib/middleware';
import bcrypt from 'bcryptjs';

// PUT: 修改密码
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    // 验证输入
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: '请填写所有字段' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: '新密码与确认密码不一致' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '新密码长度至少为 6 位' },
        { status: 400 }
      );
    }

    // 获取当前用户
    const admin = sqlite.prepare('SELECT * FROM admins WHERE username = ?').get('admin');

    if (!admin) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 验证当前密码
    const isPasswordValid = bcrypt.compareSync(currentPassword, admin.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '当前密码错误' },
        { status: 401 }
      );
    }

    // 加密新密码
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // 更新密码
    sqlite.prepare(
      'UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?'
    ).run(newPasswordHash, 'admin');

    return NextResponse.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
