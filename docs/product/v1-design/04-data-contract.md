# 04 统一数据契约、状态机与版本模型

## 1. 设计目标

统一数据契约解决五个核心问题：

1. 多格式材料如何被统一定位和引用。
2. 快速理解与正式分析如何隔离，避免低成本模型结论污染正式成果。
3. 七类成果如何共享事实、数字、术语和关系。
4. 用户修改如何定位影响范围并避免无关变化。
5. 长文档和文件生成如何中断续跑、检查和回退。

产品界面可以使用“方案”概念；系统内部使用 `project` 作为数据容器，但不得要求用户先创建该对象。

## 2. 领域分层

```text
Identity Domain
  ProductUser / ProductSession / LoginChallenge

Intake Domain
  IntakeDraft / IntakeAnswer / UploadBatch

Source Domain
  SourceFile / SourceRevision / ParseRun / SourceBlock / TemplateAsset

Project Domain
  Project / ProjectSnapshot / ProjectEntity / ProjectRelation
  Term / Assumption / Conflict / Decision / UserLock

Delivery Domain
  Deliverable / DeliverableObject / DocumentSection / Deck / Slide
  ContentVersion / RenderVersion / ExportPackage

Execution Domain
  PipelineRun / Task / TaskAttempt / Artifact / QualityResult
  UsageRecord / ErrorEvent / DeletionJob
```

## 3. 存储边界

### 3.1 PostgreSQL

保存身份、项目元数据、结构化项目对象、关系、版本、任务、质量结果、用量和对象存储 Key。正文可以使用 JSONB，但关键可查询字段必须规范化。

### 3.2 私有对象存储

保存原始文件、解析中间件、页面图片、标准化文件、Office/PDF 成果和 ZIP。数据库不保存大文件二进制；对象 Key 不暴露用户输入的原始文件名。

### 3.3 Worker 临时空间

只保存单次任务必要文件，任务结束或超时后清理。临时目录不得被 Web 服务器公开。

## 4. 身份与 Intake

### 4.1 product_users

| 字段 | 类型 | 规则 |
|---|---|---|
| id | UUID | 主键 |
| username / username_normalized | text | 展示值与规范化唯一查找值 |
| password_hash | text | BCrypt；不保存明文密码 |
| status | enum | active、deletion_pending、deleted、blocked |
| created_at / updated_at | timestamptz | 服务器时间 |

管理员账号继续属于独立 `admins` 域，不增加联合角色字段。

### 4.2 intake_drafts

| 字段 | 类型 | 规则 |
|---|---|---|
| id | UUID | 浏览器登录前生成的 draft_id |
| user_id | UUID? | 登录后绑定；未绑定草稿只存非敏感表单状态 |
| purpose_primary | enum | 最低条件之一 |
| purpose_secondary | jsonb | 多选 |
| organization | jsonb | 名称、行业、类型 |
| users | jsonb | 实际用户标签/描述 |
| need_description | text | 与有效材料至少一种 |
| product_shapes | jsonb | 包含 agent / unknown |
| constraints | jsonb | 预算、周期、部署、接口等 |
| status | enum | local、bound、submitted、expired |
| expires_at | timestamptz | 配置化 |

登录前文件对象不写入数据库；登录后由 `upload_batches` 接管。

## 5. 来源数据契约

### 5.1 source_files

| 字段 | 类型 | 规则 |
|---|---|---|
| id | UUID | 稳定文件 ID |
| project_id / user_id | UUID | 双重归属校验 |
| category | enum | content、template、brand |
| original_name_encrypted | text | UI 展示需要时解密 |
| storage_key | text | 私有对象 Key |
| declared_mime / detected_mime | text | 必须分别保存 |
| size_bytes / sha256 | bigint/text | 校验、去重和审计 |
| status | enum | selected、validating、uploaded、parsing、parsed、partial、failed、deleted |
| parse_policy | jsonb | OCR、视觉、公式、宏隔离策略 |
| created_at / deleted_at | timestamptz | 生命周期 |

### 5.2 source_revisions

用户替换文件或追加同名文件不会覆盖旧文件，而是生成新 revision。字段包含 `source_file_id`、`revision_no`、`storage_key`、`sha256`、`is_current` 和 `supersedes_revision_id`。

### 5.3 source_blocks

