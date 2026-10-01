/* ============================================================
   تكامل Microsoft 365 (Outlook Mail / Calendar / OneDrive)
   ============================================================
   يعتمد على MSAL.js (مكتبة مايكروسوفت الرسمية للمصادقة من المتصفح
   مباشرة، بلا خادم وسيط وبلا مفتاح سرّي) — نفس فكرة Firebase تماماً،
   لكن هذه المرة مع حساب Microsoft 365 الحقيقي للمستخدم.

   ما يعمل فعلياً: تسجيل دخول Microsoft حقيقي (SSO)، قراءة/إرسال/بحث
   بريد Outlook الخاص بالمستخدم المسجِّل دخوله هو تحديداً، قراءة
   وإنشاء أحداث تقويمه، وتصفح/رفع ملفات OneDrive الخاصة به.

   ما لا يعمل (ولن يُدَّعى أنه يعمل): أي شيء "خلفي" يحتاج عملاً وهو
   التبويب مغلق (لا Retry Queue حقيقي، لا Delta Sync حقيقي، لا
   Webhooks حقيقية من مايكروسوفت — تلك تحتاج خادماً عاماً يستقبلها).
   كذلك: التزويد التلقائي للمستخدمين (Automatic User Provisioning)
   وتعيين الأدوار من Azure AD مباشرة — هذه تحتاج صلاحيات كتابة على
   دليل الشركة (Directory.Write)، ومنحها لتطبيق يعمل من متصفح بلا
   طبقة تدقيق خادم حقيقية مخاطرة أمنية غير مبرَّرة، فلم تُبنَ عمداً.
   ============================================================ */

const MSGRAPH_CONFIG_KEY = "pms_msgraph_config_v1";
const MSGRAPH_SCOPES = ["User.Read", "Mail.Read", "Mail.Send", "Calendars.ReadWrite", "Files.ReadWrite"];
let msalInstance = null;
let msalAccount = null;

function loadMsGraphConfig() {
  try { return JSON.parse(localStorage.getItem(MSGRAPH_CONFIG_KEY)); } catch (e) { return null; }
}
function saveMsGraphConfig(cfg) { localStorage.setItem(MSGRAPH_CONFIG_KEY, JSON.stringify(cfg)); }
function clearMsGraphConfig() {
  localStorage.removeItem(MSGRAPH_CONFIG_KEY);
  msalInstance = null; msalAccount = null;
  STATE.msGraphStatus = "disconnected";
}

/* ---- الاتصال: تسجيل دخول Microsoft حقيقي عبر نافذة منبثقة (Popup) ---- */
async function connectMsGraph(clientId, tenantId, showAlert = true) {
  try {
    if (typeof msal === "undefined") {
      throw new Error("مكتبة MSAL لم تُحمَّل بعد — تحقق من اتصال الإنترنت وأعد المحاولة.");
    }
    const msalConfig = {
      auth: {
        clientId: clientId.trim(),
        authority: `https://login.microsoftonline.com/${tenantId.trim()}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "localStorage" },
    };
    msalInstance = new msal.PublicClientApplication(msalConfig);
    if (msalInstance.initialize) await msalInstance.initialize(); // مطلوب في MSAL v3+
    const loginResponse = await msalInstance.loginPopup({ scopes: MSGRAPH_SCOPES });
    msalAccount = loginResponse.account;
    saveMsGraphConfig({ clientId: clientId.trim(), tenantId: tenantId.trim() });
    STATE.msGraphStatus = "connected";
    STATE.msGraphUserName = msalAccount.name || msalAccount.username;
    if (showAlert) alert(`تم تسجيل الدخول بحساب Microsoft بنجاح: ${STATE.msGraphUserName}`);
    renderApp();
    return true;
  } catch (err) {
    STATE.msGraphStatus = "error";
    STATE.msGraphError = err && err.message ? err.message : String(err);
    if (showAlert) alert("فشل الاتصال بـ Microsoft 365: " + STATE.msGraphError);
    renderApp();
    return false;
  }
}
function disconnectMsGraph() {
  if (msalInstance && msalAccount) {
    try { msalInstance.logoutPopup({ account: msalAccount }); } catch (e) { /* تجاهل فشل تسجيل الخروج من مايكروسوفت نفسه */ }
  }
  clearMsGraphConfig();
  renderApp();
}
/* محاولة استرجاع جلسة سابقة عند فتح النظام من جديد (بلا نافذة منبثقة جديدة إن أمكن) */
async function tryAutoReconnectMsGraph() {
  const saved = loadMsGraphConfig();
  if (!saved) { STATE.msGraphStatus = "disconnected"; return; }
  for (let attempt = 0; attempt < 5 && typeof msal === "undefined"; attempt++) {
    await new Promise((r) => setTimeout(r, 800));
  }
  if (typeof msal === "undefined") { STATE.msGraphStatus = "disconnected"; return; }
  try {
    const msalConfig = {
      auth: { clientId: saved.clientId, authority: `https://login.microsoftonline.com/${saved.tenantId}`, redirectUri: window.location.origin + window.location.pathname },
      cache: { cacheLocation: "localStorage" },
    };
    msalInstance = new msal.PublicClientApplication(msalConfig);
    if (msalInstance.initialize) await msalInstance.initialize();
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalAccount = accounts[0];
      STATE.msGraphStatus = "connected";
      STATE.msGraphUserName = msalAccount.name || msalAccount.username;
    } else {
      STATE.msGraphStatus = "disconnected";
    }
  } catch (err) {
    STATE.msGraphStatus = "disconnected";
  }
}

