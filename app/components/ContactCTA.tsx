"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import Link from "next/link";

type FormData = {
  name: string;
  company: string;
  phone: string;
  description: string;
};

const emptyForm: FormData = { name: "", company: "", phone: "", description: "" };

export default function ContactCTA() {
  const [formData, setFormData] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.name.trim()) nextErrors.name = "请填写姓名";
    if (!formData.company.trim()) nextErrors.company = "请填写公司或团队名称";
    if (!/^1[3-9]\d{9}$/.test(formData.phone)) nextErrors.phone = "请输入有效的 11 位手机号码";
    if (!formData.description.trim()) nextErrors.description = "请简要说明当前项目情况";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: "" }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setStatus("submitting");
    try {
      const response = await fetch("/api/content/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error("submit failed");
      setFormData(emptyForm);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  const fieldClass = (name: keyof FormData) =>
    `w-full rounded-xl border bg-white/[0.06] px-4 py-3.5 text-sm text-white placeholder:text-slate-400 transition focus:border-accent2 focus:bg-white/[0.09] focus:outline-none ${
      errors[name] ? "border-rose-400" : "border-white/15"
    }`;

  return (
    <section id="cta" className="relative overflow-hidden bg-primary py-14 text-white md:py-20" aria-labelledby="cta-title">
      <div className="absolute inset-0 project-grid opacity-35" aria-hidden="true" />
      <div className="absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-accent1/20 blur-[120px]" aria-hidden="true" />

      <div className="section-shell relative z-10 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div className="section-heading">
          <div className="section-kicker section-kicker-dark">从当前项目开始</div>
          <h2 id="cta-title" className="!text-white lg:!text-[2rem]">直接开始形成你的方案</h2>
          <p className="!text-slate-300">
            从一段问题描述或一份已有材料开始，系统会保存项目、展示理解结果，并持续形成可查看和下载的成果。
          </p>

          <div className="mt-6 space-y-3.5 text-sm text-slate-300">
            {[
              "一份需求、一张功能表或几段会议纪要都可以成为起点",
              "登录后项目与成果持续保留，可随时回来查看",
              "建议先对客户名称、联系人、金额和系统地址进行脱敏",
            ].map((item) => (
              <div key={item} className="flex gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-accent2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="leading-6">{item}</span>
              </div>
            ))}
          </div>
          <Link href="/product/start" className="mt-7 inline-flex items-center rounded-xl bg-accent1 px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_36px_rgba(31,111,255,.32)] transition hover:-translate-y-0.5 hover:bg-blue-600">开始生成方案 <span className="ml-2" aria-hidden="true">→</span></Link>
          <p className="mt-3 text-xs leading-5 text-slate-400">无需先提交姓名、公司或手机号；这些信息仅在需要商务协助时填写。</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-7" noValidate>
          <div className="mb-5"><p className="text-sm font-bold text-white">需要商务协助？</p><p className="mt-1 text-xs leading-5 text-slate-400">留下联系方式，我们会协助评估企业采购、部署或合作事宜。</p></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { name: "name", label: "姓名", placeholder: "您的姓名" },
              { name: "company", label: "公司或团队", placeholder: "公司或团队名称" },
              { name: "phone", label: "手机号码", placeholder: "用于联系确认分析方式", type: "tel" },
            ].map((field) => (
              <label key={field.name} className={field.name === "phone" ? "md:col-span-2" : ""}>
                <span className="mb-2 block text-xs font-semibold text-slate-300">{field.label}</span>
                <input
                  type={field.type || "text"}
                  name={field.name}
                  value={formData[field.name as keyof FormData]}
                  onChange={handleChange}
                  placeholder={field.placeholder}
                  className={fieldClass(field.name as keyof FormData)}
                  aria-invalid={Boolean(errors[field.name])}
                />
                {errors[field.name] && <span className="mt-1.5 block text-xs text-rose-300" role="alert">{errors[field.name]}</span>}
              </label>
            ))}

            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold text-slate-300">当前项目情况</span>
              <textarea
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                placeholder="例如：软件定制 / 系统集成 / 数字化升级；目前有哪些资料；希望何时提交方案"
                className={`${fieldClass("description")} resize-y`}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && <span className="mt-1.5 block text-xs text-rose-300" role="alert">{errors.description}</span>}
            </label>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="md:col-span-2 inline-flex items-center justify-center rounded-xl bg-accent1 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(31,111,255,0.32)] transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "正在提交…" : "提交商务联系"}
            </button>
          </div>

          <div className="mt-4 min-h-6 text-center text-xs" aria-live="polite">
            {status === "success" && <span className="text-emerald-300">提交成功。我们会尽快联系您了解采购、部署或合作需求。</span>}
            {status === "error" && <span className="text-rose-300">提交未完成，请检查网络后重试，或发送邮件至 contact@ningyi-ai.com。</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
