import { sqlite } from '../lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

console.log('🚀 开始初始化数据库...');

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
    kicker TEXT,
    title TEXT,
    description TEXT,
    benefits TEXT,
    alt TEXT,
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
    flow_steps TEXT,
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

  CREATE TABLE IF NOT EXISTS delivery_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

const passwordHash = bcrypt.hashSync('admin123', 10);
sqlite.prepare(
  'INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)'
).run('admin', passwordHash);

const contentSql = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'refresh-content.sql'),
  'utf8'
);
sqlite.exec(contentSql);

console.log('✅ 已写入“企业项目方案与成果智能交付服务”官网内容');
console.log('🎉 数据库初始化成功！');
console.log('📝 默认管理员：admin / admin123（生产环境请立即修改）');
