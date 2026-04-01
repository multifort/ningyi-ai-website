import { FC } from "react";

const ProductCapability: FC = () => {
  const modules = [
    { icon: "🤖", title: "AI生产管家", desc: "统一交互入口，理解需求并调度任务" },
    { icon: "🤝", title: "多Agent系统", desc: "模拟企业岗位角色，实现协同决策" },
    { icon: "🛠️", title: "Skill执行平台", desc: "打通ERP/MES，实现数据获取与自动执行" },
  ];

  return (
    <section id="capability" className="py-8 bg-bgLight flex flex-col items-center">
      <h2 className="text-3xl font-bold text-primary mb-6">一套系统，构建企业 AI 员工体系
      </h2>
      <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
        {modules.map((m) => (
          <div key={m.title} className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center">
            <div className="text-4xl mb-4 text-accent2">{m.icon}</div>
            <div className="text-xl font-semibold text-primary">{m.title}</div>
            <div className="mt-2 text-sm text-textGray text-center">{m.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductCapability;