# AI 企业方案服务平台 V1 设计基线

本目录将《AI企业方案服务平台 V1 产品需求与总体设计说明》拆解为可评审、可验证、可实施的详细规格。文档按依赖顺序维护，后续实现必须引用稳定编号，不以页面文案替代数据契约。

## 文档顺序

1. `01-scope-traceability.md`：V1 范围、非目标、需求编号和验收追踪。
2. `02-interaction-spec.md`：用户旅程、页面状态、字段、异常与移动端要求。
3. `02a-wireframes.md`：六个核心页面的低保真布局和关键状态。
4. `03-deliverable-spec.md`：七类成果的数据、展示、导出、修改和检查规格。
5. `04-data-contract.md`：统一项目模型、来源、版本、修改影响和任务数据契约。
6. `05-benchmark-suite.md`：18 个基准项目、样本构成和预期覆盖。
7. `06-technical-spikes.md`：高风险验证、通过标准和证据留存。
8. `07-model-evaluation.md`：模型能力槽位、质量评测和成本度量。
9. `08-implementation-roadmap.md`：最小完整链路、阶段依赖和退出门槛。
10. `09-current-code-gap.md`：现有官网与目标产品的代码差距和迁移边界。
11. `10-product-api.md`：官网需求画布到自动处理、进度和成果访问的统一接口。
12. `11-deferred-integrations.md`：多方式登录、密码找回与支付等延期集成技术债务。
13. `12-ppt-visual-first-rendering.md`：主流程完成后的 PPT 视觉优先、无损复原与可编辑交付专项。
14. `13-current-implementation-status.md`：当前代码事实、设计阶段映射、验证基线和文档同步规则。

## 机器可读契约与基准

- 核心非基准契约校验：运行 `npm run contracts:check`，检查正式项目模型和任务运行时 Schema 及对应示例；本命令需要 Python 包 `jsonschema`。

- `contracts/project-model.schema.json`：正式项目模型 V1。
- `contracts/benchmark-manifest.schema.json`：基准输入清单 V1。
- `contracts/benchmark-run.schema.json`：模型候选单次运行记录 V1。
- `contracts/source-block.schema.json`：跨格式统一来源块 V1。
- `contracts/media-analysis-route.schema.json`：OCR 与视觉模型成本路由结果 V1。
- `contracts/ocr-result.schema.json`：供应商无关的 OCR 页、区域、坐标和置信度结果 V1。
- `contracts/context-pack.schema.json`：章节级证据、连续性主干和 token 预算包 V1。
- `contracts/section-draft.schema.json`：带块级声明类型和来源引用的章节草稿 V1。
- `contracts/section-quality-report.schema.json`：章节自动质量门报告 V1。
- `contracts/model-routing-policy.schema.json`：模型能力槽位与任务强制路由策略 V1。
- `contracts/model-dispatch.schema.json`：单次模型调度和预算决策 V1。
- `contracts/deliverable-generation-plan.schema.json`：共享语义模块与多格式渲染任务计划 V1。
- `contracts/deliverable-execution-run.schema.json`：成果生成、质量门与渲染节点执行状态 V1。
- `contracts/artifact-repository.schema.json`：内容、模板、渲染、文件和成果包版本仓库 V1。
- `contracts/change-impact-plan.schema.json`：R/C/S/P 修改分类、传播路径与锁定冲突计划 V1。
- `contracts/task-runtime.schema.json`：幂等任务、Worker 租约、尝试记录和无人化重试状态 V1。
- `contracts/user-progress.schema.json`：面向用户的阶段、成果可用性和自动恢复进度 V1。
- `contracts/intake-handoff.schema.json`：匿名需求草稿、登录绑定、私有上传和自动启动状态 V1。
- `contracts/file-validation.schema.json`：上传文件真实类型、资源风险和隔离决策 V1。
- `contracts/file-access-decision.schema.json`：私有文件三重归属检查和短期下载授权结果 V1。
- `contracts/deletion-run.schema.json`：方案删除、账号注销、异步清理和备份墓碑状态 V1。
- `contracts/operations-snapshot.schema.json`：无人化交付、时延、积压、成本和供应商健康快照 V1。
- `contracts/product-api-catalog.schema.json`：产品前后端接口、认证边界和自动启动行为 V1。
- `benchmarks/evaluation-protocol.md`：预检、运行、评分和候选比较协议。
- `benchmarks/BM-01/manifest.json`：首个可执行的多格式合成基准包。
- `spikes/source-ingestion/README.md`：BM-01 DOCX/PDF/XLSX/PPTX/图片确定性解析及视觉路由原型。
- `spikes/long-document/README.md`：可中断恢复、逐章校验和局部失效的长文档状态账本原型。
- `spikes/model-routing/README.md`：免费/正式分析、视觉任务和内部预算的能力槽位执行原型。
- `spikes/deliverable-planning/README.md`：七类成果的语义复用、格式渲染和成本预测原型。
- `spikes/deliverable-execution/README.md`：语义生成、质量门和多格式渲染的可恢复执行状态机。
- `spikes/artifact-versioning/README.md`：内容版本、渲染版本、模板版本及成果包隔离原型。
- `spikes/change-impact/README.md`：结构化修改的最小影响集、执行分类和锁定边界原型。
- `spikes/task-runtime/README.md`：任务幂等、租约回收、错误分类和自动恢复原型。
- `spikes/progress-aggregation/README.md`：底层任务到用户可理解进度与渐进开放状态的聚合原型。
- `spikes/intake-handoff/README.md`：登录前需求画布到登录后自动处理的无缝衔接原型。
- `spikes/upload-validation/README.md`：多格式上传识别、压缩/加密/宏风险与单文件隔离原型。
- `spikes/private-access/README.md`：用户/方案/文件隔离、短期签名下载和删除撤销原型。
- `spikes/data-deletion/README.md`：访问撤销、数据清理、备份防复活和孤儿回收原型。
- `spikes/operations-monitoring/README.md`：匿名运行指标、自动告警和安全处置原型。

## 当前约束

- 沿用官网的 Next.js App Router、React、TypeScript 和 Tailwind CSS。
- 数据访问层继续使用 Drizzle ORM，但产品数据从 SQLite 调整为 PostgreSQL。
- 产品用户身份与现有管理员身份完全隔离。
- 项目文件进入私有对象存储，不写入 `public/` 目录。
- 支付、订单、套餐、发票、退款和修改计费不进入当前流程。
- 正式运行不设置人工分析、人工改稿、人工审核或人工交付节点。
- 快速理解与正式分析使用不同质量/成本档位的能力槽位。
- 多格式导出和成果包组装复用同一成果内容模型，不重复调用模型生成。
- PPT 视觉增强在主流程验收后实施；图像只确定视觉方向，正文、数字和引用始终以结构化内容模型为准。

## 变更规则

- 已确认原则优先于暂定参数。
- 暂定参数必须带 `TBD-` 编号并由基准项目校准，不得静默固化为产品限制。
- 对统一项目模型、来源块、版本规则和成果关系的变更必须同步更新本目录全部受影响文档。
- 开发任务必须能够追溯到 `REQ-`、`DEL-`、`NFR-`、`SEC-` 或 `OPS-` 编号。
