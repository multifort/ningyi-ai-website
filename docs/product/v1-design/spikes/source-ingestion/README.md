# SPIKE-01A：BM-01 确定性来源块提取

## 目的

在任何模型调用之前，从 DOCX、原生文本 PDF、XLSX、PPTX 和图片中产生统一、稳定、可定位的来源块，验证 `source-block.schema.json` 和 BM-01 的关键事实可提取性。

实测数据见 `BM-01-result.md`。

## 运行

```bash
python3 docs/product/v1-design/spikes/source-ingestion/extract_source_blocks.py \
  --input docs/product/v1-design/benchmarks/BM-01/sources \
  --base docs/product/v1-design/benchmarks/BM-01 \
  --output /tmp/bm01-source-blocks.jsonl

python3 -m unittest docs/product/v1-design/spikes/source-ingestion/test_bm01.py
```

## 当前边界

- DOCX 提取段落、标题和逐行表格位置；OOXML 本身不提供可靠页码。若 LibreOffice 与 Poppler 可用，会转换为 PDF 并按唯一文本匹配补充页码；重复或未匹配内容明确标记歧义/未匹配，不猜测页码。转换能力不可用时保留 `page_mapping_unavailable` 状态。
- PDF 使用 Poppler `pdftotext -bbox-layout` 保留页码、文本块和归一化坐标；扫描 PDF 仍需进入 OCR/视觉通道。
- XLSX 提取工作表、行、单元格地址、原始值、显示值、公式、数字格式与合并区域；原生图表提取标题、类型、绘图区位置和数据引用公式；数据验证、条件格式及透视表布局/字段/源范围均作为带定位的结构化来源块保留。
- PNG/JPEG 先登记文件身份、尺寸和媒体引用，并明确标记“尚未视觉理解”；后续按成本策略路由至 OCR 或视觉模型。
- PPTX 提取每页文字形状、表格行、图片媒体槽位和归一化坐标；设计元数据记录幻灯片到版式、母版和主题的关系、版式/母版占位符以及主题色和中英文字体映射；用户企业模板可通过 `--pptx-classification template_style` 与项目正文严格区分。

`route_media_analysis.py` 根据文本层、OCR 置信度和版面复杂度执行成本路由：确定性文本不调用模型，扫描页先走标准 OCR，低置信度结果再依次升级至低成本视觉模型和高质量视觉模型。路由中不设置人工处理分支。

`apply_ocr_result.py` 将任意 OCR 供应商映射到 `ocr-result.schema.json` 后的结果重新转换为统一来源块，保留页面、坐标、区域类型、置信度、引擎版本和媒体引用。

`build_context_pack.py` 为单个分析或生成章节构建预算化上下文，只选择相关且去重的证据块，并固定携带项目主干、锁定决策和上一章节摘要。默认保留至少 10% 输入安全余量，输出 token 预算独立预留。
- 这是零模型、零外部数据传输的技术验证，不是生产解析器实现。
