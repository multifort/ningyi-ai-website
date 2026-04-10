import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { valueStats } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const stats = await db.query.valueStats.findMany({
      orderBy: asc(valueStats.sortOrder),
    });

    return NextResponse.json({
      success: true,
      data: stats.map((s) => ({
        id: s.id,
        label: s.label,
        value: s.value,
        suffix: s.suffix,
        sortOrder: s.sortOrder,
        isActive: s.isActive,
      })),
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { stats } = body;

    if (!stats || !Array.isArray(stats)) {
      return NextResponse.json({ error: '数据格式错误' }, { status: 400 });
    }

    // 批量更新
    for (const stat of stats) {
      await db.update(valueStats)
        .set({
          label: stat.label,
          value: stat.value,
          suffix: stat.suffix,
          sortOrder: stat.sortOrder,
          isActive: stat.isActive,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(valueStats.id, stat.id));
    }

    return NextResponse.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新统计数据失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
