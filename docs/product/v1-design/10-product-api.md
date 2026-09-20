# 10 产品前后端统一接口

## 1. 边界

- 产品接口统一位于 `/api/product/*`，与现有 `/api/auth/login` 管理员认证完全隔离。
- 登录后的用户身份只从 HttpOnly 产品 Session 获取；方案接口禁止接受客户端 `userId` 作为授权依据。
- 登录前文件不上传；登录后上传到产品专用私有存储，不复用现有写入 `public/uploads` 的 CMS 图片接口。
- 前端不创建项目或任务、不选择模型。`handoff_intake` 和有效内容文件上传会自动推进处理。
- 所有响应使用 `{ success, data }` 或 `{ success, error: { code, message, retryable } }`，界面不解析任意错误字符串。
- 用户名密码登录在连续失败达到本地阈值后进入短时锁定，成功登录会清除失败记录；生产部署仍应替换为共享限流设施。

## 2. 首版调用顺序

1. 浏览器本地保存需求画布与文件引用。
2. `POST /api/product/intake/validate` 校验两个最低条件。
3. 使用用户名密码登录；没有账号时在同一弹层注册，建立产品 Session。
4. `POST /api/product/intake/handoff` 原子绑定草稿并返回 `solutionId`，有文字时自动开始理解。
5. 将每个文件上传至租户隔离的产品私有存储；上传接口校验文件真实格式。
6. `POST /api/product/solutions/:solutionId/process` 只执行上传完整性检查和幂等入队，立即返回；材料解析不占用用户 Web 请求。
7. 已有项目补充材料时，先调用 `POST /api/product/solutions/:solutionId/materials` 创建私有上传位，再复用上传接口。第一个新内容文件上传成功即废弃旧理解、正式章节和成果；只有全部待上传内容文件完成后才允许重新入队。
8. 已上传的内容材料可通过 `DELETE /api/product/solutions/:solutionId/materials/:fileId` 移除。系统拒绝移除项目的最后一项有效输入；成功后立即撤销该文件的存储引用并基于剩余材料重新入队。
9. 用户可通过 `PATCH /api/product/solutions/:solutionId/intake` 修改原始问题描述。更新后的描述作为项目输入重新入队，不会创建一个脱离原材料的新项目；已有已上传内容材料时允许清空文字说明。
10. 用户可通过 `PATCH /api/product/solutions/:solutionId` 修改项目名称。若正式章节已完成，只重新整理交付文件的文件名和封面，不调用内容模型。
11. 用户可通过 `POST /api/product/solutions/:solutionId/templates` 追加 Word、Excel 或 PPT 企业模板，并复用私有上传接口。模板只影响成果渲染主题和版式，不进入项目事实或内容模型上下文。
12. 已上传企业模板可通过 `DELETE /api/product/solutions/:solutionId/templates/:fileId` 移除。受影响成果会回退到较早模板或平台默认版式并重新渲染，不改变项目内容。
13. 用户可通过 `GET /api/product/solutions/:solutionId/source-package` 下载当前已上传输入文件、原始描述和已确认事实组成的输入包；项目材料、企业模板和品牌素材在包内按目录分开，清单会记录每个原始文件对应的导出路径和 SHA-256 校验值，并附带说明文件和整体输入快照指纹。该接口仅从私有存储读取文件，不调用模型或供应商。
14. 用户可通过 `POST /api/product/solutions/:solutionId/brands` 追加 Logo 与品牌素材，并复用私有上传接口。PNG Logo 仅在本地提取主题色，其他品牌素材安全保存并回退企业模板或平台默认主题；已有成果只重新渲染，不进入材料理解或内容模型。
15. 已上传品牌素材可通过 `DELETE /api/product/solutions/:solutionId/brands/:fileId` 移除。系统会撤销其存储引用并以较早品牌、企业模板或平台默认主题重新渲染已有成果，不改变项目内容。
16. `GET /api/product/solutions/:solutionId/understanding` 在项目理解就绪后同时返回受权限保护的来源块摘录、文件名和定位信息，供用户核对；该响应不会返回私有存储路径或下载链接。
17. `GET /api/product/account/export` 下载当前账号的数据清单，其中包含项目、文件/成果元数据、用户确认事实和最近项目变更；原始文件与成果正文仍通过项目输入包或成果包下载。
18. 用户可通过 `POST /api/product/solutions/:solutionId/duplicate` 将项目说明、已上传输入文件、模板/品牌配置及有效用户确认事实复制成独立新项目；理解、成果和历史版本不复制，且新项目不会自动开始处理。
19. 用户可通过 `POST /api/product/solutions/:solutionId/understanding/facts` 保存确认或纠正信息。它以独立“用户确认”来源进入统一知识，不覆盖原始材料；受影响成果进入重新形成状态。
20. 用户可通过 `DELETE /api/product/solutions/:solutionId/understanding/facts/:factId` 撤销自己的确认事实。记录保留为已撤销审计状态，不再参与知识、章节证据或成果生成。
21. `GET /api/product/account` 返回当前账号的数据清单；`POST /api/product/account/password` 成功后会撤销该账号的旧会话并为当前浏览器签发新会话；`DELETE /api/product/account` 需要当前密码和“注销账号”二次确认，立即撤销会话并将账号下项目交给异步清理任务。
22. 图片、扫描 PDF 和 PPT 内嵌图片进入媒体分析队列；未识别的占位内容不进入项目事实。
23. 系统将各格式材料归并为带来源、主题、冲突和缺失项的统一知识快照；前端轮询显示汇总状态，完成的成果立即开放。
24. 正式分析由 `/formal` 每次推进一个章节；章节正文、连续性摘要、证据引用和上下文哈希分别持久化，失败后从当前章节恢复。
25. 成果包 `manifest.json` 记录当前项目的输入快照指纹；每份当前或历史成果同时记录正文版本指纹、文件 SHA-256 与内容/渲染版本，打包过程不调用模型。
26. 项目进度接口会返回当前账号可见的最近项目时间线，记录创建、复制、输入变更、用户确认和输入/成果包下载等关键动作；记录不包含文件正文、密码或私有存储路径。

