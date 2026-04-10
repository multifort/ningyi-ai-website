import { db, sqlite } from '../lib/db';
import * as schema from '../drizzle/schema';
import bcrypt from 'bcryptjs';

console.log('🚀 开始初始化数据库...');

// 创建表结构
console.log('📋 创建表结构...');
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hero_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    cta_primary_text TEXT,
    cta_primary_link TEXT,
    cta_secondary_text TEXT,
    cta_secondary_link TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hero_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS solutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    icon TEXT,
    title TEXT NOT NULL,
    slug TEXT,
    description TEXT,
    hero_image TEXT,
    pain_points TEXT,
    solution_detail TEXT,
    advantage TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS solution_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solution_id INTEGER NOT NULL,
    feature_text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS solution_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    icon TEXT,
    title TEXT NOT NULL,
    slug TEXT,
    subtitle TEXT,
    pain TEXT,
    solution TEXT,
    hero_image TEXT,
    pain_points TEXT,
    solution_detail TEXT,
    advantage TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS case_studies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    industry TEXT,
    problem TEXT,
    solution TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS case_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    label TEXT,
    value TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (case_id) REFERENCES case_studies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS demo_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    response_summary TEXT,
    response_anomalies TEXT,
    response_advice TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS capability_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    icon TEXT,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS value_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    value INTEGER NOT NULL,
    suffix TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    phone TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS footer_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_description TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    copyright TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS footer_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
  );
`);

console.log('✅ 表结构创建完成');

// 插入默认管理员账号
console.log('👤 创建管理员账号...');
const passwordHash = bcrypt.hashSync('admin123', 10);
sqlite.prepare(
  'INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)'
).run('admin', passwordHash);
console.log('✅ 管理员账号创建完成（用户名: admin, 密码: admin123）');

// 插入 Hero 配置
console.log('🎨 插入 Hero 配置...');
sqlite.prepare(`
  INSERT OR IGNORE INTO hero_config (title, subtitle, cta_primary_text, cta_primary_link, cta_secondary_text, cta_secondary_link)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  '企业 AI 管家',
  '让企业拥有一支可管理、可执行、可进化的 AI 员工团队',
  '立即体验 Demo',
  '#demo',
  '预约专属演示',
  '#cta'
);

// 插入 Hero 轮播图
console.log('🖼️ 插入 Hero 轮播图...');
const heroImages = [
  '/images/hero-bg/hero-1.jpg',
  '/images/hero-bg/hero-2.jpg',
  '/images/hero-bg/hero-3.jpg',
  '/images/hero-bg/hero-4.jpg',
];
heroImages.forEach((img, index) => {
  sqlite.prepare(
    'INSERT OR IGNORE INTO hero_images (image_path, sort_order) VALUES (?, ?)'
  ).run(img, index);
});

// 插入解决方案
console.log('💡 插入解决方案...');
const solutionsData = [
  { slug: 'car-manufacturing', icon: '🚗', title: '汽车制造', description: '生产调度与质量分析智能化', features: ['供应链协同管理', '生产计划智能排程优化', '设备预测性维护', '质量数据实时分析预警'] },
  { slug: 'electronics', icon: '🔌', title: '电子制造', description: '良率监控与异常定位自动化', features: ['SMT 产线良率实时监控', '工艺参数智能优化', '异常根因自动分析', '物料追溯与管理'] },
  { slug: 'assembly-line', icon: '🏭', title: '装配产线', description: '节拍优化与效率提升', features: ['产线节拍平衡分析', '工位效率实时监控', '瓶颈工序智能识别', '产能利用率优化'] },
];

