# 宁翼智能科技官网

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)

**企业级 AI 管家系统官方网站**

[在线访问](https://www.ningyi-ai.com) · [问题反馈](https://github.com/multifort/ningyi-ai-website/issues)

</div>

## 📖 项目简介

宁翼智能科技官网是一个现代化的企业官网，展示了公司核心的**企业 AI 管家系统**产品。通过多 Agent 协同和 Skill 执行平台，让企业拥有一支可管理、可执行、可进化的 AI 员工团队。

### 核心特性

- 🎨 **现代化设计**：采用渐变色、动画和响应式布局
- 🚀 **高性能**：基于 Next.js 15，支持服务端渲染和静态生成
- 📱 **完全响应式**：完美适配桌面端和移动端
- ♿ **无障碍访问**：符合 ARIA 标准，支持屏幕阅读器
- 🔍 **SEO 优化**：完善的 Meta 标签和结构化数据
- ✨ **交互动画**：流畅的滚动动画、计数动画和打字效果

## 🛠️ 技术栈

### 核心框架

- **Next.js 15** - React 元框架，支持 App Router
- **React 18** - 前端 UI 框架
- **TypeScript 5** - 类型安全的 JavaScript 超集

### 样式和 UI

- **Tailwind CSS 3** - 原子化 CSS 框架
- **CSS Modules** - 组件级样式隔离

### 开发和构建

- **Node.js** - JavaScript 运行时
- **npm** - 包管理器
- **Webpack** - 模块打包工具（Next.js 内置）

## 📦 项目结构

```
ningyi-ai-website/
├── app/                          # Next.js App Router 目录
│   ├── components/               # React 组件
│   │   ├── Header.tsx           # 导航栏组件
│   │   ├── HeroSection.tsx      # Hero 区域
│   │   ├── ValueNumber.tsx      # 核心价值数据
│   │   ├── DemoShowcase.tsx     # Demo 展示
│   │   ├── ProductCapability.tsx # 产品能力
│   │   ├── ProductArchitecture.tsx # 产品架构图
│   │   ├── Solutions.tsx        # 行业解决方案
│   │   ├── SolutionTabs.tsx     # 解决方案标签页
│   │   ├── CaseStudies.tsx      # 成功案例
│   │   ├── ContactCTA.tsx       # 联系表单
│   │   └── Footer.tsx           # 页脚
│   ├── hooks/                    # 自定义 React Hooks
│   │   └── useAnimation.ts      # 动画 Hook
│   ├── globals.css              # 全局样式
│   ├── layout.tsx               # 根布局
│   └── page.tsx                 # 主页
├── public/                       # 静态资源
│   └── images/                   # 图片资源
│       ├── logo.png             # Logo
│       └── hero-bg/             # Hero 背景图
├── .gitignore                   # Git 忽略文件
├── next.config.js               # Next.js 配置
├── tailwind.config.js           # Tailwind 配置
├── tsconfig.json                # TypeScript 配置
├── package.json                 # 项目依赖
└── README.md                    # 项目文档
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.17.0
- npm >= 9.0.0

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 构建生产版本

```bash
npm run build
```

### 启动生产服务器

```bash
npm start
```

## 📄 核心功能模块

### 1. Header 导航

- 固定定位，滚动时自动切换背景
- 响应式导航菜单
- 滚动高亮当前区块
- 平滑滚动到目标位置（已修复 Header 遮挡问题）

### 2. HeroSection 品牌展示

- 企业介绍和 Slogan
- CTA 按钮组
- 背景渐变效果
- 入场动画

### 3. ValueNumber 核心价值

- 动态计数动画（从 0 滚动到目标值）
- 三个核心指标：95%、3 倍、10 倍
- 依次触发的延迟动画

### 4. DemoShowcase 演示展示

- AI 对话模拟
- 文字流打字效果（模拟真实 AI 回复）
- 循环播放对话流程
- 用户和 AI 对话气泡设计

### 5. ProductCapability 产品能力

- 三大核心能力展示
- 多 Agent 协同系统
- Skill 执行平台
- 企业知识库

### 6. ProductArchitecture 产品架构

- 四层架构图展示
- 感知层 → 决策层 → 执行层 → 进化层
- 连接线和脉冲动画
- 渐变配色区分层级

### 7. Solutions 行业解决方案

- 三大行业场景：汽车制造、电子制造、装配产线
- 卡片式设计
- 渐变图标和顶部色条
- 功能列表和 CTA 按钮

### 8. SolutionTabs 解决方案标签页

- 标签页切换交互
- 痛点 + 解决方案展示
- 渐变背景和装饰元素
- 图标和颜色随标签变化

### 9. CaseStudies 成功案例

- 客户价值成果展示
- 行业标签和案例卡片
- 痛点、解决方案、成果数据
- 响应式网格布局

### 10. ContactCTA 联系表单

- 完整的表单验证
- 手机号格式校验
- 实时错误提示
- 提交中状态和结果反馈
- 无障碍访问支持

## 🎨 设计系统

### 配色方案

```javascript
// 主色调
primary: '#0A1F3E'      // 深蓝
accent1: '#3B82F6'      // 亮蓝
accent2: '#8B5CF6'      // 紫色

// 中性色
bgGray: '#F9FAFB'       // 浅灰背景
textGray: '#6B7280'     // 灰色文字
```

### 间距规范

- 模块间距：`py-8` (32px)
- 内边距：`px-4` / `px-6` (16px / 24px)
- 元素间距：`space-x-2` ~ `space-x-6`

### 动画效果

- 过渡动画：`duration-300` (300ms)
- 延迟动画：`delay-150` * index
- 缓动函数：cubic ease-out
- 悬停效果：scale、translate、shadow

## 🔧 配置说明

### Tailwind 配置

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0A1F3E',
        accent1: '#3B82F6',
        accent2: '#8B5CF6',
      },
    },
  },
  plugins: [],
}
```

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  }
}
```

## 📱 响应式断点

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### 布局策略

- 移动端：单列布局
- 平板端：双列布局
- 桌面端：三列布局（最大宽度 1280px）

## ♿ 无障碍访问

### ARIA 标签

- 所有表单输入框都有 `aria-label`
- 必填字段添加 `aria-required`
- 错误提示使用 `aria-describedby`
- 无效状态使用 `aria-invalid`

### 语义化 HTML

- 使用 `<section>`、`<article>`、`<nav>` 等语义标签
- 标题层级清晰（h1 → h2 → h3）
- 列表使用 `<ul>` 和 `<li>`

## 🔍 SEO 优化

### Meta 标签

- Title 和 Description
- Keywords
- Open Graph（社交媒体分享）
- Robots（搜索引擎索引）

### 结构化数据

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "宁翼智能科技",
  "url": "https://www.ningyi-ai.com",
  "logo": "https://www.ningyi-ai.com/images/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service"
  }
}
```

