import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { heroConfig, heroImages } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, desc } from 'drizzle-orm';

// GET: 获取 Hero 配置
export async function GET() {
  try {
    const { sqlite } = await import('../../../../lib/db');
    
    // 获取 Hero 配置
    const config = sqlite.prepare(`
      SELECT * FROM hero_config ORDER BY id DESC LIMIT 1
    `).get();

    // 获取轮播图
    const images = sqlite.prepare(`
      SELECT * FROM hero_images WHERE is_active = 1 ORDER BY sort_order ASC
    `).all();

    return NextResponse.json({
      success: true,
      data: {
        config,
        images,
      },
    });
  } catch (error) {
    console.error('获取 Hero 配置失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// PUT: 更新 Hero 配置
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('status' in authResult) return authResult;

    const body = await request.json();
    const { config, images } = body;

    // 更新 Hero 配置
    if (config) {
      const existingConfig = await db.query.heroConfig.findFirst({
        orderBy: desc(heroConfig.id),
      });

      if (existingConfig) {
        await db.update(heroConfig)
          .set({
            title: config.title,
            subtitle: config.subtitle,
            ctaPrimaryText: config.ctaPrimaryText,
            ctaPrimaryLink: config.ctaPrimaryLink,
            ctaSecondaryText: config.ctaSecondaryText,
            ctaSecondaryLink: config.ctaSecondaryLink,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(heroConfig.id, existingConfig.id));
      }
    }

    // 更新轮播图（先删除旧的，再插入新的）
    if (images && Array.isArray(images)) {
      await db.delete(heroImages);
      
      for (let i = 0; i < images.length; i++) {
        await db.insert(heroImages).values({
          imagePath: images[i].imagePath,
          sortOrder: i,
          isActive: images[i].isActive !== false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Hero 配置更新成功',
    });
  } catch (error) {
    console.error('更新 Hero 配置失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
