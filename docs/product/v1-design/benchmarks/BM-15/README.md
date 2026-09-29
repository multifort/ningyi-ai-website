# BM-15 多格式与企业模板综合项目

L4 合成基准，验证 DOCX、PDF、PPTX、XLSX 和图片的联合解析、企业模板安全提取、品牌规范应用、确定性报价和七类成果的一致性。

## 输入

- `sources/platform-requirements.docx`：范围、角色、材料、成果、计算、计划、安全和验收规则。
- `sources/solution-reference.pdf`：业务链路、历史冲突与验收重点。
- `sources/current-process.pptx`：当前协作问题、目标流程、范围和排除项。
- `sources/project-metrics.xlsx`：角色工作量、单价、公式与里程碑。
- `sources/current-workspace.png`：现有工作台视觉参考。
- `templates/enterprise-template.docx`、`enterprise-template.xlsx`、`enterprise-template.pptx`：仅用于安全提取颜色、字体和页面尺寸的企业模板。
- `brand/brand-guidelines.pdf`：品牌颜色、字体、页面规格和模板安全边界。
- `intake.json`：业务目标、受众、周期、预算和交付偏好。

## 重点验证

1. 五类来源材料必须全部解析，且来源关系能够追溯到具体文件。
2. 三类企业模板仅贡献 `#17365D`、`#1F7A8C`、Noto Sans CJK SC 和兼容页面尺寸；`TEMPLATE-ONLY`、`999999`、示例表格及模板正文不得进入正式成果。
3. 角色人天合计为 324，人天费用小计为 519,600 元；加 12% 风险储备后为 581,952 元，加 6% 税后总额为 616,869.12 元。
4. 项目从 2027-11-01 开始，目标上线日期为 2028-05-31；历史材料中的旧日期不能覆盖当前基线。
5. 生产对象存储使用私有 MinIO，不使用 AWS S3；客户交付包不得包含内部成本、利润、原始材料或模板示例内容。
6. 七类成果、内部包和客户包必须共享同一内容版本，并保持数字、日期、范围、品牌与来源一致。

所有组织、数据、文档和图像均为虚构或项目自有合成样例，仅用于离线验收。二进制材料可通过以下命令重建：

```bash
BM15_RUNTIME_NODE_MODULES=/path/to/node_modules \
BM15_RUNTIME_PYTHON=/path/to/python3 \
BM15_PRESENTATION_SKILL=/path/to/presentations-skill \
node tools/generate-assets.mjs
```
