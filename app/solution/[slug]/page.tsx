"use client";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import CaseStudies from "../../components/CaseStudies";
import RichTextRenderer from "../../components/RichTextRenderer";

interface SolutionDetail {
  id: number;
  icon: string;
  title: string;
  slug: string;
  description: string;
  heroImage: string;
  painPoints: string;
  solutionDetail: string;
  advantage: string;
  features: string[];
}

export default function SolutionDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSolutionDetail();
  }, [slug]);

  const fetchSolutionDetail = async () => {
    try {
      const res = await fetch(`/api/content/solutions/${slug}`);
      const data = await res.json();
      if (data.success) {
        setSolution(data.data);
      } else {
        notFound();
      }
    } catch (error) {
      console.error("获取解决方案详情失败:", error);
      notFound();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-accent1 mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!solution) {
    return notFound();
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section 
          className="relative py-20 overflow-hidden"
          style={{
            backgroundImage: solution.heroImage ? `url(${solution.heroImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!solution.heroImage && (
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-accent1/20"></div>
          )}
          {solution.heroImage && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-primary/70"></div>
          )}
          
          <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 text-center">
            <div className="text-6xl mb-6">{solution.icon}</div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              {solution.title}
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              {solution.description}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {solution.features.map((feature, index) => (
                <span
                  key={index}
                  className="px-4 py-2 bg-white/10 text-white rounded-full text-sm backdrop-blur-sm"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 核心痛点 */}
        {solution.painPoints && (
          <section className="py-8 bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                <div className="px-8 py-4 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-primary">
                      行业挑战与痛点
                    </h2>
                  </div>
                </div>
                <div className="p-4 md:p-6 pt-6">
                  <RichTextRenderer content={solution.painPoints} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 解决方案 */}
        {solution.solutionDetail && (
          <section className="py-8 bg-white">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                <div className="px-8 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-primary">
                      我们的解决方案
                    </h2>
                  </div>
                </div>
                <div className="p-4 md:p-6 pt-6">
                  <RichTextRenderer content={solution.solutionDetail} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 方案优势 */}
        {solution.advantage && (
          <section className="py-8 bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                <div className="px-8 py-4 border-b border-gray-100 bg-gradient-to-r from-accent1/5 to-white">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-accent1/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-primary">
                      核心优势与价值
                    </h2>
                  </div>
                </div>
                <div className="p-4 md:p-6 pt-6">
                  <RichTextRenderer content={solution.advantage} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 客户案例 */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <CaseStudies industryFilter={solution.title} />
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-gradient-to-br from-accent1/10 via-white to-accent2/10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold text-primary mb-6">
              为您的企业定制专属 AI 管家
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              了解 AI 管家如何为您的企业创造价值
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/"
                className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg"
              >
                返回首页
              </Link>
              <Link
                href="/cta"
                className="px-8 py-3 border-2 border-accent1 text-accent1 rounded-full font-semibold hover:bg-accent1/10 transition-all duration-300"
              >
                预约演示
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