/* ---- الحصول على رمز وصول صالح لاستدعاء Graph API ---- */
async function getMsGraphToken() {
  if (!msalInstance || !msalAccount) throw new Error("غير متصل بحساب Microsoft.");
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: MSGRAPH_SCOPES, account: msalAccount });
    return result.accessToken;
  } catch (e) {
    const result = await msalInstance.acquireTokenPopup({ scopes: MSGRAPH_SCOPES, account: msalAccount });
    return result.accessToken;
  }
}
async function graphFetch(path, options = {}) {
  const token = await getMsGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: Object.assign({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, options.headers || {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`خطأ من Microsoft Graph (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---- البريد (Outlook Mail) ---- */
async function fetchOutlookMail(searchQuery) {
  const q = searchQuery ? `&$search="${encodeURIComponent(searchQuery)}"` : "";
  const data = await graphFetch(`/me/messages?$top=25&$select=id,subject,from,receivedDateTime,webLink,bodyPreview${q}`);
  return (data && data.value) || [];
}
async function sendOutlookMail(toAddress, subject, bodyText) {
  await graphFetch("/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: bodyText },
        toRecipients: [{ emailAddress: { address: toAddress } }],
      },
    }),
  });
}

/* ---- التقويم (Outlook Calendar) ---- */
async function fetchOutlookCalendar() {
  const data = await graphFetch("/me/events?$top=25&$select=id,subject,start,end,webLink&$orderby=start/dateTime");
  return (data && data.value) || [];
}
async function createOutlookEvent(subject, startISO, endISO, attendeeEmails) {
  const attendees = (attendeeEmails || []).filter(Boolean).map((email) => ({ emailAddress: { address: email }, type: "required" }));
  return graphFetch("/me/events", {
    method: "POST",
    body: JSON.stringify({
      subject,
      start: { dateTime: startISO, timeZone: "UTC" },
      end: { dateTime: endISO, timeZone: "UTC" },
      attendees,
    }),
  });
}

/* ---- الملفات (OneDrive) ---- */
async function fetchOneDriveFiles() {
  const data = await graphFetch("/me/drive/root/children?$select=id,name,webUrl,size,lastModifiedDateTime,folder");
  return (data && data.value) || [];
}

/* ---- ربط عنصر Microsoft (بريد/حدث/ملف) بسجل داخل النظام — نُخزِّن مرجعاً خفيفاً فقط، لا محتوى كامل ---- */
function linkMsGraphItem(msType, graphItem, linkedCollection, linkedRecordId, linkedLabel) {
  if (STATE.user && !canEdit(STATE.user.role, "msgraph")) { alert("دورك الحالي لا يملك صلاحية ربط عناصر Microsoft 365."); return; }
  STATE.data.msLinkedItems = STATE.data.msLinkedItems || [];
  const row = {
    id: uid(), msType, graphId: graphItem.id,
    title: graphItem.subject || graphItem.name || "—",
    webLink: graphItem.webLink || graphItem.webUrl || "",
    savedAt: Date.now(), savedBy: (STATE.user && STATE.user.name) || "—",
    linkedCollection, linkedRecordId, linkedLabel,
  };
  STATE.data.msLinkedItems.push(row);
  logAudit("create", "msLinkedItems", row.id, `ربط ${msType === "mail" ? "بريد" : msType === "event" ? "حدث تقويم" : "ملف"} "${row.title}" بـ${linkedLabel}`);
  saveData(STATE.data);
  return row;
}
function unlinkMsGraphItem(id) {
  if (STATE.user && !canEdit(STATE.user.role, "msgraph")) { alert("دورك الحالي لا يملك صلاحية إلغاء ربط عناصر Microsoft 365."); return; }
  STATE.data.msLinkedItems = (STATE.data.msLinkedItems || []).filter((r) => r.id !== id);
  logAudit("delete", "msLinkedItems", id, "إلغاء ربط عنصر Microsoft 365");
  saveData(STATE.data);
  renderApp();
}
