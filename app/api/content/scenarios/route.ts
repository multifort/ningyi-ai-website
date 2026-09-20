import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/middleware';

function ensureFlowStepsColumn() {
  const columns = sqlite.prepare('PRAGMA table_info(solution_scenarios)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'flow_steps')) {
    sqlite.exec('ALTER TABLE solution_scenarios ADD COLUMN flow_steps TEXT');
  }
}

function parseFlowSteps(value: string | null) {
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

const defaultFlowSteps = [
  [{ title: '需求文档', detail: '背景 · 目标 · 约束' }, { title: '功能清单', detail: '角色 · 模块 · 流程' }, { title: '方案蓝图', detail: '架构 · 边界 · 关系' }, { title: '估算与报价', detail: '人日 · 周期 · 建议' }],
  [{ title: '系统现状', detail: '系统 · 接口 · 约束' }, { title: '接口关系', detail: '调用 · 协议 · 边界' }, { title: '数据与部署', detail: '数据流 · 环境 · 安全' }, { title: '实施计划', detail: '依赖 · 联调 · 上线' }],
  [{ title: '现状诊断', detail: '业务 · 系统 · 痛点' }, { title: '目标蓝图', detail: '目标 · 能力 · 范围' }, { title: '分阶段路线', detail: '优先级 · 阶段 · 里程碑' }, { title: '风险与投入', detail: '资源 · 成本 · 风险' }],
];

// GET: 获取所有场景
export async function GET() {
  try {
    ensureFlowStepsColumn();
    const scenariosList = sqlite.prepare(`
      SELECT * FROM solution_scenarios
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all();

    const formattedScenarios = scenariosList.map((s: any, index: number) => ({
      id: s.id,
      icon: s.icon,
      title: s.title,
      slug: s.slug,
      subtitle: s.subtitle,
      pain: s.pain,
      solution: s.solution,
      flowSteps: parseFlowSteps(s.flow_steps).length ? parseFlowSteps(s.flow_steps) : (defaultFlowSteps[index] || defaultFlowSteps[0]),
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
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { icon, title, slug, subtitle, pain, solution, flowSteps, heroImage, painPoints, solutionDetail, advantage, sortOrder } = body;

    ensureFlowStepsColumn();

    sqlite.prepare(`
      INSERT INTO solution_scenarios (icon, title, slug, subtitle, pain, solution, flow_steps, hero_image, pain_points, solution_detail, advantage, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(icon, title, slug, subtitle, pain, solution, JSON.stringify(flowSteps || []), heroImage, painPoints, solutionDetail, advantage, sortOrder || 0);

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
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { id, icon, title, slug, subtitle, pain, solution, flowSteps, heroImage, painPoints, solutionDetail, advantage, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: '缺少 ID 参数' },
        { status: 400 }
      );
    }

    ensureFlowStepsColumn();
    sqlite.prepare(`
      UPDATE solution_scenarios 
      SET icon = ?, title = ?, slug = ?, subtitle = ?, pain = ?, solution = ?, 
          flow_steps = ?, hero_image = ?, pain_points = ?, solution_detail = ?, advantage = ?,
          sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(icon, title, slug, subtitle, pain, solution, JSON.stringify(flowSteps || []), heroImage, painPoints, solutionDetail, advantage, sortOrder, isActive, id);

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
