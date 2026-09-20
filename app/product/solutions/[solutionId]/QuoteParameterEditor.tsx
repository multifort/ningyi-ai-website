"use client";

import { useEffect, useState } from "react";
import { productApi } from "../../../../lib/product/api-contract";

type Parameter = { key: string; label: string; sourceValue: number | null; overrideValue: number | null; value: number | null };
type Item = { code: string; title: string; kind: string; parameters: Parameter[] };

export default function QuoteParameterEditor({ solutionId, onUpdated }: { solutionId: string; onUpdated: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    fetch(productApi.quoteParameters(solutionId)).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!live) return;
      if (!response.ok || !payload?.success) throw new Error("报价参数暂不可用。");
      const nextItems = payload.data as Item[];
      const values: Record<string, string> = {};
      nextItems.forEach((item) => item.parameters.forEach((parameter) => { values[`${item.code}:${parameter.key}`] = parameter.value == null ? "" : String(parameter.value); }));
      setItems(nextItems); setBaseline(values); setDraft(values);
    }).catch((error) => { if (live) setNotice(error instanceof Error ? error.message : "报价参数暂不可用。"); });
    return () => { live = false; };
  }, [solutionId]);

  const save = async () => {
    if (busy) return;
    const invalidInput = items.some((item) => item.parameters.some((parameter) => {
      const id = `${item.code}:${parameter.key}`;
      return draft[id] !== baseline[id] && draft[id].trim() !== "" && !Number.isFinite(Number(draft[id]));
    }));
    if (invalidInput) { setNotice("请检查已修改的参数，所有非空值都必须是有效数字。"); return; }
    const changes = items.flatMap((item) => item.parameters.flatMap((parameter) => {
      const id = `${item.code}:${parameter.key}`;
      if (draft[id] === baseline[id]) return [];
      if (!draft[id].trim()) return [{ code: item.code, key: parameter.key, value: null }];
      const value = Number(draft[id]);
      return [{ code: item.code, key: parameter.key, value }];
    }));
    if (!changes.length) { setNotice("参数没有发生变化。"); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(productApi.quoteParameters(solutionId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(parameterError(payload?.error?.code));
      setNotice(payload.data.renderQueued ? `已保存参数；${payload.data.invalidatedArtifacts.join("、")} 正在按确定性规则重新生成，不会调用模型。` : "参数已保存；已没有需要替换的交付文件。后续生成会使用这些参数。");
      const updated = await fetch(productApi.quoteParameters(solutionId));
      const refreshed = await updated.json().catch(() => null);
      if (updated.ok && refreshed?.success) {
        const values: Record<string, string> = {};
        (refreshed.data as Item[]).forEach((item) => item.parameters.forEach((parameter) => { values[`${item.code}:${parameter.key}`] = parameter.value == null ? "" : String(parameter.value); }));
        setItems(refreshed.data); setBaseline(values); setDraft(values);
      }
      onUpdated();
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存报价参数失败。"); }
    finally { setBusy(false); }
  };

  if (!items.length && !notice) return null;
  return <section className="mt-7 rounded-3xl border border-amber-100 bg-white p-6 shadow-[0_14px_40px_rgba(180,83,9,.05)] sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-amber-700">确定性参数 · 不调用模型</p><h2 className="mt-2 text-xl font-bold text-primary">核对估算与报价参数</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">调整人天、系数、日单价或税率后，只会重算并重建受影响的 Excel 成果。税率和折扣率按 0–1 输入（例如 6% 输入 0.06）；留空可撤销用户覆盖并恢复材料中的原值。</p></div><button type="button" onClick={save} disabled={busy || !items.length} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50">{busy ? "正在保存并排队…" : "保存参数并重算"}</button></div>
    {items.length > 0 && <div className="mt-5 space-y-3">{items.map((item) => <article key={item.code} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-sm font-bold text-primary">{item.title}</h3><span className="text-[10px] text-slate-400">{item.kind === "estimation_item" ? "估算项" : "报价整体参数"} · {item.code}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{item.parameters.map((parameter) => { const id = `${item.code}:${parameter.key}`; return <label key={parameter.key} className="text-xs font-semibold text-slate-600">{parameter.label}<input type="number" inputMode="decimal" step={parameter.key === "valid_days" ? 1 : "any"} value={draft[id] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [id]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" placeholder={parameter.sourceValue == null ? "未提供" : `材料值 ${parameter.sourceValue}`} /></label>; })}</div></article>)}</div>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{notice}</p>}
  </section>;
}

function parameterError(code?: string) {
  const errors: Record<string, string> = {
    INVALID_QUOTE_PARAMETER_VALUE: "参数超出允许范围：税率/折扣率需为 0–1，系数需大于 0 且不超过 10，人天和单价需为非负数。",
    INVALID_QUOTE_PARAMETER_CHANGE: "参数条目已变化，请刷新后重试。",
    FORMAL_DOCUMENT_INCOMPLETE: "正式章节尚未全部完成，暂时不能修改报价参数。",
    QUOTE_PARAMETER_ITEM_AMBIGUOUS: "估算项编号重复，暂不能安全修改参数。",
  };
  return (code && errors[code]) || "保存失败，请稍后重试。";
}
