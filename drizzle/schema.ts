import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// 管理员表
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
});

// Hero 配置表
export const heroConfig = sqliteTable('hero_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  ctaPrimaryText: text('cta_primary_text'),
  ctaPrimaryLink: text('cta_primary_link'),
  ctaSecondaryText: text('cta_secondary_text'),
  ctaSecondaryLink: text('cta_secondary_link'),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// Hero 轮播图表
export const heroImages = sqliteTable('hero_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  imagePath: text('image_path').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
});

// 解决方案表
export const solutions = sqliteTable('solutions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  icon: text('icon'),
  title: text('title').notNull(),
  slug: text('slug'),
  description: text('description'),
  heroImage: text('hero_image'),
  painPoints: text('pain_points'), // 富文本 HTML
  solutionDetail: text('solution_detail'), // 富文本 HTML
  advantage: text('advantage'), // 富文本 HTML
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// 行业场景表
export const solutionScenarios = sqliteTable('solution_scenarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  icon: text('icon'),
  title: text('title').notNull(),
  slug: text('slug'),
  subtitle: text('subtitle'),
  pain: text('pain'),
  solution: text('solution'),
  heroImage: text('hero_image'),
  painPoints: text('pain_points'), // 富文本 HTML
  solutionDetail: text('solution_detail'), // 富文本 HTML
  advantage: text('advantage'), // 富文本 HTML
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// 解决方案特性表
export const solutionFeatures = sqliteTable('solution_features', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  solutionId: integer('solution_id').notNull().references(() => solutions.id, { onDelete: 'cascade' }),
  featureText: text('feature_text').notNull(),
  sortOrder: integer('sort_order').default(0),
});

// 案例研究表
export const caseStudies = sqliteTable('case_studies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  industry: text('industry'),
  problem: text('problem'),
  solution: text('solution'),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// 案例成果表
export const caseResults = sqliteTable('case_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  caseId: integer('case_id').notNull().references(() => caseStudies.id, { onDelete: 'cascade' }),
  label: text('label'),
  value: text('value'),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0),
});

// Demo 对话表
export const demoQuestions = sqliteTable('demo_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  responseSummary: text('response_summary'),
  responseAnomalies: text('response_anomalies'),
  responseAdvice: text('response_advice'),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
});

// 产品能力模块表
export const capabilityModules = sqliteTable('capability_modules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  icon: text('icon'),
  title: text('title').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
});

// 价值统计表
export const valueStats = sqliteTable('value_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  value: integer('value').notNull(),
  suffix: text('suffix'),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// 预约信息表
export const reservations = sqliteTable('reservations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  company: text('company').notNull(),
  phone: text('phone').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // pending, contacted, completed
  createdAt: text('created_at').default('(CURRENT_TIMESTAMP)'),
});

// Footer 公司信息表
export const footerConfig = sqliteTable('footer_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyDescription: text('company_description'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  copyright: text('copyright'),
  updatedAt: text('updated_at').default('(CURRENT_TIMESTAMP)'),
});

// Footer 链接表
export const footerLinks = sqliteTable('footer_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(), // product, solution, company
  title: text('title').notNull(),
  href: text('href').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
});
