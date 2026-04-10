import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../../lib/db';

// GET: 根据 slug 获取解决方案详情
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    // 查询解决方案
    let solution = sqlite.prepare(`
      SELECT s.*, GROUP_CONCAT(sf.feature_text, '|||') as features_concat, 'solution' as source_type
      FROM solutions s
      LEFT JOIN solution_features sf ON s.id = sf.solution_id
      WHERE s.slug = ? AND s.is_active = 1
      GROUP BY s.id
    `).get(slug) as any;

    // 如果在 solutions 表中未找到，尝试在 solution_scenarios 表中查找
    if (!solution) {
      solution = sqlite.prepare(`
        SELECT *, NULL as features_concat, 'scenario' as source_type
        FROM solution_scenarios
        WHERE slug = ? AND is_active = 1
      `).get(slug) as any;
    }

    if (!solution) {
      return NextResponse.json(
        { error: '解决方案不存在' },
        { status: 404 }
      );
    }

    // 格式化数据
    const formattedSolution = {
      id: solution.id,
      icon: solution.icon,
      title: solution.title,
      slug: solution.slug,
      description: solution.description,
      heroImage: solution.hero_image,
      painPoints: solution.pain_points,
      solutionDetail: solution.solution_detail,
      advantage: solution.advantage,
      features: solution.features_concat ? solution.features_concat.split('|||') : [],
    };

    return NextResponse.json({
      success: true,
      data: formattedSolution,
    });
  } catch (error) {
    console.error('获取解决方案详情失败:', error);
    return NextResponse.json(
      { error: '服务器错误', details: (error as Error).message },
      { status: 500 }
    );
  }
}
