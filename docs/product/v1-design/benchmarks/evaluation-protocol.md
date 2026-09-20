# 基准运行与模型候选评测协议

## 1. 运行前预检

1. 读取目标项目 `manifest.json`，验证版本、路径和 SHA-256。
2. 在新的运行目录中写入只读输入快照，不复用上次模型输出。
3. 冻结能力槽位、模型版本、提示版本、解析器版本和价格版本。
4. 验证基准数据所在 Bucket、数据库 Schema 和密钥与生产环境隔离。
5. 任一清单哈希不一致时终止运行，不自动更新清单。

## 2. 单次运行

```text
manifest preflight
 → deterministic parsing
 → source blocks
 → selected model slot
 → project-model candidate
 → schema/business validation
 → required deliverables
 → review and file checks
 → scoring
 → immutable run record
```

- 每个阶段写入开始、完成、失败、重试和降级事件。
- 模型输入记录对象引用和 Token 计数，不在普通日志保存正文。
- 确定性解析、公式、文件哈希和渲染结果不得由模型重写。
- 运行失败保留证据和最后检查点；重试创建 attempt，不覆盖原失败记录。

## 3. 评分

- 基准专属权重和阈值存放在 `BM-xx/expected/scoring-rubric.json`。
- 运行记录符合 `contracts/benchmark-run.schema.json`。
- 总分用于候选排序，阻断项独立判定；任何阻断失败即整次失败。
- 自动评分比较稳定对象、数值、关系和来源；语义质量使用固定审核规则，不使用生成模型自评作为唯一证据。
- 文件质量需要打开、结构和视觉三类结果；只验证文件扩展名不计通过。

## 4. 候选比较

- 同一候选、同一基准至少运行三次，报告平均值、标准差、最差值、P50/P95 时间和成本。
- 先比较能否通过阻断项，再比较质量；只有质量达标后才比较成本。
- FAST 槽位以速度和成本为主，但不能漏掉是否可继续、范围外内容和明显冲突。
- FORMAL、DOCUMENT、REVIEW 槽位优先质量，不允许因低价降低正式门槛。
- 未通过目标基准版本的模型不得进入生产降级链。

## 5. 结果目录

```text
runs/<run-id>/
  input-snapshot.json
  candidate.json
  events.ndjson
  source-blocks.jsonl
  project-model.json
  quality/
  deliverables/
  usage-ledger.json
  run-record.json
```

运行目录只追加，不原地修改。需要修正评分器时，以新的 `scorer_version` 重新评分并保留旧结果。
## 6. 自动运行入口

先执行无网络、无模型成本的清单与文件摘要校验：

```bash
pnpm benchmark:product -- --benchmark BM-01
```

完整运行复用真实产品 HTTP 链路，包括注册或登录、结构化提交、私有上传、文件检测、任务队列、正式分析、全部成果渲染、基准绑定和无人值守验收。为避免误触发模型成本，必须同时显式提供 `--execute` 和 `PRODUCT_BENCHMARK_EXECUTE=1`：

```bash
PRODUCT_BENCHMARK_EXECUTE=1 \
PRODUCT_BENCHMARK_USERNAME=benchmark-runner \
PRODUCT_BENCHMARK_PASSWORD='replace-with-private-password' \
PRODUCT_WORKER_SECRET='same-as-running-service' \
pnpm benchmark:product -- --benchmark BM-01 --execute
```

账号密码只从环境变量读取，不写入报告。脚本输出单行 JSON，包含匿名运行状态、solutionId、耗时和验收报告；任一 manifest 摘要、上传、终态或质量门失败都会以非零状态退出。

当前可先创建仅覆盖已具备完整材料的先导验收活动；这一步不调用模型：

```bash
PRODUCT_WORKER_SECRET='same-as-running-service' \
pnpm benchmark:product -- --benchmark BM-01 --start-campaign pilot
```

完整运行时增加 `--campaign-id <id>`，本次结果会自动计入该活动。`full` 活动只有在 BM-01 至 BM-18 的 manifest 及全部引用文件校验通过后才能创建，避免生成永远无法完成的验收活动。

先导活动可以无人值守连续执行。该命令默认创建活动并运行至连续通过 30 次；任何一次失败都会立即停止并输出 `campaignId`，修复后用 `--campaign-id <id>` 恢复，避免丢失既有证据。双重执行开关用于防止误触发模型成本：

```bash
PRODUCT_BENCHMARK_EXECUTE=1 \
PRODUCT_BENCHMARK_USERNAME=benchmark-runner \
PRODUCT_BENCHMARK_PASSWORD='replace-with-private-password' \
PRODUCT_WORKER_SECRET='same-as-running-service' \
pnpm acceptance:campaign -- --scope pilot --benchmark BM-01 --execute
```

正常运行达到连续通过次数后，活动仍需五类故障注入证据才能最终标记为通过；批量脚本不会在生产链路中主动制造故障。
先导活动默认运行 BM-01；全量活动默认按 BM-01 至 BM-18 轮转以形成真实覆盖。显式提供 `--benchmark BM-xx` 时可固定运行单套基准，用于修复后的定点复测。

需要一并完成五类隔离故障探针时，先在服务端设置 `PRODUCT_ACCEPTANCE_FAULT_PROBES=1`，再为命令增加 `--probe-faults`。探针覆盖模型故障、Worker 中断、成果损坏、删除竞争和正式生成期间材料并发变化；只使用内存数据库和随机临时目录，不修改用户项目。服务端会校验每项布尔断言与最终状态一致后才接受证据，生产环境应在验收结束后移除该开关。
