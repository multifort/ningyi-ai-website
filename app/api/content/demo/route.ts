import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { demoQuestions } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const { sqlite } = await import('../../../../lib/db');
    
    const questions = sqlite.prepare(`
      SELECT * FROM demo_questions
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all();

    return NextResponse.json({
      success: true,
      data: questions.map((q: any) => ({
        id: q.id,
        question: q.question,
        response: {
          summary: q.response_summary,
          anomalies: q.response_anomalies,
          advice: q.response_advice,
        },
        sortOrder: q.sort_order,
        isActive: Boolean(q.is_active),
      })),
    });
  } catch (error) {
    console.error('获取 Demo 对话失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { question, response, sortOrder } = body;

    await db.insert(demoQuestions).values({
      question,
      responseSummary: response.summary,
      responseAnomalies: response.anomalies,
      responseAdvice: response.advice,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, message: '创建成功' });
  } catch (error) {
    console.error('创建 Demo 对话失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { id, question, response, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少 ID 参数' }, { status: 400 });
    }

    await db.update(demoQuestions)
      .set({
        question,
        responseSummary: response.summary,
        responseAnomalies: response.anomalies,
        responseAdvice: response.advice,
        sortOrder,
        isActive,
      })
      .where(eq(demoQuestions.id, id));

    return NextResponse.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新 Demo 对话失败:', error);
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

    await db.delete(demoQuestions).where(eq(demoQuestions.id, Number(id)));

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除 Demo 对话失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
