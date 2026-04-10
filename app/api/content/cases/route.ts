import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { caseStudies, caseResults } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, asc } from 'drizzle-orm';

// GET: 获取所有案例
export async function GET(request: NextRequest) {
  try {
    const { sqlite } = await import('../../../../lib/db');
    
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get('industry');
    
    // 构建查询语句
    let query = `
      SELECT c.*, GROUP_CONCAT(cr.label || '|||' || cr.value || '|||' || cr.icon, ';;;') as results_concat
      FROM case_studies c
      LEFT JOIN case_results cr ON c.id = cr.case_id
      WHERE c.is_active = 1
    `;
    
    const params: any[] = [];
    
    // 如果传入了industry参数，添加筛选条件
    if (industry) {
      query += ' AND c.industry = ?';
      params.push(industry);
    }
    
    query += ' GROUP BY c.id ORDER BY c.sort_order ASC';
    
    // 执行查询
    const casesList = sqlite.prepare(query).all(...params);

    const formattedCases = casesList.map((c: any) => {
      // 解析结果数据
      let results = [];
      if (c.results_concat) {
        results = c.results_concat.split(';;;').map((item: string) => {
          const [label, value, icon] = item.split('|||');
          return { label, value, icon };
        });
      }

      return {
        id: c.id,
        title: c.title,
        industry: c.industry,
        problem: c.problem,
        solution: c.solution,
        sortOrder: c.sort_order,
        isActive: Boolean(c.is_active),
        results,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedCases,
    });
  } catch (error) {
    console.error('获取案例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// POST: 创建新案例
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { title, industry, problem, solution, results, sortOrder } = body;

    const result = await db.insert(caseStudies).values({
      title,
      industry,
      problem,
      solution,
      sortOrder: sortOrder || 0,
    }).returning();

    const caseId = result[0].id;

    if (results && Array.isArray(results)) {
      for (let i = 0; i < results.length; i++) {
        await db.insert(caseResults).values({
          caseId,
          label: results[i].label,
          value: results[i].value,
          icon: results[i].icon,
          sortOrder: i,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '案例创建成功',
      data: { id: caseId },
    });
  } catch (error) {
    console.error('创建案例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// PUT: 更新案例
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { id, title, industry, problem, solution, results, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少 ID 参数' }, { status: 400 });
    }

    await db.update(caseStudies)
      .set({
        title,
        industry,
        problem,
        solution,
        sortOrder,
        isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(caseStudies.id, id));

    if (results && Array.isArray(results)) {
      await db.delete(caseResults).where(eq(caseResults.caseId, id));

      for (let i = 0; i < results.length; i++) {
        await db.insert(caseResults).values({
          caseId: id,
          label: results[i].label,
          value: results[i].value,
          icon: results[i].icon,
          sortOrder: i,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '案例更新成功',
    });
  } catch (error) {
    console.error('更新案例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// DELETE: 删除案例
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 ID 参数' }, { status: 400 });
    }

    await db.delete(caseStudies).where(eq(caseStudies.id, Number(id)));

    return NextResponse.json({
      success: true,
      message: '案例删除成功',
    });
  } catch (error) {
    console.error('删除案例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
