"use client"
import { FC, FormEvent, useState } from "react";

const ContactCTA: FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    need: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validatePhone = (phone: string) => {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '姓名不能为空';
    }

    if (!formData.company.trim()) {
      newErrors.company = '公司名称不能为空';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = '电话号码不能为空';
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = '请输入有效的 11 位手机号码';
    }

    if (!formData.need.trim()) {
      newErrors.need = '需求描述不能为空';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // 清除错误信息
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // 模拟 API 调用
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log("Form submitted:", formData);
      setSubmitStatus('success');
      
      // 清空表单
      setFormData({ name: '', company: '', phone: '', need: '' });
      
      // 3 秒后重置状态
      setTimeout(() => {
        setSubmitStatus('idle');
      }, 3000);
    } catch (error) {
      console.error("Submit error:", error);
      setSubmitStatus('error');
      
      setTimeout(() => {
        setSubmitStatus('idle');
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="cta" aria-label="联系表单" className="py-8 bg-primary text-white flex flex-col items-center">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">获取您的专属 AI 管家方案</h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          我们将根据您的企业规模与业务需求，为您定制 AI 员工体系
        </p>
      </div>
        
      <div className="max-w-3xl w-full mb-8">
        <form 
          onSubmit={handleSubmit} 
          aria-label="预约演示表单"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* 姓名 */}
          <div>
            <input 
              type="text" 
              name="name" 
              placeholder="姓名 *"
              aria-label="您的姓名"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              value={formData.name}
              onChange={handleChange}
              required 
              className={`w-full p-3 rounded-lg bg-white/10 border ${
                errors.name ? 'border-red-500' : 'border-white/20'
              } text-white placeholder-gray-400 focus:outline-none focus:border-accent1 transition-colors`}
            />
            {errors.name && (
              <p id="name-error" className="text-red-400 text-xs mt-1 ml-1" role="alert">{errors.name}</p>
            )}
          </div>
  
          {/* 公司 */}
          <div>
            <input 
              type="text" 
              name="company" 
              placeholder="公司名称 *"
              aria-label="公司名称"
              aria-required="true"
              aria-invalid={!!errors.company}
              aria-describedby={errors.company ? 'company-error' : undefined}
              value={formData.company}
              onChange={handleChange}
              required 
              className={`w-full p-3 rounded-lg bg-white/10 border ${
                errors.company ? 'border-red-500' : 'border-white/20'
              } text-white placeholder-gray-400 focus:outline-none focus:border-accent1 transition-colors`}
            />
            {errors.company && (
              <p id="company-error" className="text-red-400 text-xs mt-1 ml-1" role="alert">{errors.company}</p>
            )}
          </div>
          
          {/* 电话 */}
          <div>
            <input 
              type="tel" 
              name="phone" 
              placeholder="手机号码 *"
              aria-label="手机号码"
              aria-required="true"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              value={formData.phone}
              onChange={handleChange}
              required 
              className={`w-full p-3 rounded-lg bg-white/10 border ${
                errors.phone ? 'border-red-500' : 'border-white/20'
              } text-white placeholder-gray-400 focus:outline-none focus:border-accent1 transition-colors`}
            />
            {errors.phone && (
              <p id="phone-error" className="text-red-400 text-xs mt-1 ml-1" role="alert">{errors.phone}</p>
            )}
          </div>
          
          {/* 需求 */}
          <div>
            <input 
              type="text" 
              name="need" 
              placeholder="需求描述 *"
              aria-label="需求描述"
              aria-required="true"
              aria-invalid={!!errors.need}
              aria-describedby={errors.need ? 'need-error' : undefined}
              value={formData.need}
              onChange={handleChange}
              required 
              className={`w-full p-3 rounded-lg bg-white/10 border ${
                errors.need ? 'border-red-500' : 'border-white/20'
              } text-white placeholder-gray-400 focus:outline-none focus:border-accent1 transition-colors`}
            />
            {errors.need && (
              <p id="need-error" className="text-red-400 text-xs mt-1 ml-1" role="alert">{errors.need}</p>
            )}
          </div>
  
          {/* 提交按钮 */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="col-span-2 bg-accent1 hover:bg-accent1/90 text-white py-3 rounded-full font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                提交中...
              </>
            ) : (
              '提交申请'
            )}
          </button>
        </form>
  
        {/* 提交结果提示 */}
        {submitStatus === 'success' && (
          <div className="mt-4 p-4 bg-green-500/20 border border-green-500 rounded-lg text-center animate-pulse">
            <p className="text-green-300 font-semibold">✅ 提交成功！我们会尽快与您联系</p>
          </div>
        )}
  
        {submitStatus === 'error' && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-center animate-pulse">
            <p className="text-red-300 font-semibold">❌ 提交失败，请稍后重试</p>
          </div>
        )}
      </div>
        
      <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
        <a href="#demo" className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg text-center">立即体验 AI 管家</a>
        <a href="#solution" className="px-8 py-3 border border-accent1 text-accent1 rounded-full font-semibold hover:bg-accent1/10 transition-all duration-300 text-center">预约演示</a>
      </div>
    </section>
  );
};

export default ContactCTA;