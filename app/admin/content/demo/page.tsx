"use client";

import { useEffect, useState } from "react";
import { defaultDeliveryContent, type DeliveryContent } from "../../../../lib/delivery-content";

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-accent1 focus:ring-2 focus:ring-accent1/20";

export default function DeliveryContentPage() {
  const [content, setContent] = useState<DeliveryContent>(defaultDeliveryContent);
  const [activeTab, setActiveTab] = useState<"demo" | "architecture">("demo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/content/delivery")
      .then((response) => response.json())
      .then((payload) => payload.success && payload.data && setContent(payload.data))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    const token = localStorage.getItem("admin_token");
    const response = await fetch("/api/content/delivery", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(content),
    });
    const payload = await response.json();
    setMessage(response.ok ? "已保存，官网交付流程内容将同步更新。" : payload.error || "保存失败");
    setSaving(false);
  };

  const updateDemoList = (key: "fragments" | "workshopSteps" | "deliverables" | "summaries", index: number, field: string, value: string) => {
    const list = [...content.demo[key]] as Array<Record<string, string>>;
    list[index] = { ...list[index], [field]: value };
    setContent({ ...content, demo: { ...content.demo, [key]: list } as DeliveryContent["demo"] });
  };

  const updateStage = (index: number, field: string, value: string) => {
    const stages = [...content.architecture.stages];
    stages[index] = { ...stages[index], [field]: value };
    setContent({ ...content, architecture: { ...content.architecture, stages } });
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">正在加载交付流程内容…</div>;

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent1">与官网展示一一对应</p>
          <h1 className="mt-2 text-3xl font-bold text-primary">交付流程管理</h1>
          <p className="mt-2 text-sm text-slate-500">维护首页“服务如何完成交付”和“服务交付方式”两个模块，图形与动画结构保持固定。</p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-accent1 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
          {saving ? "保存中…" : "保存并同步官网"}
        </button>
      </div>

      {message && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${message.includes("已保存") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message}</div>}

      <div className="mt-7 flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
        <button type="button" onClick={() => setActiveTab("demo")} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ${activeTab === "demo" ? "bg-accent1 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>零散材料加工流程</button>
        <button type="button" onClick={() => setActiveTab("architecture")} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ${activeTab === "architecture" ? "bg-accent1 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>四阶段交付方式</button>
      </div>

      {activeTab === "demo" ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">模块标题</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">眉题<input className={`${inputClass} mt-2`} value={content.demo.kicker} onChange={(event) => setContent({ ...content, demo: { ...content.demo, kicker: event.target.value } })} /></label>
              <label className="text-sm font-medium text-slate-700">主标题<input className={`${inputClass} mt-2`} value={content.demo.title} onChange={(event) => setContent({ ...content, demo: { ...content.demo, title: event.target.value } })} /></label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">说明<textarea rows={3} className={`${inputClass} mt-2`} value={content.demo.description} onChange={(event) => setContent({ ...content, demo: { ...content.demo, description: event.target.value } })} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">左侧：零散项目材料</h2>
            <p className="mt-1 text-xs text-slate-500">保持六项，对应官网六张材料卡片。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {content.demo.fragments.map((item, index) => <div key={index} className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"><div className="text-xs font-bold text-accent1">材料 {index + 1}</div><input className={`${inputClass} mt-2`} value={item.title} onChange={(event) => updateDemoList("fragments", index, "title", event.target.value)} placeholder="标题" /><input className={`${inputClass} mt-2`} value={item.detail} onChange={(event) => updateDemoList("fragments", index, "detail", event.target.value)} placeholder="说明" /></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">中间：成果加工步骤</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {content.demo.workshopSteps.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold text-accent1">步骤 {index + 1}</div><input className={`${inputClass} mt-2`} value={item.title} onChange={(event) => updateDemoList("workshopSteps", index, "title", event.target.value)} /><input className={`${inputClass} mt-2`} value={item.detail} onChange={(event) => updateDemoList("workshopSteps", index, "detail", event.target.value)} /></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">右侧：可交付成果包</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {content.demo.deliverables.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold text-accent1">成果 {index + 1}</div><input className={`${inputClass} mt-2`} value={item.title} onChange={(event) => updateDemoList("deliverables", index, "title", event.target.value)} /><input className={`${inputClass} mt-2`} value={item.detail} onChange={(event) => updateDemoList("deliverables", index, "detail", event.target.value)} /></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">下方三项说明</h2>
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              {content.demo.summaries.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><input className={inputClass} value={item.title} onChange={(event) => updateDemoList("summaries", index, "title", event.target.value)} placeholder="标题" /><textarea rows={3} className={`${inputClass} mt-2`} value={item.description} onChange={(event) => updateDemoList("summaries", index, "description", event.target.value)} placeholder="说明" /><input className={`${inputClass} mt-2`} value={item.value} onChange={(event) => updateDemoList("summaries", index, "value", event.target.value)} placeholder="强调语" /></div>)}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">模块标题</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">眉题<input className={`${inputClass} mt-2`} value={content.architecture.kicker} onChange={(event) => setContent({ ...content, architecture: { ...content.architecture, kicker: event.target.value } })} /></label>
              <label className="text-sm font-medium text-slate-700">主标题<input className={`${inputClass} mt-2`} value={content.architecture.title} onChange={(event) => setContent({ ...content, architecture: { ...content.architecture, title: event.target.value } })} /></label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">说明<textarea rows={3} className={`${inputClass} mt-2`} value={content.architecture.description} onChange={(event) => setContent({ ...content, architecture: { ...content.architecture, description: event.target.value } })} /></label>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">四个交付阶段</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {content.architecture.stages.map((stage, index) => <div key={index} className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"><div className="text-xs font-bold text-accent1">阶段 {String(index + 1).padStart(2, "0")}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className={inputClass} value={stage.step} onChange={(event) => updateStage(index, "step", event.target.value)} placeholder="阶段名" /><input className={inputClass} value={stage.title} onChange={(event) => updateStage(index, "title", event.target.value)} placeholder="标题" /></div><textarea rows={3} className={`${inputClass} mt-2`} value={stage.description} onChange={(event) => updateStage(index, "description", event.target.value)} placeholder="阶段说明" /><input className={`${inputClass} mt-2`} value={stage.detail} onChange={(event) => updateStage(index, "detail", event.target.value)} placeholder="底部强调语" /></div>)}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary">底部说明</h2>
            <textarea rows={2} className={`${inputClass} mt-4`} value={content.architecture.note} onChange={(event) => setContent({ ...content, architecture: { ...content.architecture, note: event.target.value } })} />
            <input className={`${inputClass} mt-3`} value={content.architecture.promise} onChange={(event) => setContent({ ...content, architecture: { ...content.architecture, promise: event.target.value } })} />
          </section>
        </div>
      )}
    </div>
  );
}