## 🚧 优化记录

### 已完成的优化

1. ✅ **Header 导航定位修复**
   - 添加 80px 滚动偏移量
   - 阻止默认跳转行为
   - 实现平滑滚动

2. ✅ **行业场景 UI 美化**
   - 渐变背景和装饰元素
   - 大号渐变图标
   - 悬停动画效果
   - 渐变圆形勾选图标

3. ✅ **SolutionTabs 视觉升级**
   - 装饰性背景光晕
   - 标签页 Emoji 图标
   - 激活状态脉冲效果
   - 痛点和方案图标设计

4. ✅ **模块间距统一**
   - 从 py-12/py-16 统一为 py-8
   - 页面更加紧凑
   - 减少滚动距离

5. ✅ **数字计数动画**
   - requestAnimationFrame 实现
   - cubic 缓动函数
   - 依次延迟触发

6. ✅ **表单验证功能**
   - 完整字段验证
   - 手机号格式校验
   - 实时错误提示
   - 提交反馈

## 📦 部署指南

### Vercel 部署（推荐）

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel
```

### 其他平台

1. **Netlify**
   - 连接 GitHub 仓库
   - 构建命令：`npm run build`
   - 发布目录：`.next`

2. **自建服务器**
   ```bash
   npm run build
   npm start
   ```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### Commit 规范

遵循 [约定式提交](https://www.conventionalcommits.org/)：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具

## 📄 许可证

Copyright © 2024 宁翼智能科技

## 📞 联系方式

- **官网**: https://www.ningyi-ai.com
- **邮箱**: contact@ningyi-ai.com
- **地址**: 中国

---

<div align="center">

**宁翼智能科技 - 企业 AI 管家**

[返回顶部](#宁翼智能科技官网)

</div>
