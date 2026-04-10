"use client";
import { FC, useEffect, useState } from "react";

interface CapabilityModule {
  id?: number;
  icon: string;
  title: string;
  desc: string;
}

const ProductCapability: FC = () => {
  const [modules, setModules] = useState<CapabilityModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/content/capability")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setModules(data.data.map((m: any) => ({ ...m, description: m.desc })));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("获取能力模块失败:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section id="capability" className="py-8 bg-bgLight flex flex-col items-center">
        <div className="text-gray-500">加载中...</div>
      </section>
    );
  }

  return (
    <section id="capability" className="py-8 bg-bgLight flex flex-col items-center">
      <h2 className="text-3xl font-bold text-primary mb-6">一套系统，构建企业 AI 员工体系
      </h2>
      <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
        {modules.map((m) => (
          <div key={m.id || m.title} className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center">
            <div className="text-4xl mb-4 text-accent2">{m.icon}</div>
            <div className="text-xl font-semibold text-primary">{m.title}</div>
            <div className="mt-2 text-sm text-textGray text-center">{m.description || m.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductCapability;