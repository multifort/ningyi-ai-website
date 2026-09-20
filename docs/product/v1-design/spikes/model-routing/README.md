# SPIKE-03：模型能力槽位与预算执行

`dispatch_model.py` 只选择抽象能力槽位，生产部署再将槽位绑定到具体供应商模型。BM-01 策略明确：

- 免费分析使用 `text_economy`。
- 正式分析、正式章节生成、修改和最终质量审查使用 `text_quality`。
- 常规视觉复核使用 `vision_economy`，复杂版面或低置信度视觉任务使用 `vision_quality`。
- 确定性文本和标准 OCR 阶段不调用生成模型。
- 正式任务预算不足时返回 `deferred_budget`，上下文或输出超限时返回 `split_required`，均不得静默降到经济型模型。

`weighted_token_unit` 是用于基准比较的内部加权单位，不代表真实货币价格。实际单价由部署环境的供应商适配器注入，策略文件不固化可能变化的价格。
