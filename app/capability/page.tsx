"use client";
import Header from "../components/Header";
import ProductCapability from "../components/ProductCapability";
import ProductArchitecture from "../components/ProductArchitecture";
import Footer from "../components/Footer";

export default function CapabilityPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              产品能力
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              一套系统，构建企业 AI 员工体系，实现智能化运营闭环
            </p>
          </div>
        </section>

        {/* 产品能力 */}
        <ProductCapability />

        {/* 详细介绍 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                三大核心平台
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                完整的企业 AI 管家技术架构
              </p>
            </div>

            {/* 平台 1 */}
            <div className="mb-16">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="text-5xl mb-4">🤖</div>
                  <h3 className="text-2xl font-bold text-primary mb-4">
                    多 Agent 协同系统
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    多个专业 AI Agent 分工协作，覆盖生产管理的各个环节。每个 Agent 都具备专业领域知识和执行能力，可以独立完成特定任务。
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">数据分析 Agent：负责生产数据整理和分析</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">质量监控 Agent：实时监控质量指标</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">设备管理 Agent：设备状态监测和预测性维护</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">生产调度 Agent：优化生产计划和资源配置</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🔄</div>
                    <h4 className="text-lg font-bold text-primary mb-2">
                      协同工作
                    </h4>
                    <p className="text-gray-600">
                      Agent 之间可以相互协作，共同完成复杂任务
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 平台 2 */}
            <div className="mb-16">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="md:order-2">
                  <div className="text-5xl mb-4">⚡</div>
                  <h3 className="text-2xl font-bold text-primary mb-4">
                    Skill 执行平台
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    提供丰富的技能库，每个 Skill 都是一个可执行的业务功能。Agent 可以调用这些 Skill 来完成具体任务。
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">数据查询 Skill：从各系统获取数据</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">报表生成 Skill：自动生成各类报表</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">异常检测 Skill：识别数据异常</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">预测分析 Skill：趋势预测和预警</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100 md:order-1">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🛠️</div>
                    <h4 className="text-lg font-bold text-primary mb-2">
                      灵活调用
                    </h4>
                    <p className="text-gray-600">
                      按需组合 Skill，快速响应业务需求
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 平台 3 */}
            <div>
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="text-5xl mb-4">📚</div>
                  <h3 className="text-2xl font-bold text-primary mb-4">
                    企业知识库
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    整合企业各类知识资产，包括工艺规范、操作手册、质量标准等，为 AI Agent 提供专业知识支持。
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">工艺知识库：工艺流程和参数规范</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">质量标准库：质量要求和检验标准</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">设备档案库：设备参数和维护记录</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-accent1 mt-1">✓</span>
                      <span className="text-gray-700">案例经验库：历史问题和解决方案</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-8 border border-orange-100">
                  <div className="text-center">
                    <div className="text-6xl mb-4">💡</div>
                    <h4 className="text-lg font-bold text-primary mb-2">
                      知识赋能
                    </h4>
                    <p className="text-gray-600">
                      基于知识库提供专业建议
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 产品架构 */}
        <ProductArchitecture />

        {/* CTA */}
        <section className="py-16 bg-gradient-to-br from-accent1/10 via-white to-accent2/10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold text-primary mb-6">
              构建完整的企业 AI 员工体系
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              了解如何通过多 Agent 协同和 Skill 平台实现企业智能化
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="#hero"
                className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg"
              >
                返回首页
              </a>
              <a
                href="#cta"
                className="px-8 py-3 border-2 border-accent1 text-accent1 rounded-full font-semibold hover:bg-accent1/10 transition-all duration-300"
              >
                预约演示
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
