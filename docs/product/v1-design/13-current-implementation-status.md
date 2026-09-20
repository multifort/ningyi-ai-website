# 13 当前代码实施状态

> 状态日期：2026-09-20。本文描述仓库当前代码事实；`01`—`12` 文档继续描述产品目标、验收规则和演进边界。当二者表述不一致时，先以本文判断“已经实现什么”，再以设计文档判断“最终必须达到什么”。

## 1. 当前结论

仓库已经从官网/CMS 扩展为“官网/CMS + AI 企业方案产品域”。产品域具备本地单机端到端骨架，包括独立产品身份、需求草稿交接、私有材料、跨格式解析、媒体识别路由、统一知识、正式章节生成、项目模型、七类成果、版本与成果包、下载授权、删除、运行监控、备份恢复和无人值守验收框架。

当前状态仍属于外部灰度前的工程收口阶段，不等同于生产就绪。主要阻断项是 PostgreSQL 与对象存储迁移、18 个基准项目补齐、多用户并发压测、浏览器端到端回归、安全开放门以及 30 次连续无人值守验收。

## 2. 代码模块与实现状态

| 领域 | 主要代码 | 当前状态 | 后续缺口 |
|---|---|---|---|
| 官网与 CMS | `app/components/`、`app/admin/`、`app/api/content/` | 保留并已把主要 CTA 接入产品入口 | 完成内容发布复核和浏览器回归 |
| 产品身份 | `lib/product/auth.ts`、`app/api/product/auth/`、`app/api/product/account/` | 产品用户与管理员隔离；已实现用户名密码、HttpOnly Session、登录限流、改密、导出与注销 | 密码找回、共享限流和外部身份方式延期 |
| Intake 与上传 | `app/components/ProductIntake.tsx`、`app/api/product/intake/`、`app/api/product/solutions/*/uploads/` | 已实现登录前草稿、登录后绑定、分类上传位、私有上传和输入重处理 | 对象存储直传、恶意文件扫描与生产资源隔离 |
| 材料理解 | `lib/product/process-solution.ts`、`media-analysis.ts`、`unified-knowledge.ts` | 已实现 DOCX/PDF/PPTX/XLSX/CSV/TXT/图片处理骨架、来源块、媒体路由、知识归并与冲突识别 | 用 BM-08—18 补足旧格式、复杂模板和 Agent 项目覆盖 |
| 项目模型与修改 | `project-model-*`、`change-impact.*`、对应 API | 已实现候选快照、激活/拒绝、锁定、修订、影响计划和版本回退基础能力 | 补齐真实项目修改集与无关变化率验收 |
| 正式分析与成果 | `formal-analysis.ts`、`formal-worker.ts`、`deliverables.ts` | 已实现章节续跑、质量检查、七类成果、Office/PDF、成果包、版本和短期下载令牌 | 完整模板兼容、视觉质量回归和跨成果一致性验收 |
| Worker 与运维 | `scripts/product-worker.mjs`、`operations*.ts`、`deploy/systemd/` | 已实现长驻 Runner、阶段 tick、租约、退避、自动修复、心跳、健康探针、备份恢复和存储维护 | 独立可扩展队列、多主机 Worker、容量压测和告警接入 |
| 验收体系 | `benchmarks/`、`acceptance*.ts`、`product-acceptance-campaign.mjs` | 注册表与活动框架覆盖 BM-01—18；实体样本已完成 BM-01—07 | 补齐 BM-08—18，并完成全量活动与故障探针 |

## 3. 当前存储与部署形态

- CMS 继续使用 `data/cms.db`；产品域独立使用 `data/product.db`，两套身份与表不共用。
- 产品文件进入 `PRODUCT_PRIVATE_STORAGE_PATH` 指定的本地私有目录，不进入 `public/`；访问仍经过用户、方案和文件三重校验。
- Web 只负责短事务和调度接口；`scripts/product-worker.mjs` 以独立进程持续调用流水线、删除、监控和维护接口。
- `deploy/systemd/` 提供 Web、Worker、健康恢复和加密备份的单机部署模板。
- 以上形态适合本地完整链路和单机灰度验证；公网多用户开放前必须迁移 PostgreSQL、私有对象存储和可水平扩展的 Worker 运行环境。

