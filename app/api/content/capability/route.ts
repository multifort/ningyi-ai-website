import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { capabilityModules } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const { sqlite } = await import('../../../../lib/db');
    
    const modules = sqlite.prepare(`
      SELECT * FROM capability_modules
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all();

    return NextResponse.json({
      success: true,
      data: modules.map((m: any) => ({
        id: m.id,
        icon: m.icon,
        title: m.title,
        description: m.description,
        sortOrder: m.sort_order,
        isActive: Boolean(m.is_active),
      })),
    });
  } catch (error) {
    console.error('获取能力模块失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { icon, title, description, sortOrder } = body;

    await db.insert(capabilityModules).values({
      icon,
      title,
      description,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, message: '创建成功' });
  } catch (error) {
    console.error('创建能力模块失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { id, icon, title, description, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少 ID 参数' }, { status: 400 });
    }

    await db.update(capabilityModules)
      .set({ icon, title, description, sortOrder, isActive })
      .where(eq(capabilityModules.id, id));

    return NextResponse.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新能力模块失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 ID 参数' }, { status: 400 });
    }

    await db.delete(capabilityModules).where(eq(capabilityModules.id, Number(id)));

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除能力模块失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
