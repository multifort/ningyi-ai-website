import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/middleware';

// GET: 获取所有场景
export async function GET() {
  try {
    const scenariosList = sqlite.prepare(`
      SELECT * FROM solution_scenarios
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all();

    const formattedScenarios = scenariosList.map((s: any) => ({
      id: s.id,
      icon: s.icon,
      title: s.title,
      slug: s.slug,
      subtitle: s.subtitle,
      pain: s.pain,
      solution: s.solution,
      heroImage: s.hero_image,
      painPoints: s.pain_points,
      solutionDetail: s.solution_detail,
      advantage: s.advantage,
      sortOrder: s.sort_order,
      isActive: Boolean(s.is_active),
    }));

    return NextResponse.json({
      success: true,
      data: formattedScenarios,
    });
  } catch (error) {
    console.error('获取场景失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// POST: 创建新场景
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) return authResult;

    const body = await request.json();
    const { icon, title, slug, subtitle, pain, solution, heroImage, painPoints, solutionDetail, advantage, sortOrder } = body;

    sqlite.prepare(`
      INSERT INTO solution_scenarios (icon, title, slug, subtitle, pain, solution, hero_image, pain_points, solution_detail, advantage, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(icon, title, slug, subtitle, pain, solution, heroImage, painPoints, solutionDetail, advantage, sortOrder || 0);

    return NextResponse.json({
      success: true,
      message: '场景创建成功',
    });
  } catch (error) {
    console.error('创建场景失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// PUT: 更新场景
export async function PUT(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) return authResult;

    const body = await request.json();
    const { id, icon, title, slug, subtitle, pain, solution, heroImage, painPoints, solutionDetail, advantage, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: '缺少 ID 参数' },
        { status: 400 }
      );
    }

    sqlite.prepare(`
      UPDATE solution_scenarios 
      SET icon = ?, title = ?, slug = ?, subtitle = ?, pain = ?, solution = ?, 
          hero_image = ?, pain_points = ?, solution_detail = ?, advantage = ?, 
          sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(icon, title, slug, subtitle, pain, solution, heroImage, painPoints, solutionDetail, advantage, sortOrder, isActive, id);

    return NextResponse.json({
      success: true,
      message: '场景更新成功',
    });
  } catch (error) {
    console.error('更新场景失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// DELETE: 删除场景
export async function DELETE(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) return authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: '缺少 ID 参数' },
        { status: 400 }
      );
    }

    sqlite.prepare('DELETE FROM solution_scenarios WHERE id = ?').run(Number(id));

    return NextResponse.json({
      success: true,
      message: '场景删除成功',
    });
  } catch (error) {
    console.error('删除场景失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
