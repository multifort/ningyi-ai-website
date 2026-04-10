import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../lib/db';

// 提交预约信息（公开接口，不需要认证）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, company, phone, description } = body;

    // 验证必填字段
    if (!name || !company || !phone) {
      return NextResponse.json(
        { error: '请填写完整信息' },
        { status: 400 }
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: '请输入有效的11位手机号码' },
        { status: 400 }
      );
    }

    // 插入数据库
    sqlite.prepare(
      `INSERT INTO reservations (name, company, phone, description, status) 
       VALUES (?, ?, ?, ?, 'pending')`
    ).run(name, company, phone, description || '');

    return NextResponse.json({
      success: true,
      message: '预约成功',
    });
  } catch (error) {
    console.error('提交预约信息失败:', error);
    return NextResponse.json(
      { error: '提交失败' },
      { status: 500 }
    );
  }
}

// 获取预约信息列表（需要认证）
export async function GET(request: NextRequest) {
  try {
    const { requireAuth } = await import('../../../../lib/middleware');
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) {
      return authResult;
    }

    const reservationsList = sqlite.prepare(
      'SELECT * FROM reservations ORDER BY created_at DESC'
    ).all();

    return NextResponse.json({
      success: true,
      data: reservationsList,
    });
  } catch (error) {
    console.error('获取预约信息失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 更新预约状态
export async function PUT(request: NextRequest) {
  try {
    const { requireAuth } = await import('../../../../lib/middleware');
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) {
      return authResult;
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: '参数不完整' },
        { status: 400 }
      );
    }

    sqlite.prepare(
      'UPDATE reservations SET status = ? WHERE id = ?'
    ).run(status, id);

    return NextResponse.json({
      success: true,
      message: '更新成功',
    });
  } catch (error) {
    console.error('更新预约状态失败:', error);
    return NextResponse.json(
      { error: '更新失败' },
      { status: 500 }
    );
  }
}