## 4. 自动验证基线

2026-09-20 的只读扫描结果：

- `pnpm exec tsc --noEmit --incremental false`：通过。
- `pnpm exec node --test scripts/*.test.mjs`：21 项通过，0 项失败。
- BM-01—BM-07 的 manifest 单独校验：全部通过。
- `pnpm contracts:check`：当前环境缺少 Python `jsonschema`，未形成可重复的项目级依赖安装方式。
- `pnpm benchmark:verify`：脚本当前要求显式 manifest 路径，package script 未提供默认路径。
- `pnpm lint`：尚未落地 ESLint 配置，会进入交互式初始化并失败。
- 生产构建和真实模型端到端链路不计入本次只读扫描结论，需在配置隔离的验收环境执行。

## 5. 设计阶段映射

| 路线阶段 | 当前判断 | 说明 |
|---|---|---|
| M0 最小完整链路 | 代码骨架已覆盖，待证据收口 | 身份、上传、解析、正式分析、成果、下载和删除均已有实现 |
| M1 全部输入格式 | 部分完成 | 主流格式已接入，BM-08—18 和旧格式覆盖未完成 |
| M2 七类成果 | 已实现生成路径，待全量质量验收 | 不能只以文件存在判定完成 |
| M3 模板、渲染与成果包 | 部分完成 | 默认渲染、模板 profile、版本与 ZIP 已有；兼容率和视觉门未闭环 |
| M4 修改、锁定与版本 | 基础实现完成，待真实修改集验收 | 已有 R/C/S/P 影响与项目模型状态测试 |
| M5 正式产品界面 | 基础页面已实现 | 仍缺完整桌面/移动端 E2E 和异常恢复验证 |
| M6 外部开放安全 | 部分完成 | 鉴权、私有存储、签名下载、删除已有；生产存储、安全扫描与共享限流未完成 |
| M7 无人化运维与灰度 | 单机实现完成，生产验证未完成 | Runner、健康、恢复、备份已有；监控接入、压测和多机运行待完成 |
| M8 无人值守验收 | 未完成 | 只有 BM-01—07 实体样本，尚未完成 18 项和 30 次活动 |
| M9 PPT 视觉优先复原 | 延期 | 保持在主流程验收之后 |

## 6. 文档与代码同步规则

1. 新增或变更产品 API 时，同时更新路由实现、`product-api-catalog.json`、`10-product-api.md` 和相关自动测试。
2. 新增或变更数据状态时，同时更新 `lib/product/db.ts`、JSON Schema、`04-data-contract.md` 和迁移/恢复说明。
3. 新增成果或质量规则时，同时更新 `03-deliverable-spec.md`、基准 expected 文件、验收代码和渲染测试。
4. 完成一项路线任务时，在本文更新状态、验证命令与证据位置；不得只修改“已完成”文字而没有自动证据。
5. 当前实现与目标设计存在临时差异时，必须在 `11-deferred-integrations.md` 记录迁移边界和外部开放门。

## 7. 下一批研发顺序

1. 固化仓库基线并修复 lint、契约校验、基准聚合校验和 CI 入口。
2. 建立产品主流程浏览器 E2E、跨用户隔离和 Worker 故障回归。
3. 补齐 BM-08—18 的材料、期望事实、评分规则和绑定流程。
4. 迁移 PostgreSQL 与 S3 兼容对象存储，并完成备份、恢复和删除审计。
5. 执行多用户并发、租约竞争、重复消费、崩溃恢复和供应商限流压测。
6. 完成 18 个项目、30 次连续运行和五类故障探针后，进入小流量灰度。
