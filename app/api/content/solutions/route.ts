import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { solutions, solutionFeatures } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, asc } from 'drizzle-orm';

// GET: 获取所有解决方案
export async function GET() {
  try {
    const { sqlite } = await import('../../../../lib/db');
    
    // 直接执行 SQL 查询
    const solutionsList = sqlite.prepare(`
      SELECT s.*, GROUP_CONCAT(sf.feature_text, '|||') as features_concat
      FROM solutions s
      LEFT JOIN solution_features sf ON s.id = sf.solution_id
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY s.sort_order ASC
    `).all();

    // 格式化数据
    const formattedSolutions = solutionsList.map((sol: any) => ({
      id: sol.id,
      icon: sol.icon,
      title: sol.title,
      slug: sol.slug,
      description: sol.description,
      heroImage: sol.hero_image,
      painPoints: sol.pain_points,
      solutionDetail: sol.solution_detail,
      advantage: sol.advantage,
      sortOrder: sol.sort_order,
      isActive: Boolean(sol.is_active),
      features: sol.features_concat ? sol.features_concat.split('|||') : [],
    }));

    return NextResponse.json({
      success: true,
      data: formattedSolutions,
    });
  } catch (error) {
    console.error('获取解决方案失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// POST: 创建新解决方案
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { icon, title, slug, description, features, heroImage, painPoints, solutionDetail, advantage, sortOrder } = body;

    // 插入解决方案
    const result = await db.insert(solutions).values({
      icon,
      title,
      slug,
      description,
      heroImage,
      painPoints,
      solutionDetail,
      advantage,
      sortOrder: sortOrder || 0,
    }).returning();

    const solutionId = result[0].id;

    // 插入特性
    if (features && Array.isArray(features)) {
      for (let i = 0; i < features.length; i++) {
        await db.insert(solutionFeatures).values({
          solutionId,
          featureText: features[i],
          sortOrder: i,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '解决方案创建成功',
      data: { id: solutionId },
    });
  } catch (error) {
    console.error('创建解决方案失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// PUT: 更新解决方案
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { id, icon, title, slug, description, features, heroImage, painPoints, solutionDetail, advantage, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: '缺少 ID 参数' },
        { status: 400 }
      );
    }

    // 更新解决方案
    await db.update(solutions)
      .set({
        icon,
        title,
        slug,
        description,
        heroImage,
        painPoints,
        solutionDetail,
        advantage,
        sortOrder,
        isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(solutions.id, id));

    // 更新特性（先删除旧的，再插入新的）
    if (features && Array.isArray(features)) {
      await db.delete(solutionFeatures)
        .where(eq(solutionFeatures.solutionId, id));

      for (let i = 0; i < features.length; i++) {
        await db.insert(solutionFeatures).values({
          solutionId: id,
          featureText: features[i],
          sortOrder: i,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '解决方案更新成功',
    });
  } catch (error) {
    console.error('更新解决方案失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// DELETE: 删除解决方案
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: '缺少 ID 参数' },
        { status: 400 }
      );
    }

    // 删除解决方案（会级联删除特性）
    await db.delete(solutions)
      .where(eq(solutions.id, Number(id)));

    return NextResponse.json({
      success: true,
      message: '解决方案删除成功',
    });
  } catch (error) {
    console.error('删除解决方案失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