## 3. 媒体分析无人值守调度

- 定时执行器使用 `Authorization: Bearer <PRODUCT_WORKER_SECRET>` 调用 `POST /api/product/internal/media/tick?limit=1`；`limit` 可设为 1–10，任务原子领取后并行执行。单批实际并发受 `PRODUCT_MEDIA_BATCH_CONCURRENCY` 限制。
- OCR、低成本视觉和高质量视觉分别由 `PRODUCT_OCR_CONCURRENCY`、`PRODUCT_VISION_LOW_COST_CONCURRENCY`、`PRODUCT_VISION_PREMIUM_CONCURRENCY` 控制，默认分别为 8、4、2，防止某类供应商限流拖住其他能力槽位。
- `PRODUCT_MEDIA_USER_CONCURRENCY` 控制单个用户同时占用的媒体任务数，默认 4，避免图片量很大的方案占满全部 OCR/视觉能力。
- 图片和扫描件优先调用 `PRODUCT_OCR_ENDPOINT` 配置的标准 OCR；失败依次降级至低成本视觉模型和高质量视觉模型。
- OCR 未配置但视觉模型可用时立即自动切换低成本视觉，不在无效配置上等待；所有可用媒体能力均缺失时进入 `awaiting_configuration`，默认每 5 分钟检查一次而非每秒重试。默认五次耗尽后标记 `MEDIA_CONFIGURATION_RETRY_EXHAUSTED` 并阻断方案，6 小时后自动开启新一轮修复。
- OCR 接口接收 Base64 内容、MIME 类型、文件名和中英文提示，返回 `text`、`confidence` 及可选的 `usage`。
- 媒体识别结果回写可追溯来源块并刷新免费理解；全部媒体完成后才自动初始化正式分析。
- 服务尚未配置时任务进入 `awaiting_configuration`，不会把图片占位符当作事实，也不会错误推进正式分析。
- 媒体任务使用由 `PRODUCT_MEDIA_LEASE_SECONDS` 控制的所有者租约；成功、等待配置、降级或失败后均释放租约，过期 Worker 的迟到结果不得覆盖新 Worker 的输出。
- 成功和失败的外部 OCR/视觉调用都写入成本台账；运行快照统计媒体积压、等待配置、失败率和模型降级率。

### 材料解析 Worker

