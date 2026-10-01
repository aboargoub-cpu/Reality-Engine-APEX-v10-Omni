/* ============================================================
   AI Gateway — حدّ معماري حقيقي بين منطق الأعمال ومزوِّدي الذكاء
   الاصطناعي
   ============================================================
   لا يُعيد هذا الملف بناء أي شيء من الصفر — يُنظِّم ويُغلِّف بنية
   موجودة فعلاً ومُختبَرة مسبقاً هذه الجلسة:
     - AIProviders/registerAIProvider/AIProvider (app-ai-provider.js)
     - PMS_AI_TOOLS + executePMSTool (app-views.js) — 12 أداة حقيقية،
       كل واحدة مُتحقَّق منها فعلياً أنها تفحص isProjectInUserScope
       بشكل صحيح لكل مشروع تصل إليه.
     - AIContextProviders (app-ai-provider.js)

   Application
     ↓
   AIGateway  ← أنت هنا (حدّ جديد)
     ↓
   AIProvider (تجريد المزوِّد: Anthropic اليوم، OpenAI/Google/محلي/
               مؤسسي لاحقاً — بلا أي تغيير في هذا الملف عند الإضافة)
     ↓
   المزوِّد الفعلي (مباشرة من المتصفح اليوم؛ Backend Proxy مستقبلاً)

   *لا وظائف ذكاء اصطناعي مزيَّفة هنا* — أي مزوِّد لا يعمل فعلياً
   (openai/azure-openai/gemini/local-llm) يُرجِع صراحةً
   { available: false, reason: "..." }، لا إجابة وهمية أبداً.
   ============================================================ */

/* ============================================================
   1) الصلاحيات (Permissions) — فحص حقيقي قبل أي استدعاء إطلاقاً،
      بتفويض مباشر لـAuthorizationService (لا نسخ لمنطق الصلاحيات).
   ============================================================ */
function aiGatewayCheckPermission() {
  if (!STATE.user) return { allowed: false, reason: "لا يوجد مستخدم مسجَّل دخوله حالياً." };
  if (!AuthorizationService.canView(STATE.user.role, "ai")) {
    return { allowed: false, reason: `دور "${STATE.user.role}" لا يملك صلاحية استخدام المساعد الذكي.` };
  }
  return { allowed: true };
}

/* ============================================================
   2) استخدام الرموز (Token Usage) — تتبّع حقيقي من استجابة API
      الفعلية، لا تقدير. مُجمَّع بحسب المستخدم لمراجعة الاستهلاك.
   ============================================================ */
function recordAITokenUsage(usage, userId) {
  if (!usage) return;
  STATE.data.aiTokenUsageLog = STATE.data.aiTokenUsageLog || [];
  STATE.data.aiTokenUsageLog.push({
    id: uid(), userId, timestamp: Date.now(),
    inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0,
  });
  saveData(STATE.data);
}
function getAITokenUsageSummary(userId) {
  const log = (STATE.data.aiTokenUsageLog || []).filter((e) => !userId || e.userId === userId);
  return {
    totalCalls: log.length,
    totalInputTokens: log.reduce((s, e) => s + e.inputTokens, 0),
    totalOutputTokens: log.reduce((s, e) => s + e.outputTokens, 0),
  };
}

/* ============================================================
   3) سجل التدقيق (Audit) — على مستوى المحادثة الكاملة (سؤال المستخدم
      + الرد النهائي + أي أدوات استُخدِمت)، وليس فقط كل استدعاء أداة
      منفرد (ذلك موجود أصلاً في executePMSTool ولم يُغيَّر). هذا سجل
      إضافي مكمِّل، لا مكرِّر.
   ============================================================ */
function auditAIGatewayCall({ userId, providerId, userMessagePreview, toolsUsed, tokenUsage, success }) {
  logAudit("view", "aiGatewayCall", uid(),
    `محادثة ذكاء اصطناعي عبر ${providerId} — سؤال: "${(userMessagePreview || "").slice(0, 80)}" — أدوات مُستخدَمة: [${(toolsUsed || []).join(", ") || "بلا"}] — رموز: ${tokenUsage ? `${tokenUsage.input_tokens || 0}↓/${tokenUsage.output_tokens || 0}↑` : "غير معروفة"} — ${success ? "نجحت" : "فشلت"}`);
}

/* ============================================================
   4) البوابة نفسها — تُنظِّم Prompt/Context/Tools/Response/Citations
      معاً في نقطة استدعاء واحدة موحَّدة، مع فحص نطاق دفاعي مضاعَف
      (Defense in Depth) على كل استدعاء أداة، حتى أن الأدوات نفسها
      تفحص هذا مسبقاً — لا اعتماد أعمى على طبقة واحدة فقط.
   ============================================================ */
