/* ============================================================
   منصة الذكاء الاصطناعي (AI Provider Abstraction) — نُقلَت هذه
   الكتلة كاملة (بلا أي تغيير منطقي) من app-views.js إلى هذا الملف
   المخصَّص، ضمن Architecture Refactor. كل نقاط الاستدعاء (كلّها
   داخل app-views.js نفسه — مُتحقَّق منها بحثاً مباشراً في الكود قبل
   النقل) تعمل تماماً كما كانت، لأن كل الدوال تبقى على النطاق العام
   (global scope) بعد التحميل.

   *لم يُضَف مفتاح API جديد. لم يُرسَل أي مفتاح لأي جهة جديدة.*

   ============================================================
   1) طبقة تجريد المزوِّد (AIProviderRegistry) — الواجهة لا تعتمد على
      مزوِّد واحد. Anthropic هو المزوِّد الحقيقي العامل الوحيد اليوم؛
      OpenAI/Azure/Gemini/نموذج محلي مُسجَّلون بنفس العقد لإثبات قابلية
      التبديل الفعلية، لكن بصدق كامل: يُرجِعون سبب عدم التوفّر لا
      إجابة وهمية — لا خادم وسيط آمن لمفاتيحهم مبني هنا بعد.

   حقيقة أمنية صريحة (غير مُغيَّرة بهذا النقل، موجودة أصلاً): مفتاح
   Anthropic API يُقرَأ من localStorage ويُستخدَم مباشرة من المتصفح
   (headers: "anthropic-dangerous-direct-browser-access") — هذا غير
   آمن لبيئة إنتاج حقيقية متعددة المستخدمين، ويحتاج Backend Proxy
   حقيقياً قبل أي إطلاق تجاري. لا أدّعي هنا أن هذا "Production Secure"
   لأنه ليس كذلك حالياً.
   ============================================================ */
const AIProviders = {};
function registerAIProvider(name, provider) {
  if (typeof provider.chat !== "function") throw new Error(`مزوِّد الذكاء الاصطناعي "${name}" يجب أن يوفّر دالة chat(systemPrompt, userMessage) ليلتزم بالعقد.`);
  AIProviders[name] = provider;
}
function getAIProvider(name) { return AIProviders[name] || null; }
function listAIProviders() { return Object.entries(AIProviders).map(([key, p]) => ({ key, displayName: p.displayName, available: p.staticallyAvailable !== false })); }
function getActiveAIProvider() { return getAIProvider(STATE.aiProviderPreference || "anthropic") || AIProviders.anthropic; }

registerAIProvider("anthropic", {
  displayName: "Anthropic Claude (يعمل فعلياً الآن)",
  staticallyAvailable: true,
  supportsTools: true,
  async chat(systemPrompt, userMessage) {
    const key = localStorage.getItem("pms_ai_key") || "";
    if (!key) return { available: false, reason: "لم يتم إدخال مفتاح Anthropic API — أدخله من صفحة «المساعد الذكي» (اختياري، مفتاح واحد يُشغِّل كل ميزات الذكاء الاصطناعي في النظام)." };
    try {
      const json = await callAnthropicAPI(key, { model: "claude-sonnet-4-6", max_tokens: 800, system: systemPrompt, messages: [{ role: "user", content: userMessage }] });
      if (json.error) return { available: false, reason: "خطأ: " + json.error.message };
      const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      return { available: true, text, usage: json.usage || null };
    } catch (e) {
      return { available: false, reason: "تعذّر الاتصال (قيود CORS محتملة من متصفح مباشرة): " + e.message };
    }
  },
  /** استدعاء خام مع دعم الأدوات (tools) — يُستخدَم من AIGateway فقط، يُعيد استجابة API الخام كاملة (بما فيها usage وstop_reason) */
  async rawCallWithTools(systemPrompt, messages, tools) {
    const key = localStorage.getItem("pms_ai_key") || "";
    if (!key) return { error: { message: "لم يتم إدخال مفتاح Anthropic API." } };
    return callAnthropicAPI(key, { model: "claude-sonnet-4-6", max_tokens: 1500, system: systemPrompt, tools, messages });
  },
});