- 定时执行器调用 `POST /api/product/internal/source/tick?limit=1`，`limit` 可设为 1–8，实际并发由 `PRODUCT_SOURCE_BATCH_CONCURRENCY` 控制，默认 2。
- 每个方案先原子认领再调用隔离解析器；多个用户的方案并行解析，同一方案不会重复消费。
- `PRODUCT_SOURCE_USER_CONCURRENCY` 控制单个用户同时运行的材料解析数，默认 2；额度判断在数据库认领查询中完成，不依赖单个进程内存。
- Web 请求只负责入队；运行中的 Worker 使用由 `PRODUCT_SOURCE_LEASE_SECONDS` 控制的所有者租约。超时后自动回到队列，旧 Worker 丢失租约后不得提交结果。
- 资料解析失败按 5 秒、30 秒、2 分钟、10 分钟延迟重试，默认五次耗尽后进入 `failed / SOURCE_RETRY_EXHAUSTED` 并将方案标记为阻断；默认 6 小时后系统自动开启新一轮修复。用户重新提交处理时会立即重置该轮尝试，不需要新建项目。

## 4. 正式分析无人值守调度

- 定时执行器使用 `Authorization: Bearer <PRODUCT_WORKER_SECRET>` 调用 `POST /api/product/internal/formal/tick?limit=1`；`limit` 可设为 1–10，单批实际并发由 `PRODUCT_FORMAL_BATCH_CONCURRENCY` 控制。
- 多个方案的待生成章节并行执行，单个方案仍按章节依赖顺序生成；模型供应商的实例内并发由 `PRODUCT_FORMAL_CONCURRENCY` 控制。数据库条件更新负责互斥，重复调度不会同时生成同一章节。
- `PRODUCT_FORMAL_USER_CONCURRENCY` 默认 2，允许同一用户的独立方案并行但不能占满模型池；`PRODUCT_RENDER_USER_CONCURRENCY` 默认 1，防止单个用户的大型 Office 渲染挤占其他用户。
- 正式章节使用由 `PRODUCT_FORMAL_LEASE_SECONDS` 控制的所有者租约；模型响应返回后必须再次验证租约，过期 Worker 的迟到正文、Token 和质量结果不能覆盖接管后的章节。
- 多个方案的成果渲染可并行；每个待渲染方案先原子认领，防止重复生成文件或重复写入版本。
- 完整成果渲染不再占用正式模型 Worker；章节全部完成后仅推进到 `rendering`，下一次调度由渲染能力接管。
- 渲染使用由 `PRODUCT_RENDER_LEASE_SECONDS` 控制的方案级租约；每份 Word、Excel、PPT、PDF 在发布前及数据库提交时再次校验租约。过期 Worker 产生的临时文件不得发布，孤儿文件由存储维护任务清理。
- 渲染失败按 5 秒、30 秒、2 分钟、10 分钟延迟重试，默认五次耗尽后进入 `blocked / RENDER_RETRY_EXHAUSTED`，禁止无限高频生成文件；默认 6 小时后自动开启新一轮修复。成功发布后清空失败状态和等待时间。
- 章节必须通过正文深度、摘要连续性、主张存在、引用覆盖、占位符和连续性检查。
- 失败章节默认最多尝试三次，重试间隔为 30 秒、2 分钟；耗尽后章节和方案进入 `blocked / SECTION_RETRY_EXHAUSTED`，默认 6 小时后以新的重试周期自动修复，同时保留上一周期全部尝试证据。供应商配置后来恢复时，`awaiting_configuration` 文档会自动重新激活。
- 正式部署时由独立 Worker 持续调用；Web 定时接口是当前部署适配层，不向产品用户开放密钥。

### 并发容量监控

- 运行快照分别返回 `source`、`media`、`formal`、`render` 四个阶段的等待任务、活跃租约、配置容量、饱和度、最老等待时间和单所有者最大占用。
- 有等待任务且活跃数达到配置容量时产生 `*_CAPACITY_SATURATED`；未打满但等待时间超过阶段阈值时产生 `*_BACKLOG_HIGH`，用于区分“确实需要扩容”和“调度器未正常消费”。
- 正常容量的解析、媒体和正式分析等待阈值默认 30 秒，渲染默认 300 秒；可通过 `PRODUCT_OPS_<STAGE>_QUEUE_AGE_MAX_SECONDS` 分别校准。

### 统一流水线调度

