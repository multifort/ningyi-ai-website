export type DeliveryContent = {
  demo: {
    kicker: string;
    title: string;
    description: string;
    fragments: Array<{ title: string; detail: string }>;
    workshopSteps: Array<{ title: string; detail: string }>;
    deliverables: Array<{ title: string; detail: string }>;
    summaries: Array<{ title: string; description: string; value: string }>;
  };
  architecture: {
    kicker: string;
    title: string;
    description: string;
    stages: Array<{ step: string; title: string; description: string; detail: string }>;
    note: string;
    promise: string;
  };
};
export const defaultDeliveryContent: DeliveryContent = {
  demo: {
    kicker: "服务如何完成交付",
    title: "从零散材料到可交付成果",
    description: "需求片段、会议纪要、功能表格和历史方案先被梳理为统一的项目事实，再关联形成需求、方案、估算、报价、实施计划与汇报材料。",
    fragments: [
      { title: "需求片段", detail: "目标与业务描述" },
      { title: "会议纪要", detail: "判断与待确认项" },
      { title: "功能表格", detail: "模块与功能清单" },
      { title: "客户批注", detail: "变化与补充说明" },
      { title: "历史方案", detail: "经验与规则参考" },
      { title: "现有系统", detail: "接口与部署约束" },
    ],
    workshopSteps: [
      { title: "识别事实", detail: "区分客户事实与推演" },
      { title: "归并范围", detail: "统一目标、范围与功能" },
      { title: "校验缺口", detail: "暴露冲突和待确认项" },
      { title: "建立关联", detail: "关联方案、估算与实施" },
    ],
    deliverables: [
      { title: "项目需求分析", detail: "目标、范围、约束与待确认项" },
      { title: "解决方案与功能清单", detail: "业务、应用、功能与接口设计" },
      { title: "工作量与报价建议", detail: "角色人日、周期与价格依据" },
      { title: "实施计划与汇报材料", detail: "里程碑、风险与客户沟通内容" },
    ],
    summaries: [
      { title: "接收当前已有材料", description: "需求片段、会议纪要、功能表格、客户批注和历史方案都能作为起点，无需重新准备完整资料。", value: "直接使用已有材料启动项目梳理。" },
      { title: "梳理项目并组织方案", description: "区分事实、建议与待确认项，归并范围和功能，再把需求、方案、估算与实施关联起来。", value: "先把项目讲清楚，再开展方案与报价。" },
      { title: "交付可继续工作的成果", description: "交付需求、方案、功能、工作量、报价、实施计划和汇报材料，成果可复核、可修改并保持一致。", value: "一次项目梳理，多类成果统一使用。" },
    ],
  },
  architecture: {
    kicker: "服务交付方式",
    title: "从资料接收到方案成果交付",
    description: "从当前项目已有资料开始，依次完成项目事实梳理、范围与成本关联、方案组织和成果交付；企业模板、规则与历史经验可按需引用。",
    stages: [
      { step: "资料接收", title: "从现有材料开始", description: "接收需求文档、表格片段、会议纪要、沟通记录或人工补充事实。", detail: "无需重新整理，可先脱敏" },
      { step: "项目梳理", title: "统一项目事实", description: "整理目标、范围、约束、需求、功能、外部系统和待确认事项，并标记来源。", detail: "事实、建议与待确认项分开" },
      { step: "方案组织", title: "关联范围与成本", description: "从需求到功能，再关联方案、工作量、周期、报价和范围变更影响。", detail: "关键依据可核对、可调整" },
      { step: "成果交付", title: "交付完整成果包", description: "交付需求分析、功能清单、解决方案、工作量、报价、实施计划和汇报材料。", detail: "统一口径，可继续修改" },
    ],
    note: "每一步均保留材料来源、待确认事项与关键确认记录，便于客户和项目团队共同复核。",
    promise: "成果可核对，也可继续修改",
  },
};
