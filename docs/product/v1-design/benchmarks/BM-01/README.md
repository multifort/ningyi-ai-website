# BM-01 中型企业 CRM 合成基准包

用于验证从结构化 Intake 与多格式材料出发，完成需求抽取、冲突识别、范围收敛、功能映射、估算和方案生成的最小完整链路。

## 输入

- `intake.json`：结构化用户输入。
- `sources/requirements.docx`：业务需求说明书，包含重复需求和范围外需求。
- `sources/meeting-notes.pdf`：评审纪要，包含权限冲突和移动端边界。
- `sources/customer-sample.xlsx`：合成客户数据与字段说明，包含多种数据质量问题。

## 标准答案

- `expected/key-facts.json`：必须识别的关键事实。
- `expected/project-model.json`：经归并后的稳定项目对象、功能、冲突和关系基线。
- `expected/source-block-index.json`：项目模型来源引用到具体文件与定位的映射。
- `expected/deterministic-values.json`：可程序化校验的固定值。
- `expected/prohibited-claims.json`：不得输出的结论。
- `expected/expected-relations.json`：来源、需求、冲突和交付物之间的关系。
- `expected/scoring-rubric.json`：评分权重、阈值、阻断项和重复运行规则。

正式执行时使用 `manifest.json` 锁定文件哈希和 `benchmark_version=1.0`。所有组织、人员和数据均为合成信息。
