import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '../../../../lib/db';

// 获取 Footer 配置
export async function GET() {
  try {
    const config = sqlite.prepare(
      'SELECT * FROM footer_config LIMIT 1'
    ).get() as any;

    const linksList = sqlite.prepare(
      'SELECT * FROM footer_links WHERE is_active = 1 ORDER BY category, sort_order'
    ).all();

    // 按类别分组链接
    const links: Record<string, Array<{ id: number; title: string; href: string }>> = {
      product: [],
      solution: [],
      company: [],
    };

    linksList.forEach((link: any) => {
      if (links[link.category]) {
        links[link.category].push({
          id: link.id,
          title: link.title,
          href: link.href,
        });
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        config: config || {},
        links,
      },
    });
  } catch (error) {
    console.error('获取 Footer 配置失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 更新 Footer 配置
export async function PUT(request: NextRequest) {
  try {
    const { requireAuth } = await import('../../../../lib/middleware');
    const authResult = requireAuth(request);
    if (authResult && 'status' in authResult) {
      return authResult;
    }

    const body = await request.json();
    const { config, links } = body;

    // 更新配置
    if (config) {
      sqlite.prepare(
        `INSERT INTO footer_config (id, company_description, email, phone, address, copyright) 
         VALUES (1, ?, ?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET 
         company_description = excluded.company_description,
         email = excluded.email,
         phone = excluded.phone,
         address = excluded.address,
         copyright = excluded.copyright`
      ).run(
        config.companyDescription || '',
        config.email || '',
        config.phone || '',
        config.address || '',
        config.copyright || ''
      );
    }

    // 更新链接（先删除所有，再重新插入）
    if (links) {
      sqlite.prepare('DELETE FROM footer_links').run();
      
      Object.entries(links).forEach(([category, categoryLinks]: [string, any]) => {
        categoryLinks.forEach((link: any, index: number) => {
          sqlite.prepare(
            'INSERT INTO footer_links (category, title, href, sort_order) VALUES (?, ?, ?, ?)'
          ).run(category, link.title, link.href, index);
        });
      });
    }

    return NextResponse.json({
      success: true,
      message: '保存成功',
    });
  } catch (error) {
    console.error('更新 Footer 配置失败:', error);
    return NextResponse.json(
      { error: '更新失败' },
      { status: 500 }
    );
  }
}
