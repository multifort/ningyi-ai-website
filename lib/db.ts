import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from '../drizzle/schema';

// 确保 data 目录存在
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 数据库文件路径
const dbPath = path.join(dataDir, 'cms.db');

// 创建数据库连接
const sqlite = new Database(dbPath);

// 启用外键支持
sqlite.pragma('foreign_keys = ON');

// 创建 Drizzle ORM 实例
export const db = drizzle(sqlite, { schema });

// 导出 sqlite 实例用于直接执行 SQL
export { sqlite };