const AIGateway = {
  /**
   * محادثة كاملة مع دعم الأدوات (Tool Use) — الاستخدام الأساسي للمساعد الذكي التفاعلي.
   * @returns {Promise<{success, text, citations, toolCallsExecuted, tokenUsage, reason?}>}
   */
  async converse({ userMessage, systemPrompt, tools, maxTurns }) {
    const permCheck = aiGatewayCheckPermission();
    if (!permCheck.allowed) {
      auditAIGatewayCall({ userId: STATE.user ? STATE.user.id : null, providerId: "none", userMessagePreview: userMessage, success: false });
      return { success: false, reason: permCheck.reason, text: null, citations: [], toolCallsExecuted: [], tokenUsage: null };
    }
    const provider = AIProvider.getActive();
    if (!provider) {
      return { success: false, reason: "لا يوجد مزوِّد ذكاء اصطناعي نشط.", text: null, citations: [], toolCallsExecuted: [], tokenUsage: null };
    }
    if (tools && tools.length && !provider.supportsTools) {
      return { success: false, reason: `المزوِّد النشط حالياً ("${provider.displayName}") لا يدعم استخدام الأدوات فعلياً بعد — لا إجابة وهمية بدونها.`, text: null, citations: [], toolCallsExecuted: [], tokenUsage: null };
    }
    if (!tools || !tools.length) {
      // محادثة بسيطة بلا أدوات — تفويض مباشر لواجهة AIProvider.chat العادية
      const result = await AIProvider.chat(systemPrompt, userMessage);
      recordAITokenUsage(result.usage, STATE.user.id);
      auditAIGatewayCall({ userId: STATE.user.id, providerId: STATE.aiProviderPreference || "anthropic", userMessagePreview: userMessage, tokenUsage: result.usage, success: result.available });
      return { success: result.available, reason: result.reason, text: result.text || null, citations: [], toolCallsExecuted: [], tokenUsage: result.usage || null };
    }
    // محادثة بأدوات — حلقة استدعاء حقيقية، بفحص نطاق دفاعي إضافي قبل تنفيذ أي أداة
    let messages = [{ role: "user", content: userMessage }];
    const toolCallsExecuted = [];
    let aggregatedUsage = { input_tokens: 0, output_tokens: 0 };
    let finalText = null;
    for (let turn = 0; turn < (maxTurns || 5); turn++) {
      const json = await provider.rawCallWithTools(systemPrompt, messages, tools);
      if (json.error) {
        auditAIGatewayCall({ userId: STATE.user.id, providerId: STATE.aiProviderPreference || "anthropic", userMessagePreview: userMessage, toolsUsed: toolCallsExecuted, success: false });
        return { success: false, reason: "خطأ: " + json.error.message, text: null, citations: toolCallsExecuted, toolCallsExecuted, tokenUsage: aggregatedUsage };
      }
      if (json.usage) { aggregatedUsage.input_tokens += json.usage.input_tokens || 0; aggregatedUsage.output_tokens += json.usage.output_tokens || 0; }
      messages.push({ role: "assistant", content: json.content });
      if (json.stop_reason === "tool_use") {
        const toolResults = [];
        for (const block of json.content) {
          if (block.type !== "tool_use") continue;
          // فحص دفاعي إضافي هنا: إن كان مُدخَل الأداة يحمل projectId، تحقّق من النطاق مرة أخرى صراحةً على مستوى البوابة
          // نفسها، لا اعتماداً حصرياً على أن الأداة الداخلية ستفحصه بنفسها (طبقتا حماية، لا طبقة واحدة فقط)
          if (block.input && block.input.projectId && !isProjectInUserScope(block.input.projectId)) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ error: "رفضت البوابة (AIGateway) هذا الاستدعاء — المشروع خارج نطاق صلاحيات المستخدم الحالي." }) });
            continue;
          }
          const result = executePMSTool(block.name, block.input || {});
          toolCallsExecuted.push(block.name);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }
      finalText = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      break;
    }
    recordAITokenUsage(aggregatedUsage, STATE.user.id);
    auditAIGatewayCall({ userId: STATE.user.id, providerId: STATE.aiProviderPreference || "anthropic", userMessagePreview: userMessage, toolsUsed: toolCallsExecuted, tokenUsage: aggregatedUsage, success: finalText !== null });
    return {
      success: finalText !== null, text: finalText,
      // Citations صادقة: قائمة الأدوات الحقيقية التي استُخدِمت فعلياً لبناء هذا الرد — لا استنتاج مصادر مزيَّف
      citations: toolCallsExecuted.map((name) => ({ type: "tool", name })),
      toolCallsExecuted, tokenUsage: aggregatedUsage,
    };
  },
};