所有解析器输出统一为来源块：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 引用主键 |
| file_revision_id | UUID | 精确到文件版本 |
| block_type | enum | paragraph、heading、table、cell_range、image、chart、slide、note、shape、page_region、template_element |
| locator | jsonb | 页、段落、幻灯片、工作表、单元格、坐标等 |
| canonical_text | text | 标准化文字；模板占位示例不得进入项目事实 |
| structured_data | jsonb | 表格、图表、层级、布局关系 |
| media_artifact_id | UUID? | 图片或渲染页对象 |
| content_hash | text | 块级去重与重跑比较 |
| parser_name / parser_version | text | 可回归 |
| confidence | numeric | 解析置信度，不等同事实可信度 |
| warnings | jsonb | OCR、公式、截断、合并单元格等 |
| classification | enum | project_content、template_style、brand_asset、unknown |

### 5.4 locator 规范

```json
{
  "page": 12,
  "slide": null,
  "sheet": null,
  "cellRange": null,
  "paragraph": 4,
  "shape": null,
  "bbox": [0.08, 0.21, 0.92, 0.36]
}
```

所有位置索引对用户展示时为 1 起始；内部解析器如使用 0 起始必须在适配层转换。

## 6. 快速理解与正式项目模型

### 6.1 隔离原则

- 快速理解保存为 `analysis_preview`，只用于 UI 快速反馈和正式分析规划。
- 正式分析必须重新读取有效 `source_blocks` 和用户确认信息。
- 快速理解的自由文本不得直接成为正式项目实体的唯一来源。
- 正式实体可以引用快速阶段发现的“需要验证的问题”，但必须在正式证据中闭合或标记假设。

### 6.2 统一材料知识快照

`solution_understandings.knowledge_json` 是多格式材料完成确定性解析和媒体识别后的统一中间层，不是另一份自由生成文本。快照包含版本、输入内容指纹、材料/格式覆盖、去重后的事实、事实主题、全部来源块、潜在冲突和缺失主题。

- Word、PDF、PPT、Excel、图片与结构化填写信息全部先归一为 `source_blocks`，再进入同一快照。
- 相同规范化表述合并，但必须保留全部 `sourceBlockIds`、来源文件与来源格式。
- 不同来源对同一主题存在肯定/否定表述时生成 `CONFLICT-*`，正式章节必须标记待确认，不能自行取舍。
- 快照不调用模型；来源块新增、内容更新或删除时由数据库立即把快照标记为 `stale`，算法版本变化、媒体块完成、输入指纹不一致或历史记录缺失时，由流水线小批量自动重建。
- 快照重建使用数据库立即事务，材料写入与快照提交不能交错；正式章节开始前再次核对状态、算法版本和输入指纹，不允许读取旧快照。
- 正式章节的尝试记录保存其知识版本和输入指纹；模型返回后在章节发布事务内再次校验。生成期间材料变化时，旧候选不得发布，实际 Token 仍记入成本台账，并使用新快照自动重试；这种并发废弃不占用模型质量失败的重试额度。
- 免费分析与正式章节均读取该快照；正式章节同时读取原始来源块，事实引用仍必须通过来源 ID 校验。

### 6.3 projects

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 内部项目 ID |
| user_id | UUID | 所有者 |
| display_name | text | 用户可见方案名称 |
| project_type | enum | software、integration、upgrade、deployment、ai_agent、hybrid |
| status | enum | 见状态机 |
| active_snapshot_id | UUID? | 当前发布项目模型 |
| candidate_snapshot_id | UUID? | 正在检查候选模型 |
| created_from_draft_id | UUID | 入口追踪 |
| retention_policy | jsonb | 采用版本化策略 |

### 6.4 project_snapshots

每次正式项目模型重构形成不可变快照：

- `id`、`project_id`、`version_no`。
- `status`：building、candidate、published、rejected、archived。
- `parent_snapshot_id`。
- `input_manifest_hash`：有效来源修订、Intake 和用户决策集合的哈希。
- `model_slot`、`prompt_version`、`schema_version`。
- `summary`、`scope`、`metrics`。
- `created_at`、`published_at`。

局部对象修改不一定创建全量新快照；发布时形成新的内容版本并冻结对象集合视图。

## 7. 通用项目实体

为避免在早期把所有对象固化成几十张表，V1 使用“核心规范表 + 类型化 payload + 关系表”。确定性计算对象（估算、报价、计划）仍使用专门表或严格 schema。

### 7.1 project_entities

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 数据库主键 |
| stable_key | text | 如 `REQ-023`；项目内唯一且不复用 |
| project_id / snapshot_id | UUID | 归属 |
| entity_type | enum | actor、goal、scope、requirement、feature、constraint、integration、data_entity、agent_capability 等 |
| title | text | 可搜索标题 |
| payload | jsonb | 按 entity_type 通过 schema 校验 |
| lifecycle_status | enum | proposed、confirmed、active、changed、cancelled |
| confidence_state | enum | user_confirmed、multi_source、single_source、system_proposed、conflict、unknown |
| visibility | enum | client、internal、both |
| origin | enum | user、source、model、rule、migration |
| locked | boolean | 锁定后不被材料覆盖 |
| content_hash | text | 变更比较 |

