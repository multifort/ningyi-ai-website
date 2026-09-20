PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

DELETE FROM hero_images;
DELETE FROM hero_config;
DELETE FROM solution_features;
DELETE FROM solutions;
DELETE FROM solution_scenarios;
DELETE FROM case_results;
DELETE FROM case_studies;
DELETE FROM demo_questions;
DELETE FROM capability_modules;
DELETE FROM value_stats;
DELETE FROM footer_links;

DELETE FROM sqlite_sequence WHERE name IN (
  'hero_images', 'hero_config', 'solution_features', 'solutions',
  'solution_scenarios', 'case_results', 'case_studies', 'demo_questions',
  'capability_modules', 'value_stats', 'footer_links'
);

INSERT INTO hero_config (
  title, subtitle, cta_primary_text, cta_primary_link,
  cta_secondary_text, cta_secondary_link
) VALUES (
  '企业项目方案与成果智能交付服务',
  '把文档、会议纪要、功能表格与需求片段，整理成可汇报、可评审、可执行的项目成果。',
  '申请项目分析', '#cta', '查看交付成果', '#case'
);

INSERT INTO hero_images (image_path, sort_order, is_active) VALUES
  ('/images/project-delivery/hero-service-overview-v4.png', 0, 1),
  ('/images/project-delivery/hero-project-understanding-v4.png', 1, 1),
  ('/images/project-delivery/hero-scope-cost-linkage-v4.png', 2, 1),
  ('/images/project-delivery/hero-multi-deliverable-v4.png', 3, 1);

INSERT INTO solutions (
  icon, title, slug, description, hero_image, pain_points,
  solution_detail, advantage, sort_order, is_active
) VALUES
  (
    '软件团队', '中小软件公司', 'software-project',
    '客户资料刚到，快速形成一版可讨论、可估算、可报价的项目成果。',
    '/images/project-delivery/software-team-project-review.png',
    '<h2>常见难点</h2><p>老板、技术负责人或产品经理经常兼顾售前，客户资料到达后需要在很短时间内形成方案和报价。</p><ul><li>资料不完整但交付时间明确</li><li>功能范围与报价口径容易变化</li><li>大量时间消耗在整理与复制</li></ul>',
    '<h2>形成成果</h2><p>先整理项目事实、范围、需求与待确认项，再生成需求分析、功能清单、方案、工作量、报价和汇报材料。</p>',
    '<h2>工作方式</h2><p>先交付结构化项目理解与成果初稿，再由项目人员确认关键范围、估算规则与商业判断。</p>',
    0, 1
  ),
  (
    '集成服务', '系统集成与数字化服务商', 'system-integration',
    '统一系统边界、接口、实施与报价口径，降低跨业务和技术团队反复整理。',
    '/images/project-delivery/integration-team-planning.png',
    '<h2>常见难点</h2><p>客户系统多、接口多、材料多，方案需要跨业务、技术与实施团队整合。</p><ul><li>系统与接口关系容易漏项</li><li>方案、工作量和报价口径不一致</li><li>范围变化后多份材料重复修改</li></ul>',
    '<h2>形成成果</h2><p>统一识别系统边界、接口关系、数据流、部署要求和实施依赖，并关联工作量、计划和报价。</p>',
    '<h2>工作方式</h2><p>用统一项目事实组织范围与依赖，让方案、实施与商务材料保持同一口径。</p>',
    1, 1
  ),
  (
    '项目角色', '售前、项目经理与咨询顾问', 'project-team',
    '同时推进多个项目时，让需求、方案、估算和汇报材料保持同一项目口径。',
    '/images/project-delivery/project-team-coordination.png',
    '<h2>常见难点</h2><p>单人经常同时理解需求、组织方案、估算报价并准备客户汇报。</p><ul><li>重复劳动多</li><li>需求一变就要修改多份材料</li><li>重要判断散落在不同文档中</li></ul>',
    '<h2>形成成果</h2><p>围绕一个项目持续更新需求、功能、方案、估算、报价、实施和汇报成果。</p>',
    '<h2>工作方式</h2><p>让系统承担整理与连续推演，用户保留专业判断权和最终确认权。</p>',
    2, 1
  );

INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '资料不完整也能开始', 0 FROM solutions WHERE slug = 'software-project';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '先识别范围与关键缺口', 1 FROM solutions WHERE slug = 'software-project';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '把时间留给判断与沟通', 2 FROM solutions WHERE slug = 'software-project';

INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '梳理系统与接口关系', 0 FROM solutions WHERE slug = 'system-integration';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '工作量和报价保持联动', 1 FROM solutions WHERE slug = 'system-integration';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '实施依赖清晰可追踪', 2 FROM solutions WHERE slug = 'system-integration';

INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '减少重复复制与改写', 0 FROM solutions WHERE slug = 'project-team';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '范围变化提示关联影响', 1 FROM solutions WHERE slug = 'project-team';
INSERT INTO solution_features (solution_id, feature_text, sort_order)
SELECT id, '成果可继续编辑和复用', 2 FROM solutions WHERE slug = 'project-team';

INSERT INTO solution_scenarios (
  icon, title, slug, subtitle, pain, solution, hero_image,
  pain_points, solution_detail, advantage, sort_order, is_active
) VALUES
  (
    '01', '软件定制开发项目', 'software-customization', '需求到报价',
    '需求描述零散、功能边界模糊，开发工作量难以快速估算。',
    '结构化需求与功能清单，形成总体方案、角色人日、周期、报价建议和客户汇报材料。',
    '/images/project-delivery/project-understanding.jpg',
    '<h2>典型难点</h2><ul><li>需求来源分散</li><li>功能边界模糊</li><li>估算和报价缺少统一依据</li></ul>',
    '<h2>建议成果</h2><ol><li>项目需求分析</li><li>功能清单</li><li>解决方案</li><li>工作量与报价建议</li><li>实施计划和汇报材料</li></ol>',
    '<h2>成果特点</h2><p>从同一项目事实生成，范围变化时可同步更新关联成果。</p>',
    0, 1
  ),
  (
    '02', '多系统集成项目', 'system-integration-project', '边界到实施',
    '涉及多个现有系统、接口、数据源和部署约束，容易漏项或前后口径不一致。',
    '统一识别系统边界、接口关系、数据流、部署约束和实施依赖，并关联估算与计划。',
    '/images/project-delivery/estimation-pricing.jpg',
    '<h2>典型难点</h2><ul><li>系统边界不清</li><li>接口依赖容易遗漏</li><li>实施计划与报价脱节</li></ul>',
    '<h2>建议成果</h2><ol><li>系统范围清单</li><li>接口清单</li><li>集成方案</li><li>工作量与里程碑</li><li>客户汇报材料</li></ol>',
    '<h2>成果特点</h2><p>接口、计划与报价共享项目口径，减少跨团队重复整理。</p>',
    1, 1
  ),
  (
    '03', '企业数字化升级项目', 'digital-transformation', '现状到路线',
    '业务目标较宏观、需求成熟度不一，方案需要兼顾现状、目标与分阶段建设。',
    '区分已确认事实、推演建议和待确认事项，形成现状分析、总体方案、阶段路线和风险建议。',
    '/images/project-delivery/deliverable-suite.jpg',
    '<h2>典型难点</h2><ul><li>建设目标宏观</li><li>需求成熟度不同</li><li>需要平衡现状与阶段投入</li></ul>',
    '<h2>建议成果</h2><ol><li>现状与目标分析</li><li>业务与应用方案</li><li>分阶段建设路线</li><li>风险和报价建议</li></ol>',
    '<h2>成果特点</h2><p>明确事实、推演与待确认项，便于客户共同评审并逐步收敛。</p>',
    2, 1
  );

INSERT INTO case_studies (title, industry, problem, solution, sort_order, is_active) VALUES
  ('软件定制项目方案包', '脱敏成果样例', '原始资料包含需求文档局部章节、功能表格和两段会议纪要，范围与待确认事项分散。', '统一项目目标与范围，拆解功能并关联工作量、报价建议、实施计划和客户汇报逻辑。', 0, 1),
  ('多系统集成项目方案包', '脱敏成果样例', '现有系统、接口、数据流和部署约束分别记录，方案、实施计划与报价容易漏项。', '梳理系统边界与接口依赖，把集成范围、角色工作量、实施里程碑和报价结构关联起来。', 1, 1),
  ('数字化升级项目方案包', '脱敏成果样例', '建设目标宏观、业务成熟度不同，需要兼顾现状、目标与分阶段实施。', '区分事实、推演建议和待确认项，形成现状分析、总体方案、阶段路线与风险建议。', 2, 1);

INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '项目事实源', '统一', '源', 0 FROM case_studies WHERE title = '软件定制项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '成果类型', '7 类', '果', 1 FROM case_studies WHERE title = '软件定制项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '范围变化', '联动更新', '变', 2 FROM case_studies WHERE title = '软件定制项目方案包';

INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '系统边界', '清晰', '界', 0 FROM case_studies WHERE title = '多系统集成项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '接口关系', '可追踪', '接', 1 FROM case_studies WHERE title = '多系统集成项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '计划与报价', '保持联动', '价', 2 FROM case_studies WHERE title = '多系统集成项目方案包';

INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '已确认事实', '单独标记', '实', 0 FROM case_studies WHERE title = '数字化升级项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '推演建议', '可调整', '推', 1 FROM case_studies WHERE title = '数字化升级项目方案包';
INSERT INTO case_results (case_id, label, value, icon, sort_order)
SELECT id, '建设路线', '分阶段', '阶', 2 FROM case_studies WHERE title = '数字化升级项目方案包';

INSERT INTO demo_questions (question, response_summary, response_anomalies, response_advice, sort_order, is_active) VALUES
  ('请先帮我理解这个项目，不要急着写完整方案。', '已形成项目目标、建设对象、业务范围与关键约束的初步理解。', '发现部署方式、上线周期和预算边界尚未确认；两处需求描述存在重复。', '先确认关键范围和待确认项，再生成方案、估算与报价，避免错误前提向后传递。', 0, 1),
  ('客户只发了需求片段和会议纪要，可以开始吗？', '可以。现有资料足以形成项目骨架与初步功能范围。', '缺失内容将标记为待确认或推演假设，不会伪装成客户事实。', '只需补充影响范围、周期和报价的少量关键问题，无需上传完整企业资料库。', 1, 1),
  ('客户新增一个微信小程序，会影响哪些成果？', '新增移动端范围将同步影响功能、接口、测试与发布工作。', '工作量、周期、报价、实施计划和汇报材料需要联动更新。', '先确认小程序功能边界，再一次更新所有关联成果，避免多份材料口径不一致。', 2, 1);

INSERT INTO capability_modules (icon, title, description, sort_order, is_active) VALUES
  ('01', '先把项目边界讲清楚', '从现有文档、表格和会议纪要中整理目标、范围、约束、需求、外部系统和待确认事项。', 0, 1),
  ('02', '让方案、周期与报价一致', '依据功能范围组织方案、角色人日、项目周期和报价建议，关键估算都有对应依据并可调整。', 1, 1),
  ('03', '让范围变化有迹可循', '需求、功能、方案、估算、报价、实施与汇报共享同一项目事实；范围变化时同步检查关联成果。', 2, 1);

INSERT INTO value_stats (label, value, suffix, sort_order, is_active) VALUES
  ('贯穿始终的项目事实', 1, '套', 0, 1),
  ('可继续编辑的标准成果', 7, '类', 1, 1),
  ('事实、建议与待确认标记', 3, '类', 2, 1);

INSERT INTO footer_config (id, company_description, email, phone, address, copyright)
VALUES (
  1,
  '宁翼智能科技提供企业项目方案与成果智能交付服务，帮助软件公司、系统集成商和数字化服务团队，把零散客户资料转化为结构清晰、口径一致、可继续修改的项目成果。',
  'contact@ningyi-ai.com', '', '成都市高新区新川科技园',
  '© 2026 宁翼智能科技。All rights reserved.'
)
ON CONFLICT(id) DO UPDATE SET
  company_description = excluded.company_description,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  copyright = excluded.copyright;

INSERT INTO footer_links (category, title, href, sort_order, is_active) VALUES
  ('product', '项目理解与需求分析', '/#demo', 0, 1),
  ('product', '方案与功能规划', '/#capability', 1, 1),
  ('product', '工作量与报价建议', '/#capability', 2, 1),
  ('product', '多成果一致性', '/#architecture', 3, 1),
  ('solution', '软件定制项目', '/solution/software-customization', 0, 1),
  ('solution', '系统集成项目', '/solution/system-integration-project', 1, 1),
  ('solution', '企业数字化升级', '/solution/digital-transformation', 2, 1),
  ('company', '成果样例', '/case', 0, 1),
  ('company', '免费分析项目', '/#cta', 1, 1),
  ('company', '联系宁翼', 'mailto:contact@ningyi-ai.com', 2, 1);

COMMIT;
