# 宁翼智能科技官网与 AI 企业方案服务平台

本仓库同时承载宁翼智能科技官网、CMS 管理端和 AI 企业方案产品域。产品域已经具备本地单机端到端骨架：用户提交需求与私有材料后，后台 Worker 完成材料理解、正式分析、项目模型维护、七类成果生成、版本与成果包管理，并提供下载、删除、运行监控、备份恢复和无人值守验收能力。

当前处于外部灰度前的工程收口阶段，并非生产就绪。准确实施状态见 [当前代码实施状态](docs/product/v1-design/13-current-implementation-status.md)，完整产品规格见 [V1 设计基线](docs/product/v1-design/README.md)。

## 技术与运行形态

- Next.js 15、React 18、TypeScript 5、Tailwind CSS 3。
- 官网和 CMS 保留在 `app/`、`lib/db.ts` 与 `data/cms.db`。
- 产品页面和 API 位于 `app/product/`、`app/api/product/`，核心业务位于 `lib/product/`。
- `scripts/product-worker.mjs` 作为独立常驻进程推进解析、媒体、正式生成、渲染、删除和维护任务。
- 本地开发使用独立的 `data/product.db` 与服务器私有目录；公网多用户开放前必须迁移 PostgreSQL、私有对象存储和可水平扩展的 Worker。

## 本地启动

建议使用 Node.js 22 LTS 和 pnpm 10。

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
pnpm typecheck
pnpm test
pnpm api:check
pnpm benchmark:verify
```

- `api:check` 扫描全部 `app/api/product/**/route.ts`，并与产品 API 目录逐项比对；新增、删除或修改路由时必须同步目录。
- `benchmark:verify` 默认聚合校验仓库中已有的 BM-01—BM-07，也可以追加单个 `manifest.json` 路径。
- `contracts:check` 会校验机器可读 JSON Schema；当前需要本机 Python 环境提供 `jsonschema`。
- `lint` 尚待补齐非交互式 ESLint 配置，不属于当前可用质量门。

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

外部灰度前的主要阻断项：

- PostgreSQL 与私有对象存储迁移；
- BM-08—BM-18 实体样本和 30 次连续无人值守验收；
- 多用户并发、租约竞争、崩溃恢复和供应商限流压测；
- 浏览器端到端回归、恶意文件扫描、共享限流和安全开放门；
- 非交互式 lint、项目级 Python 契约依赖和 CI 质量门收口。