### 7.2 project_relations

| 字段 | 说明 |
|---|---|
| from_entity_id / to_entity_id | 有向关系 |
| relation_type | satisfies、implemented_by、depends_on、conflicts_with、derived_from、estimated_by、scheduled_in、quoted_by、mentioned_in、replaces 等 |
| strength | required、recommended、informational |
| rationale | 关系理由 |
| source_refs | 关系本身的来源 |
| status | active、candidate、removed |

关系类型必须有方向定义，禁止同一类型在不同模块中使用相反语义。

### 7.3 evidence_links

把项目实体或关系连接到证据：

- `target_type`：entity、relation、section_claim、slide_claim、calculation_input。
- `target_id`。
- `source_block_id` 或 `user_decision_id`。
- `evidence_role`：supports、contradicts、context、example、template_only。
- `quote_excerpt`：短摘录，用于 UI；完整正文仍在来源块。
- `priority`：用户确认 > 当前有效材料 > 旧材料 > 系统建议。

## 8. 假设、冲突、决策与锁定

### 8.1 assumptions

字段：编号、描述、原因、影响对象、风险等级、验证方法、状态、来源、到期条件。未知信息不能以肯定事实写入成果，必须引用假设编号。

### 8.2 conflicts

字段：冲突类型、左右证据、差异摘要、影响对象、严重度、建议选项、状态。方向性冲突进入用户选择；可由规则解决的格式差异自动处理并记录。

### 8.3 user_decisions

记录用户在 Intake、项目理解和成果工作台的每次确认、选择、修改与撤销。包含前值、后值、目标对象、客户端时间、服务器时间和关联冲突。

### 8.4 user_locks

锁定目标可以是项目实体、字段、章节段落或确定性参数。锁定内容与新材料冲突时创建 conflict，不允许静默解锁。

## 9. 确定性计算数据

### 9.1 estimation_items

关键字段：相关功能、基准人天、五类系数、理由、角色分配、规则版本、输入哈希、结果人天。系数使用 decimal/numeric，禁止浮点累计误差。

### 9.2 plan_items

关键字段：工作包、相关功能、依赖、角色、人天、持续时间、最早/最晚日期、里程碑、交付物和验收。

### 9.3 quote_items

关键字段：相关估算/工作包、数量、单位、单价、税率、折扣、成本、利润、可见范围、币种、规则版本。内部与客户视图由字段级可见性产生，不维护两份语义数据。

## 10. 成果与长文档

### 10.1 deliverables

| 字段 | 说明 |
|---|---|
| id / project_id | 成果主键与归属 |
| deliverable_type | requirements、features、estimation、plan、quote、solution、slides |
| content_version_id | 共享内容版本 |
| status | queued、generating、candidate、available、affected、failed、published |
| dependency_state | 上游对象哈希集合 |
| active_render_version_id | 默认下载渲染 |
| quality_gate_state | pending、passed、failed、waived（V1 生产禁止静默 waived） |

### 10.2 document_sections

字段：稳定章节 Key、父章节、目标、必引对象、预计篇幅、不可变事实、正文、摘要、声明、术语、数字、内容哈希、状态、依赖摘要和剩余计划。

章节按语义单元持久化。Worker 续跑时读取当前项目模型、文档基线、相关章节摘要、未完成计划，不加载全部历史对话。

### 10.3 decks / slides

Deck 保存受众、目的、叙事弧和模板；Slide 保存页面目的、核心结论、内容块、图形意图、引用、演讲备注和布局约束。PPTX 渲染只读取 Slide 对象，不再次调用模型改写关键数字。

## 11. 内容版本、渲染版本和修改影响

### 11.1 content_versions

- `version_no`：项目级递增。
- `parent_version_id`。
- `project_snapshot_id`。
- `change_set_id`。
- `status`：candidate、published、rejected、archived。
- `entity_manifest`：稳定 Key 与内容哈希映射。
- `deliverable_manifest`：成果对象与章节哈希。
- `published_at`。

### 11.2 render_versions

- 关联一个 content_version。
- 保存模板修订、品牌配置、渲染器版本、字体清单、输出格式和文件对象。
- 更换模板只增加 render version，不增加 content version。

### 11.3 change_sets

