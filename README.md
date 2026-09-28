# 宁翼智能科技官网与 AI 企业方案服务平台

本仓库同时承载宁翼智能科技官网、CMS 管理端和 AI 企业方案产品域。产品域已经具备本地单机端到端骨架：用户提交需求与私有材料后，后台 Worker 完成材料理解、正式分析、项目模型维护、七类成果生成、版本与成果包管理，并提供下载、删除、运行监控、备份恢复和无人值守验收能力。

当前处于外部灰度前的工程收口阶段，并非生产就绪。准确实施状态见 [当前代码实施状态](docs/product/v1-design/13-current-implementation-status.md)，后续任务与依赖见 [开发执行计划](docs/product/v1-design/14-development-execution-plan.md)，完整产品规格见 [V1 设计基线](docs/product/v1-design/README.md)。

## 技术与运行形态

- Next.js 15、React 18、TypeScript 5、Tailwind CSS 3。
- 官网和 CMS 保留在 `app/`、`lib/db.ts` 与 `data/cms.db`。
- 产品页面和 API 位于 `app/product/`、`app/api/product/`，核心业务位于 `lib/product/`。
- `scripts/product-worker.mjs` 作为独立常驻进程推进解析、媒体、正式生成、渲染、删除和维护任务。
- 本地开发使用独立的 `data/product.db` 与服务器私有目录；公网多用户开放前必须迁移 PostgreSQL、私有部署的 MinIO 对象存储和可水平扩展的 Worker。

## 本地启动

建议使用 Node.js 22 LTS、pnpm 10 和 uv 0.11+。uv 只用于锁定并运行 Python 契约校验依赖，不污染系统 Python。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.product.example .env.local
pnpm dev
```

浏览器访问 `http://localhost:3000`；产品入口为 `/product`。`.env.product.example` 只包含占位密钥；本地默认数据路径可以直接使用，生产预检和部署前必须填写绝对路径与独立随机密钥。不要提交真实密钥。

需要运行异步处理链路时，在另一个终端启动：

```bash
pnpm worker:product
```

纯本地生产配置预检使用 `pnpm config:check`。只有在明确允许向模型供应商发起最小请求时，才运行 `pnpm provider:check`。

## 代码与文档一致性检查

```bash
pnpm quality:check
pnpm typecheck
pnpm test
pnpm e2e:product
pnpm api:check
pnpm contracts:check
pnpm benchmark:verify
```

- `quality:check` 是本地统一质量入口，依次执行 lint、类型检查、测试、API 同步、契约和基准包校验；仓库当前不使用 GitHub Actions。
- `e2e:product` 先执行生产构建，再通过 uv 运行 Python Playwright；测试使用临时数据库/存储、本地假模型和系统 Chrome，覆盖桌面/移动端完整产品流程，不调用外部模型，也不依赖浏览器插件。非 macOS 环境可用 `PRODUCT_E2E_CHROME_PATH` 指定 Chrome/Chromium 可执行文件。
- `api:check` 扫描全部 `app/api/product/**/route.ts`，并与产品 API 目录逐项比对；新增、删除或修改路由时必须同步目录。
- `benchmark:verify` 默认聚合校验仓库中已有的 BM-01—BM-12，也可以追加单个 `manifest.json` 路径；它只验证基准包完整性，不代表产品运行或内容质量通过。
- `contracts:check` 通过 `uv.lock` 自动建立隔离环境并校验机器可读 JSON Schema，无需手工安装 `jsonschema`。
- `lint` 使用非交互式 ESLint 9 配置，并以 0 warning 作为质量门。

## 主要目录

```text
app/                         Next.js 页面、CMS 和 API
app/api/product/             产品 API（57 个路由文件、71 个方法/路径）
lib/product/                 产品身份、处理、成果、运维与验收逻辑
scripts/                     Worker、检查、测试与运维脚本
docs/product/v1-design/      设计基线、数据契约和基准项目
deploy/systemd/              Web、Worker、健康恢复与备份的单机部署模板
data/                        本地 SQLite 数据（运行时文件不提交）
```

产品 API 的机器可读目录位于 `docs/product/v1-design/benchmarks/BM-01/expected/product-api-catalog.json`；接口行为说明位于 [产品 API 文档](docs/product/v1-design/10-product-api.md)。

## 部署边界

`deploy/systemd/` 提供当前单机部署样例及生产环境变量模板，详见 [systemd 部署说明](deploy/systemd/README.md)。Vercel、Netlify 等仅 Web 运行形态不能直接承载本仓库当前的常驻 Worker、本地私有存储和 SQLite 产品数据。

外部灰度前的主要阻断项按依赖顺序为：

- 有效验收模型凭证恢复后重新验证 BM-01—12；基准 `expected` 与正式生成链路的隔离已完成；
- 仓库内桌面/移动端全状态 E2E 已完成，后续持续纳入发布前本地验证；
- 收敛重复的交付物生成逻辑，完成企业模板渲染和视觉质量门；
- 补齐 BM-13—18，并完成 18 项、30 次连续无人值守验收；
- 迁移 PostgreSQL、私有部署的 MinIO 对象存储和可水平扩展的 Worker，完成多用户并发与公平性压测；
- 补齐恶意文件扫描、密码找回、共享限流和外部开放安全门。
