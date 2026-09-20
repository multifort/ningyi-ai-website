import { NextRequest, NextResponse } from 'next/server';
import { db, sqlite } from '../../../../lib/db';
import { heroConfig, heroImages } from '../../../../drizzle/schema';
import { requireAuth } from '../../../../lib/middleware';
import { eq, desc } from 'drizzle-orm';

const slideCopyDefaults = [
  { kicker: '从项目材料到完整成果', title: '企业项目方案与成果智能交付服务', description: '把文档、会议纪要、功能表格与需求片段，整理成可汇报、可评审、可执行的项目成果。', benefits: ['方案形成更快', '内容逻辑更清晰', '交付结果更一致'], alt: '零散项目材料经过交付工坊形成多类项目成果' },
  { kicker: '项目理解', title: '先把零散资料，\n整理成一套清晰可执行的\n项目事实', description: '从需求片段、会议纪要、功能清单与外部系统信息中，\n快速识别目标、范围、约束与待确认事项，\n帮助团队先把项目共识建立起来。', benefits: ['目标清楚', '边界明确', '缺口可确认'], alt: '零散项目资料汇入结构清晰的项目事实文件' },
  { kicker: '范围与成本联动', title: '范围一变，工作量、周期与报价同步更新', description: '让功能范围、角色投入、实施周期与报价建议保持关联，减少重复修改、口径冲突和沟通成本。', benefits: ['工作量联动', '周期联动', '报价依据清楚'], alt: '项目功能范围与工作量、周期和报价建议保持关联' },
  { kicker: '多成果一致交付', title: '一份项目事实，持续形成多类一致成果', description: '需求、功能、方案、估算、报价、实施与汇报共享同一项目口径，减少重复整理与交付偏差。', benefits: ['统一项目事实', '七类标准成果', '变更影响可追踪'], alt: '统一项目事实生成多种一致的项目成果文件' },
];

function ensureHeroSlideColumns() {
  const columns = sqlite.prepare('PRAGMA table_info(hero_images)').all() as Array<{ name: string }>;
  for (const column of ['kicker', 'title', 'description', 'benefits', 'alt']) {
    if (!columns.some((item) => item.name === column)) sqlite.exec(`ALTER TABLE hero_images ADD COLUMN ${column} TEXT`);
  }
}

// GET: 获取 Hero 配置
export async function GET() {
  try {
    const { sqlite } = await import('../../../../lib/db');
    ensureHeroSlideColumns();
    
    // 获取 Hero 配置
    const configRow: any = sqlite.prepare(`
      SELECT * FROM hero_config ORDER BY id DESC LIMIT 1
    `).get();

    const config = configRow ? {
      title: configRow.title,
      subtitle: configRow.subtitle,
      ctaPrimaryText: configRow.cta_primary_text,
      ctaPrimaryLink: configRow.cta_primary_link,
      ctaSecondaryText: configRow.cta_secondary_text,
      ctaSecondaryLink: configRow.cta_secondary_link,
    } : null;

    // 获取轮播图
    let images: any[] = sqlite.prepare(`
      SELECT * FROM hero_images WHERE is_active = 1 ORDER BY sort_order ASC
    `).all();

    // 如果数据库中没有图片，返回默认图片路径
    if (images.length === 0) {
      images = [
        { id: 1, image_path: '/images/project-delivery/hero-service-overview-v4.png', sort_order: 0, is_active: 1 },
        { id: 2, image_path: '/images/project-delivery/hero-project-understanding-v4.png', sort_order: 1, is_active: 1 },
        { id: 3, image_path: '/images/project-delivery/hero-scope-cost-linkage-v4.png', sort_order: 2, is_active: 1 },
        { id: 4, image_path: '/images/project-delivery/hero-multi-deliverable-v4.png', sort_order: 3, is_active: 1 },
      ];
    }

    // 格式化字段名以匹配前端
    const formattedImages = images.map((img: any, index: number) => {
      const defaults = slideCopyDefaults[index % slideCopyDefaults.length];
      let benefits = defaults.benefits;
      try { if (img.benefits) benefits = JSON.parse(img.benefits); } catch { benefits = defaults.benefits; }
      return {
        imagePath: img.image_path || img.imagePath,
        isActive: Boolean(img.is_active ?? img.isActive),
        sortOrder: img.sort_order || img.sortOrder,
        kicker: img.kicker || defaults.kicker,
        title: img.title || defaults.title,
        description: img.description || defaults.description,
        benefits,
        alt: img.alt || defaults.alt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        config,
        images: formattedImages,
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
      ensureHeroSlideColumns();
      await db.delete(heroImages);
      
      for (let i = 0; i < images.length; i++) {
        await db.insert(heroImages).values({
          imagePath: images[i].imagePath,
          sortOrder: i,
          isActive: images[i].isActive !== false,
          kicker: images[i].kicker || '',
          title: images[i].title || '',
          description: images[i].description || '',
          benefits: JSON.stringify(images[i].benefits || []),
          alt: images[i].alt || '',
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