| 字段 | 说明 |
|---|---|
| trigger_type | user_edit、new_source、parameter_change、template_change、system_repair |
| requested_targets | 用户直接修改对象 |
| locked_targets | 禁止变化对象 |
| impacted_targets | 关系图计算结果 |
| unaffected_sample | 用于检查无关变化 |
| action_class | R、C、S、P |
| before/after hashes | 变更证明 |
| status | planned、running、candidate、published、failed、rolled_back |

影响计算步骤：

1. 找到直接目标。
2. 沿允许传播的关系类型遍历。
3. 遇到锁定对象停止并创建冲突。
4. 划分重新计算、局部生成、仅重新渲染和只需检查的对象。
5. 生成候选版本。
6. 检查受影响召回和无关变化。
7. 原子发布或保留旧版。

## 12. 执行、任务与幂等

### 12.1 pipeline_runs

一次用户启动、重大变更或系统恢复对应一个 pipeline run。保存触发原因、输入清单哈希、当前阶段、总体状态和内容版本候选。

### 12.2 tasks

| 字段 | 说明 |
|---|---|
| task_type | validate_file、parse、ocr、formal_model、generate_section、calculate、render、quality_check、package、delete 等 |
| scope_type / scope_id | 文件、对象、章节、幻灯片、成果或项目 |
| dependency_ids | 明确任务依赖 |
| idempotency_key | project + version + task_type + scope + input_hash |
| status | queued、leased、running、retry_wait、succeeded、failed、cancelled |
| lease_until | Worker 崩溃回收 |
| max_attempts | 按错误类别配置 |
| input_hash / output_hash | 防止错误复用 |

### 12.3 task_attempts

记录每次能力槽位、解析器/渲染器版本、开始结束时间、用量、错误码、降级原因和输出 Artifact。日志只存必要摘要和哈希，不存完整正文。

## 13. 质量结果

`quality_results` 关联项目、版本、成果、对象或文件，包含：

- `layer`：source、deterministic、semantic、render。
- `rule_code`、`severity`。
- `target_ref`。
- `expected`、`actual_summary`。
- `status`：passed、failed、repaired、not_applicable。
- `repair_task_id`。
- `checker_version`。

严重度 `blocker` 阻止候选发布；`error` 阻止相关成果发布；`warning` 可发布但必须在内部状态可见；`info` 只记录。

## 14. 状态机

### 14.1 项目

```text
draft
 → uploading
 → quick_understanding
 → formal_modeling
 → generating
 → partially_available
 → available
 → updating ─────────────┐
      └→ available <─────┘
 → deletion_pending → deleting → deleted

任意处理态 → blocked（只有整体不可继续条件）
blocked → 前一可恢复状态
```

### 14.2 文件

```text
selected → validating → uploaded → parsing → parsed
                         │          ├→ partial
                         │          └→ failed
                         └→ deleted
```

### 14.3 成果

```text
waiting_dependency → queued → generating → candidate_check
  → available → published
  → failed

published → affected → regenerating → candidate_check
  → published（新版本）
  → failed（旧发布版继续可用）
```

### 14.4 删除

```text
requested → access_revoked → deleting_objects → deleting_records
 → verifying → completed
                      └→ retry_wait → deleting_objects/records
```

## 15. 删除与留存

- 用户请求删除后，项目状态首先变为 `deletion_pending`，普通 API 立即拒绝读取和下载。
- 删除任务按项目生成不可逆对象清单，逐类清理并核对孤儿对象。
- 备份中的数据按备份留存策略自然过期；恢复流程必须重放删除墓碑，防止已删除项目重新出现。
- 运行日志仅保留匿名统计、哈希、错误码和必要审计，不保留可重建正文的信息。

## 16. API 边界建议

V1 API 按领域划分而非按页面划分：

- `/api/product/auth/*`
- `/api/product/intake/*`
- `/api/product/uploads/*`
- `/api/product/projects/*`
- `/api/product/projects/:id/understanding`
- `/api/product/projects/:id/deliverables/*`
- `/api/product/projects/:id/changes/*`
- `/api/product/projects/:id/exports/*`
- `/api/product/projects/:id/deletion`

所有项目 API 从服务端 Session 获取 user_id，不接受客户端提交的 user_id 作为授权依据。

## 17. 现有官网迁移影响

- 保留现有管理员 CMS 表和接口，产品域使用独立表前缀/Schema。
- 现有 `lib/auth.ts` 的默认 JWT Secret 和管理员 Token 不用于产品用户。
- 现有 `/api/upload` 写入 `public/uploads/hero`，只保留 CMS 图片用途；产品上传必须新建私有上传链路。
- Drizzle 可继续使用，但生产产品域采用 PostgreSQL 驱动和迁移，SQLite 只保留现有 CMS 或本地开发用途。