/* مزوِّدون مُسجَّلون بنفس العقد لإثبات قابلية التبديل — غير عاملين
   فعلياً بصدق كامل، كل منهم يحتاج خادماً وسيطاً حقيقياً لحماية مفتاحه
   (استدعاء مباشر من متصفح يُسرِّب المفتاح للجميع، غير آمن إطلاقاً). */
["openai", "azure-openai", "gemini", "local-llm"].forEach((name) => {
  const labels = { "openai": "OpenAI GPT (يحتاج خادماً وسيطاً)", "azure-openai": "Azure OpenAI (يحتاج خادماً وسيطاً)", "gemini": "Google Gemini (يحتاج خادماً وسيطاً)", "local-llm": "نموذج محلي (يحتاج خدمة استدلال محلية)" };
  registerAIProvider(name, {
    displayName: labels[name], staticallyAvailable: false, supportsTools: false,
    async chat() { return { available: false, reason: `مزوِّد "${labels[name]}" مُسجَّل ضمن البنية (يثبت قابلية التبديل الفعلية دون تغيير الواجهة)، لكن غير مُفعَّل — يحتاج خادماً وسيطاً حقيقياً لحماية مفتاح API (لا يمكن استدعاؤه بأمان مباشرة من متصفح).` }; },
  });
});

/* ============================================================
   2) مزوِّدو السياق (AI Context Providers) — كل وحدة تُسجِّل كيف تبني
      سياقها الخاص، فلوحة الذكاء الاصطناعي نفسها عامة تماماً ولا
      تعرف شيئاً عن أي وحدة تحديداً — صفر تكرار منطق بين الصفحات.
   ============================================================ */
const AIContextProviders = {};
function registerAIContextProvider(moduleKey, getContextFn) { AIContextProviders[moduleKey] = getContextFn; }
function getAIContextFor(moduleKey, ...args) { return AIContextProviders[moduleKey] ? AIContextProviders[moduleKey](...args) : ""; }

/* ============================================================
   3) باني الأوامر المشترَك (Prompt Builder) — نقطة واحدة تُنشئ
      التعليمة النظامية، بدل تكرارها نصاً في كل مكان.
   ============================================================ */
function buildContextualSystemPrompt(contextText) {
  return `أنت مساعد ذكي مدمَج داخل صفحة محدَّدة في نظام إدارة مشاريع. لديك بيانات هذه الصفحة فقط أدناه (مُصفّاة مسبقاً بنفس صلاحيات المستخدم التي يراها في الواجهة — لا بيانات إضافية) — أجب مباشرة ومختصراً بالعربية بناءً عليها حصراً، ولا تخترع معلومات غير موجودة فيها:\n${contextText}`;
}

/* ============================================================
   AIProvider Application-facing wrapper — الواجهة المطلوبة صراحةً:
   Application → AIProvider → AnthropicProvider (اليوم، محلياً)
   مستقبلاً: Application → AIProvider → Backend Proxy → Anthropic API
   بدون أي تغيير في نقاط الاستدعاء التي تستخدم AIProvider.* أدناه.
   ============================================================ */
const AIProvider = {
  /** المزوِّد النشط حالياً (تفويض مباشر لـ getActiveAIProvider) */
  getActive() { return getActiveAIProvider(); },
  /** كل المزوِّدين المُسجَّلين وحالة توفّر كل منهم فعلياً */
  listAvailable() { return listAIProviders(); },
  /** محادثة عبر المزوِّد النشط حالياً — يُرجِع { available, text } أو { available: false, reason } بصدق كامل */
  async chat(systemPrompt, userMessage) {
    const provider = this.getActive();
    if (!provider) return { available: false, reason: "لا يوجد مزوِّد ذكاء اصطناعي نشط." };
    return provider.chat(systemPrompt, userMessage);
  },
};
