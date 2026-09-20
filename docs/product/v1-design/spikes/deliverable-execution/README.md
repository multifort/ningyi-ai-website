# SPIKE-05：统一成果执行状态机

状态机把完整成果包组织成一个可恢复 DAG，而不是一次不可观察的长任务：

1. `model_generation` 或 `deterministic_compute` 生成可复用语义模块。
2. 每个模块独立进入 `quality_gate`；未通过时只返修该模块。
3. Word、PDF、Excel、PPTX 等 `deterministic_render` 必须等待所引用模块全部通过质量门。
4. 每个节点记录尝试次数和产物哈希；进程重启后从仍可执行的节点继续。
5. 上游内容改变时，仅将其下游质量门和渲染节点标记为 `stale`，不重跑无关成果。

渲染失败不会创建新内容版本；更换模板只需失效对应渲染节点。