solutionsData.forEach((sol, solIndex) => {
  const result = sqlite.prepare(
    'INSERT OR IGNORE INTO solutions (slug, icon, title, description, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(sol.slug, sol.icon, sol.title, sol.description, solIndex);
  
  if (result.changes > 0) {
    const solutionId = Number(result.lastInsertRowid);
    sol.features.forEach((feature, featIndex) => {
      sqlite.prepare(
        'INSERT INTO solution_features (solution_id, feature_text, sort_order) VALUES (?, ?, ?)'
      ).run(solutionId, feature, featIndex);
    });
  }
});

// 插入案例研究
console.log('📊 插入案例研究...');
const casesData = [
  {
    title: '某大型制造企业',
    industry: '汽车制造',
    problem: '每天需要 2 小时人工整理生产日报，数据分散在多个系统中，管理决策滞后',
    solution: '引入 AI 生产管家，自动从 MES/ERP 系统获取数据，一键生成生产分析报告',
    results: [
      { label: '报告生成时间', value: '2 小时 → 30 秒', icon: '⏱️' },
      { label: '管理效率提升', value: '95%', icon: '📈' },
      { label: '人力优化', value: '替代 1.5 个岗位', icon: '👥' },
    ],
  },
  {
    title: '某电子工厂产线',
    industry: '电子制造',
    problem: '设备异常无法提前识别，良率波动大，停机损失严重',
    solution: '部署 AI 实时监控系统，自动分析生产数据并预警异常情况',
    results: [
      { label: '停机损失降低', value: '20%+', icon: '📉' },
      { label: '异常响应速度', value: '提升 3 倍', icon: '⚡' },
      { label: '良率提升', value: '3.5%', icon: '🎯' },
    ],
  },
  {
    title: '某装配生产线',
    industry: '智能装配',
    problem: '产线节拍不平衡，效率瓶颈难以定位，产能利用率低',
    solution: '应用 AI 节拍优化系统，实时监控各工位效率并提供优化建议',
    results: [
      { label: '产能利用率', value: '提升 18%', icon: '📊' },
      { label: '决策响应速度', value: '提升 10 倍', icon: '🚀' },
      { label: '月度成本节省', value: '¥15 万+', icon: '💰' },
    ],
  },
];

casesData.forEach((caseItem, caseIndex) => {
  const result = sqlite.prepare(
    'INSERT OR IGNORE INTO case_studies (title, industry, problem, solution, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(caseItem.title, caseItem.industry, caseItem.problem, caseItem.solution, caseIndex);
  
  if (result.changes > 0) {
    const caseId = Number(result.lastInsertRowid);
    caseItem.results.forEach((result, resIndex) => {
      sqlite.prepare(
        'INSERT INTO case_results (case_id, label, value, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(caseId, result.label, result.value, result.icon, resIndex);
    });
  }
});

// 插入 Demo 对话
console.log('💬 插入 Demo 对话...');
const demoData = [
  {
    question: '今天生产情况怎么样？',
    summary: '总产量：12000（↑5%）',
    anomalies: 'A 线停机 2 小时，B 线良率下降',
    advice: '检查设备 X，优化工艺参数',
  },
  {
    question: '有哪些异常情况？',
    summary: '发现 3 项异常',
    anomalies: '1. A 线停机 2 小时\n2. B 线良率降至 92%\n3. 设备 X 温度过高',
    advice: '建议立即检查设备 X 的冷却系统',
  },
  {
    question: '如何优化生产良率？',
    summary: '良率优化建议',
    anomalies: '当前平均良率：94.5%',
    advice: '1. 调整设备 X 参数\n2. 优化工艺流程\n3. 加强巡检频次',
  },
];

demoData.forEach((demo, index) => {
  sqlite.prepare(
    'INSERT OR IGNORE INTO demo_questions (question, response_summary, response_anomalies, response_advice, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(demo.question, demo.summary, demo.anomalies, demo.advice, index);
});

// 插入产品能力模块
console.log('🔧 插入产品能力模块...');
const capabilityData = [
  {
    icon: '🤖',
    title: 'AI生产管家',
    description: '统一交互入口，理解需求并调度任务',
  },
  {
    icon: '🤝',
    title: '多Agent系统',
    description: '模拟企业岗位角色，实现协同决策',
  },
  {
    icon: '🛠️',
    title: 'Skill执行平台',
    description: '打通ERP/MES，实现数据获取与自动执行',
  },
];

capabilityData.forEach((cap, index) => {
  sqlite.prepare(
    'INSERT OR IGNORE INTO capability_modules (icon, title, description, sort_order) VALUES (?, ?, ?, ?)'
  ).run(cap.icon, cap.title, cap.description, index);
});

// 插入价值统计数据
console.log('📈 插入价值统计数据...');
const statsData = [
  { label: '生产日报生成效率提升', value: 95, suffix: '%' },
  { label: '关键异常识别效率提升', value: 3, suffix: '倍' },
  { label: '管理决策响应速度提升', value: 10, suffix: '倍' },
];

statsData.forEach((stat, index) => {
  sqlite.prepare(
    'INSERT OR IGNORE INTO value_stats (label, value, suffix, sort_order) VALUES (?, ?, ?, ?)'
  ).run(stat.label, stat.value, stat.suffix, index);
});

// 插入 Footer 配置
console.log('🔗 插入 Footer 配置...');
sqlite.prepare(
  'INSERT OR IGNORE INTO footer_config (id, company_description, email, phone, address, copyright) VALUES (?, ?, ?, ?, ?, ?)'
).run(
  1,
  '宁翼智能科技是一家专注于企业级 AI 系统的科技公司，致力于通过人工智能技术，帮助企业实现智能化升级。让企业从"人驱动"走向"AI 驱动"，构建未来数字员工组织。',
  'contact@ningyi-ai.com',
  '400-xxx-xxxx',
  '上海市浦东新区张江高科技园区',
  '© 2024 宁翼智能科技。All rights reserved.'
);

// 插入 Footer 链接
console.log('📋 插入 Footer 链接...');
const footerLinksData = [
  // 产品
  { category: 'product', title: 'AI 生产管家', href: '/capability' },
  { category: 'product', title: '多 Agent 系统', href: '/capability' },
  { category: 'product', title: 'Skill 执行平台', href: '/capability' },
  { category: 'product', title: '产品架构', href: '/#architecture' },
  // 解决方案
  { category: 'solution', title: '汽车制造', href: '/solution' },
  { category: 'solution', title: '电子制造', href: '/solution' },
  { category: 'solution', title: '智能装配', href: '/solution' },
  { category: 'solution', title: '私有化部署', href: '/solution' },
  // 公司
  { category: 'company', title: '关于我们', href: '/#about' },
  { category: 'company', title: '成功案例', href: '/case' },
  { category: 'company', title: '联系我们', href: '/cta' },
  { category: 'company', title: '加入我们', href: '/#careers' },
];

footerLinksData.forEach((link, index) => {
  sqlite.prepare(
    'INSERT INTO footer_links (category, title, href, sort_order) VALUES (?, ?, ?, ?)'
  ).run(link.category, link.title, link.href, index);
});

// 插入行业场景
console.log('🏭 插入行业场景...');
const scenariosData = [
  {
    icon: '🏭',
    title: '制造业智能运营',
    slug: 'smart-manufacturing',
    subtitle: 'Industry Solution',
    pain: '数据分散、分析滞后、异常发现晚',
    solution: '自动生产分析、实时异常预警、智能决策建议',
    heroImage: '',
    painPoints: '<h2>数据孤岛问题</h2><p>各系统数据分散，难以形成完整的生产视图</p><ul><li>MES 系统数据孤立</li><li>ERP 数据不互通</li><li>人工整理耗时</li></ul>',
    solutionDetail: '<h2>智能化解决方案</h2><p>通过 AI 管家打通数据壁垒</p><ol><li>自动采集多系统数据</li><li>实时分析生产指标</li><li>智能生成分析报告</li></ol>',
    advantage: '<h2>核心优势</h2><ul><li>降低人工整理成本</li><li>提升决策效率</li><li>实现数据驱动管理</li></ul>',
  },
  {
    icon: '📊',
    title: '企业数字化升级',
    slug: 'digital-upgrade',
    subtitle: 'Digital Transformation',
    pain: '系统多、难使用、数据孤岛严重',
    solution: '统一 AI 入口、打通多系统、简化操作流程',
    heroImage: '',
    painPoints: '<h2>数字化挑战</h2><p>企业面临多系统协同难题</p><ul><li>系统操作复杂</li><li>学习成本高</li><li>数据无法流转</li></ul>',
    solutionDetail: '<h2>统一 AI 入口</h2><p>一个入口，搞定所有操作</p><ol><li>自然语言交互</li><li>自动调用系统接口</li><li>智能工作流编排</li></ol>',
    advantage: '<h2>转型优势</h2><ul><li>降低使用门槛</li><li>提升系统协同效率</li><li>加速数字化进程</li></ul>',
  },
  {
    icon: '🔒',
    title: '私有化部署方案',
    slug: 'private-deployment',
    subtitle: 'Private Deployment',
    pain: '本地模型部署需求',
    solution: '支持私有化部署、数据安全保障',
    heroImage: '',
    painPoints: '<h2>数据安全顾虑</h2><p>企业数据安全至关重要</p><ul><li>敏感数据不能外流</li><li>行业监管要求</li><li>模型本地化需求</li></ul>',
    solutionDetail: '<h2>私有化部署</h2><p>完整本地化解决方案</p><ol><li>本地模型部署</li><li>数据不出本地</li><li>定制化训练</li></ol>',
    advantage: '<h2>安全优势</h2><ul><li>数据完全自主控制</li><li>符合合规要求</li><li>灵活的定制能力</li></ul>',
  },
];

scenariosData.forEach((scenario, index) => {
  sqlite.prepare(
    'INSERT OR IGNORE INTO solution_scenarios (icon, title, slug, subtitle, pain, solution, hero_image, pain_points, solution_detail, advantage, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    scenario.icon,
    scenario.title,
    scenario.slug,
    scenario.subtitle,
    scenario.pain,
    scenario.solution,
    scenario.heroImage,
    scenario.painPoints,
    scenario.solutionDetail,
    scenario.advantage,
    index
  );
});

console.log('✅ 所有数据插入完成！');
console.log('🎉 数据库初始化成功！');
console.log('\n📝 管理员账号信息：');
console.log('   用户名: admin');
console.log('   密码: admin123');
console.log('\n⚠️  请记得在生产环境修改默认密码！\n');

process.exit(0);