- 部署调度器优先调用 `POST /api/product/internal/pipeline/tick`，一次并行推动材料解析、媒体识别、正式分析及待渲染方案；仍保留各阶段独立 tick，供独立 Worker 池扩容和故障隔离。
- 可通过 `sourceLimit`、`mediaLimit`、`formalLimit`、`knowledgeLimit` 调整单次领取数量，最终仍受阶段容量、供应商容量和单用户公平额度约束。
- 统一调度返回各阶段独立的 Worker ID、领取结果、恢复数量和总耗时。某阶段空闲不会阻塞其他阶段消费。
- 统一调度采用分阶段结算：任一阶段抛出异常时，其他阶段仍可完成并提交，响应标记 `degraded` 和失败阶段；只有解析、媒体、正式生成三个阶段全部失败时才返回 503 并触发 Runner 指数退避。
- 统一知识补建只查询确实过期的项目并按最老快照优先消费，避免大量正常老项目占据扫描窗口；材料变更会立即置为 `stale`，正式生成前还会校验版本和输入指纹。
- 知识补建批次先按用户分组轮转，再处理同一用户的第二个项目；单个大客户或批量提交用户不能独占补建容量。积压年龄从快照实际进入过期状态时计算，不使用项目最初创建时间制造误告警。
- 长驻进程使用 `pnpm worker:product` 启动，配置 `PRODUCT_APP_ORIGIN` 和 `PRODUCT_WORKER_SECRET` 后立即开始消费；默认每秒轮询一次，不需要用户或运营人员手动触发。
- 网络或服务异常时采用带随机抖动的指数退避，最长 30 秒；成功后立即恢复正常轮询。`SIGTERM`/`SIGINT` 会停止后续领取，让当前 HTTP 调度安全结束。
- Runner 日志只记录阶段处理数量、耗时和错误码，不记录用户名、材料正文、项目名称或密钥。
- Runner 同时维护四条互不阻塞的调度循环：生成流水线默认 1 秒、删除队列默认 1 秒、运行快照默认 60 秒、孤儿文件清理默认 6 小时。可分别通过 `PRODUCT_PIPELINE_POLL_MS`、`PRODUCT_DELETION_POLL_MS`、`PRODUCT_OPERATIONS_POLL_MS`、`PRODUCT_STORAGE_MAINTENANCE_POLL_MS` 调整。
- 删除任务使用 `PRODUCT_DELETION_LEASE_SECONDS` 所有者租约和原子领取；多个 Runner 可并行清理不同项目，租约丢失的 Worker 不得提交数据库删除结果。`PRODUCT_DELETION_BATCH_CONCURRENCY` 默认 2。
- 删除失败按 5 秒、30 秒、2 分钟、10 分钟逐级延迟重试，五次耗尽后进入明确的 `failed / DELETION_RETRY_EXHAUSTED`，不再伪装为等待状态；默认 6 小时后由系统自动开启新一轮修复，可通过 `PRODUCT_DELETION_AUTO_REPAIR_SECONDS` 调整，无需人工重新提交。监控同时检查失败数和最老删除任务等待时间。
- 每个 Runner 启动时生成独立 `workerId`，默认每 15 秒向 `POST /api/product/internal/health` 写入心跳，正常停止时登记 `stopped`。`GET /api/product/internal/health` 在没有有效 Worker 时返回 503，供部署健康检查使用；积压存在但 Worker 全部失联时产生 `WORKER_UNAVAILABLE` 告警。
- 心跳同时上报生成流水线、删除、运行快照和存储维护循环的最后成功时间、最后实际推进时间与连续失败次数。存在已到期可执行积压时，如果所有有效 Runner 的流水线最后成功时间超过 60 秒，健康检查返回 503 并产生 `PIPELINE_LOOP_STALLED`，防止“进程仍活着但任务不再推进”的假健康；阈值可通过 `PRODUCT_PIPELINE_HEALTH_STALE_SECONDS` 调整。
- 删除链路采用同样的能力感知检查：只评估声明了 `deletion` 能力的 Runner；存在到期删除任务或租约已过期的删除任务时，删除循环超过默认 60 秒未成功会返回 503 并产生 `DELETION_LOOP_STALLED`。阈值可通过 `PRODUCT_DELETION_HEALTH_STALE_SECONDS` 调整。
- 运行快照属于监控基础设施，不以任务积压作为触发条件。声明了 `operations` 能力的 Runner 必须在默认 180 秒内至少成功生成一次快照，否则主健康检查返回 503；外部探针或手工快照会得到 `OPERATIONS_LOOP_STALLED`。阈值可通过 `PRODUCT_OPERATIONS_HEALTH_STALE_SECONDS` 调整，建议至少为快照轮询周期的两倍。
- 运行快照 1.3 包含 `knowledgeHealth`。未建立、算法版本过期或晚于快照更新的来源材料计入知识归并积压；超过 `PRODUCT_OPS_KNOWLEDGE_BACKLOG_MAX` 或 `PRODUCT_OPS_KNOWLEDGE_BACKLOG_AGE_MAX_SECONDS` 时触发 `KNOWLEDGE_RECONCILIATION_BACKLOG`，流水线继续小批量自动修复。知识积压同时计入主流水线 backlog，因此无可用 Worker 时健康检查会失败。
- 快照同时报告材料并发变化造成的废弃调用数、占正式调用比例和实际成本。单项目一小时内重复发生时，正式生成等待窗口按指数退避至最多 300 秒；全局次数和比例超过阈值时产生 `MATERIAL_CHANGE_DISCARD_HIGH`，该内部废弃不会被误算为模型供应商失败。
- 私有存储维护在 Runner 启动后立即执行一次，之后默认每 6 小时运行；清理仍受 24 小时孤儿文件保护期和单批 200 个文件上限约束。连续两个维护周期以上未成功时健康检查返回 503，并产生 `STORAGE_LOOP_STALLED`；默认阈值为 13 小时，可通过 `PRODUCT_STORAGE_HEALTH_STALE_SECONDS` 调整。
- 任一关键循环连续失败达到默认 12 次后，Runner 会停止领取新任务、写入 `worker_restart_requested` 结构化日志、尝试登记停止心跳，并以退出码 1 结束。生产环境必须配置 systemd `Restart=on-failure`、容器 `restart: always` 或等价的云平台重启策略；阈值可通过 `PRODUCT_WORKER_FATAL_FAILURE_THRESHOLD` 在 2–100 次之间调整。
- 仓库内 `deploy/systemd/` 提供 Web、Worker、30 秒外部健康定时器及恢复服务模板。外部探针使用 `scripts/product-healthcheck.mjs`：健康时退出 0，任一关键循环不可用时退出 1，并由 `OnFailure` 恢复 Web 与 Worker，可覆盖事件循环卡死、无法自行熔断的情形。
- Web 与 Worker 的 `ExecStartPre` 统一调用 `scripts/product-production-check.mjs`。检查覆盖两个不同且不少于 32 字节的密钥、绝对且可写的数据路径、生产构建、PDF 中文字体、正式模型供应商密钥及 Python 解析运行时；失败时仅输出稳定错误码并阻止服务启动。
- `scripts/product-backup.mjs` 使用 SQLite 在线备份生成一致性数据库副本，执行完整性检查后使用独立密钥进行 AES-256-GCM 流式加密，明文临时副本随即删除；清单记录密文 SHA-256、IV 和认证标签。systemd 每日调度，失败后 5 分钟重试且单小时最多 3 次。默认保留 14 天，清理器只匹配受控备份文件名，并拒绝备份目录与私有存储目录重叠。
- `scripts/product-restore.mjs` 默认执行不落盘恢复演练，依次验证密文摘要、GCM 认证、SQLite 完整性和表数量；指定 `--output` 时只生成权限为 0600 的新候选库，使用原子硬链接发布并拒绝覆盖现有文件或直接写入在线 `PRODUCT_DB_PATH`。在线库替换必须在 Web 与 Worker 停止后由部署流程单独完成。
- Runner 消费任务前必须通过 `GET /api/product/internal/health?scope=dependencies` 启动自检，确认产品数据库可查询、私有存储可读写且产品 Session 密钥已配置。依赖暂不可用时自动指数退避，不领取用户任务；完整健康检查同时要求至少一个有效 Worker 心跳。

## 5. 当前实施边界

`benchmarks/BM-01/expected/product-api-catalog.json` 是页面与服务端共同依据。目录当前包含 75 项接口语义，覆盖代码中的 57 个路由文件与 71 个唯一方法/路径；一个方法/路径可以因查询参数或 action 不同对应多项语义。提交接口变更前运行 `pnpm api:check`，该命令会双向检查目录遗漏和无实现记录。当前除最低条件校验、用户名密码 Session、草稿交接、私有上传、材料解析、跨格式知识归并、初步理解和进度读取外，还已实现项目模型候选/锁定/修订/影响计划、正式章节续跑、七类成果、成果版本与包、短期下载、项目复制、账号数据管理、异步删除、运行快照、成本台账、配置发布和无人值守验收接口。

当前部署使用独立长驻 `scripts/product-worker.mjs`，通过受保护的内部 tick API 推动解析、媒体、正式生成、渲染、删除和维护；不再由产品用户请求同步等待完整处理。开发和单机部署仍使用 SQLite 与服务器本地私有目录，进入外部灰度前切换 PostgreSQL、对象存储和可水平扩展的 Worker 运行环境，接口语义与用户流程保持不变。完整状态见 `13-current-implementation-status.md`。
