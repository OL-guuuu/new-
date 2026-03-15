(function () {
  const CONFIG = window.APP_CONFIG || {};

  function byId(id) {
    return document.getElementById(id);
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function toast(message, duration = 2600) {
    let el = byId("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), duration);
  }

  function storageGet(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  function ensureUserId() {
    const key = CONFIG?.STORAGE_KEYS?.USER_ID || "platform_user_id_v3";
    let value = storageGet(key, "");

    if (!value) {
      value = uid("u");
      storageSet(key, value);
    }

    return value;
  }

  function getSupabaseConfig() {
    const urlKey = CONFIG?.STORAGE_KEYS?.SUPA_URL || "supa_url_v3";
    const anonKeyKey = CONFIG?.STORAGE_KEYS?.SUPA_KEY || "supa_key_v3";

    const localUrl = (storageGet(urlKey, "") || "").trim();
    const localAnon = (storageGet(anonKeyKey, "") || "").trim();

    const url = localUrl || CONFIG?.SUPABASE?.URL || "";
    const anonKey = localAnon || CONFIG?.SUPABASE?.ANON_KEY || "";

    return {
      url,
      anonKey,
      connected: Boolean(url && anonKey)
    };
  }

  function saveSupabaseConfig(url, anonKey) {
    const urlKey = CONFIG?.STORAGE_KEYS?.SUPA_URL || "supa_url_v3";
    const anonKeyKey = CONFIG?.STORAGE_KEYS?.SUPA_KEY || "supa_key_v3";

    storageSet(urlKey, (url || "").trim());
    storageSet(anonKeyKey, (anonKey || "").trim());
    return true;
  }

  function getPageConfig(pageKey) {
    return CONFIG?.PAGES?.[pageKey] || null;
  }

  function getDiscoverOptions(pageKey) {
    const common = CONFIG?.DISCOVER_OPTIONS?.common || {};
    const specific = CONFIG?.DISCOVER_OPTIONS?.[pageKey] || {};
    return { ...common, ...specific };
  }

  function buildHeaders() {
    const { anonKey } = getSupabaseConfig();

    return {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json"
    };
  }

  async function dbRequest(path, options = {}) {
    const { url, connected } = getSupabaseConfig();

    if (!connected) {
      throw new Error("Supabase غير مهيأ بعد");
    }

    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...buildHeaders(),
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error_description ||
        data?.error ||
        `Supabase error (${res.status})`;

      throw new Error(message);
    }

    return data;
  }

  async function dbFetch(table, query = "select=*") {
    return dbRequest(`${table}?${query}`, { method: "GET" });
  }

  async function dbInsert(table, payload) {
    return dbRequest(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
  }

  async function dbUpdate(table, filterQuery, payload) {
    return dbRequest(`${table}?${filterQuery}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
  }

  async function dbDelete(table, filterQuery) {
    return dbRequest(`${table}?${filterQuery}`, {
      method: "DELETE"
    });
  }

  async function callAI(prompt, type = "discover") {
    const workerUrl = CONFIG?.WORKER_URL;
    if (!workerUrl) {
      throw new Error("WORKER_URL غير موجود");
    }

    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, type })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "فشل الاتصال بالذكاء الاصطناعي");
    }

    if (typeof data?._text === "string" && data._text.trim()) {
      return data._text.trim();
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts
      .filter((part) => typeof part?.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
  }

  function stripCodeFences(raw) {
    return String(raw || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function parseAIJson(raw, mode = "object") {
    const cleaned = stripCodeFences(raw);

    const direct = safeJsonParse(cleaned);
    if (direct) return direct;

    if (mode === "array") {
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch?.[0]) {
        const arrParsed = safeJsonParse(arrMatch[0]);
        if (arrParsed) return arrParsed;
      }
    } else {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch?.[0]) {
        const objParsed = safeJsonParse(objMatch[0]);
        if (objParsed) return objParsed;
      }
    }

    return null;
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function pageSchema(pageKey) {
    if (pageKey === "movies") {
      return `[
  {
    "title": "original title only, never translated",
    "kind": "movie",
    "year": "2019",
    "seasons": "فيلم أو 3 مواسم",
    "status": "complete",
    "filter": "sci",
    "desc": "وصف عربي موجز",
    "tags": ["خيال علمي", "غموض"],
    "vibes": "مظلم وفلسفي",
    "bar": 86,
    "poster": "",
    "language": "English"
  }
]`;
    }

    if (pageKey === "books") {
      return `[
  {
    "title": "original title only, never translated",
    "author": "Author name in original form",
    "kind": "novel",
    "year": "1965",
    "pages": "412 صفحة",
    "status": "complete",
    "filter": "sci",
    "desc": "وصف عربي موجز",
    "tags": ["خيال علمي", "سياسة"],
    "vibes": "عميق وملحمي",
    "bar": 90,
    "poster": "",
    "language": "English"
  }
]`;
    }

    return `[
  {
    "title": "original title only, never translated",
    "host": "Host name in original form",
    "kind": "analytical",
    "year": "2021",
    "episodes": "100+ حلقة",
    "status": "ongoing",
    "filter": "sci",
    "desc": "وصف عربي موجز",
    "tags": ["علوم", "تقنية"],
    "vibes": "تحليلي وهادئ",
    "bar": 89,
    "poster": "",
    "platform": "Spotify",
    "language": "English"
  }
]`;
  }

  function classifySchema(pageKey) {
    if (pageKey === "movies") {
      return `{
  "filter": "sci",
  "kind": "movie",
  "tags": ["tag1", "tag2", "tag3"],
  "vibes": "mood in Arabic",
  "bar": 82,
  "desc_ar": "وصف عربي قصير"
}`;
    }

    if (pageKey === "books") {
      return `{
  "filter": "fiction",
  "kind": "novel",
  "tags": ["tag1", "tag2", "tag3"],
  "vibes": "mood in Arabic",
  "bar": 82,
  "desc_ar": "وصف عربي قصير"
}`;
    }

    return `{
  "filter": "sci",
  "kind": "analytical",
  "tags": ["tag1", "tag2", "tag3"],
  "vibes": "mood in Arabic",
  "bar": 82,
  "desc_ar": "وصف عربي قصير"
}`;
  }

  function allowedFilters(pageKey) {
    const page = getPageConfig(pageKey);
    return Object.keys(page?.filters || {}).filter((key) => key !== "all");
  }

  function allowedKinds(pageKey) {
    const page = getPageConfig(pageKey);
    return Object.keys(page?.subtypes || {}).filter((key) => key !== "all");
  }

  function toPromptLines(preferences) {
    return Object.entries(preferences || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
  }

  function buildDiscoverPrompt(pageKey, preferences = {}) {
    const page = getPageConfig(pageKey);
    const filters = allowedFilters(pageKey).join(", ");
    const kinds = allowedKinds(pageKey).join(", ");
    const prefLines = toPromptLines(preferences);

    const subject =
      pageKey === "movies"
        ? "movies and series"
        : pageKey === "books"
        ? "books and novels"
        : "podcasts";

    return `You are an expert recommender for ${subject}.

IMPORTANT RULES:
1) Return ONLY valid JSON array.
2) Keep the title exactly in its original language and original script.
3) NEVER translate the title.
4) If the original title is English, keep it English.
5) If the original title is Arabic, keep it Arabic.
6) Translate only description, vibes, tags, and explanatory fields into Arabic.
7) Prefer real, well-known or plausible recommendations matching the request.
8) Do not wrap the JSON in markdown fences.

Page key: ${pageKey}
Content type: ${page?.contentType || subject}

Allowed filter values:
${filters}

Allowed kind values:
${kinds || "not required"}

User preferences:
${prefLines || "- no extra preferences"}

Return exactly 6 items in this JSON shape:
${pageSchema(pageKey)}`;
  }

  function buildClassifyPrompt(pageKey, payload = {}) {
    const filters = allowedFilters(pageKey).join(", ");
    const kinds = allowedKinds(pageKey).join(", ");

    return `You are an expert classifier for ${pageKey} content.

IMPORTANT RULES:
1) Return ONLY valid JSON object.
2) Keep original title untouched if present.
3) Do not translate title, author, or host names.
4) Write desc_ar, tags, and vibes in Arabic.
5) Do not wrap the JSON in markdown fences.

Allowed filter values:
${filters}

Allowed kind values:
${kinds || "not required"}

Input data:
${toPromptLines(payload)}

Return exactly this JSON shape:
${classifySchema(pageKey)}`;
  }

  function groupItemsBySection(items, pageKey, options = {}) {
    const page = getPageConfig(pageKey);
    const filters = page?.filters || {};
    const subtypeMap = page?.subtypes || {};
    const subtypeKey = options.subtypeKey || "kind";
    const activeSubtype = options.activeSubtype || "all";

    const normalizedItems = Array.isArray(items) ? items : [];
    const result = [];

    const subtypeEntries =
      activeSubtype && activeSubtype !== "all"
        ? [[activeSubtype, subtypeMap[activeSubtype] || activeSubtype]]
        : Object.entries(subtypeMap).filter(([key]) => key !== "all");

    if (!subtypeEntries.length) {
      const groupedByFilter = {};
      normalizedItems.forEach((item) => {
        const key = item?.filter || "all";
        if (!groupedByFilter[key]) groupedByFilter[key] = [];
        groupedByFilter[key].push(item);
      });

      Object.entries(filters)
        .filter(([key]) => key !== "all")
        .forEach(([filterKey, label]) => {
          const entries = groupedByFilter[filterKey] || [];
          if (entries.length) {
            result.push({
              sectionKey: filterKey,
              sectionTitle: label,
              items: entries
            });
          }
        });

      return result;
    }

    subtypeEntries.forEach(([subtype, subtypeLabel]) => {
      const itemsInSubtype = normalizedItems.filter((item) => {
        if (subtype === "all") return true;
        return (item?.[subtypeKey] || "all") === subtype;
      });

      if (!itemsInSubtype.length) return;

      const groupedByFilter = {};
      itemsInSubtype.forEach((item) => {
        const key = item?.filter || "all";
        if (!groupedByFilter[key]) groupedByFilter[key] = [];
        groupedByFilter[key].push(item);
      });

      Object.entries(filters)
        .filter(([key]) => key !== "all")
        .forEach(([filterKey, label]) => {
          const entries = groupedByFilter[filterKey] || [];
          if (entries.length) {
            result.push({
              subtype,
              subtypeLabel,
              sectionKey: `${subtype}_${filterKey}`,
              sectionTitle: `${subtypeLabel} — ${label}`,
              items: entries
            });
          }
        });
    });

    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildRatingTableHTML(items, pageKey) {
    const page = getPageConfig(pageKey);
    const rows = Array.isArray(items) ? items : [];

    let columns = "";

    if (pageKey === "movies") {
      columns = `
        <tr>
          <th>#</th>
          <th>العنوان</th>
          <th>النوع</th>
          <th>السنة</th>
          <th>التصنيف</th>
          <th>التقييم</th>
        </tr>
      `;
    } else if (pageKey === "books") {
      columns = `
        <tr>
          <th>#</th>
          <th>العنوان</th>
          <th>النوع</th>
          <th>المؤلف</th>
          <th>التصنيف</th>
          <th>التقييم</th>
        </tr>
      `;
    } else {
      columns = `
        <tr>
          <th>#</th>
          <th>العنوان</th>
          <th>النوع</th>
          <th>المضيف</th>
          <th>التصنيف</th>
          <th>التقييم</th>
        </tr>
      `;
    }

    const body = rows
      .map((item, index) => {
        const filterLabel = page?.filters?.[item?.filter] || item?.filter || "—";
        const kindLabel =
          page?.subtypes?.[item?.kind] ||
          item?.kind ||
          "—";

        if (pageKey === "movies") {
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item?.title || "—")}</td>
              <td>${escapeHtml(kindLabel)}</td>
              <td>${escapeHtml(item?.year || "—")}</td>
              <td>${escapeHtml(filterLabel)}</td>
              <td>${escapeHtml(item?.bar || 0)}%</td>
            </tr>
          `;
        }

        if (pageKey === "books") {
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item?.title || "—")}</td>
              <td>${escapeHtml(kindLabel)}</td>
              <td>${escapeHtml(item?.author || "—")}</td>
              <td>${escapeHtml(filterLabel)}</td>
              <td>${escapeHtml(item?.bar || 0)}%</td>
            </tr>
          `;
        }

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item?.title || "—")}</td>
            <td>${escapeHtml(kindLabel)}</td>
            <td>${escapeHtml(item?.host || "—")}</td>
            <td>${escapeHtml(filterLabel)}</td>
            <td>${escapeHtml(item?.bar || 0)}%</td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="panel rating-table-panel" style="padding:20px;">
        <div class="section-head" style="margin-bottom:14px;">
          <h2 style="font-size:1.15rem;">${escapeHtml(page?.ratingTableTitle || "جدول التقييم")}</h2>
          <p>ملخص سريع للعناصر الظاهرة مرتبة في جدول تقييم واضح.</p>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>${columns}</thead>
            <tbody>
              ${
                body ||
                `<tr><td colspan="6" class="muted">لا توجد عناصر لعرضها.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wirePage(pageKey) {
    const page = getPageConfig(pageKey);
    const supa = getSupabaseConfig();

    setText("page-site-name", CONFIG.SITE_NAME || "المنصة");
    setText("page-worker-url", CONFIG.WORKER_URL || "—");
    setText("page-db-table", page?.dbTable || "—");
    setText("page-user-table", page?.userTable || "—");
    setText("page-content-type", page?.contentType || "—");
    setText("page-supa-status", supa.connected ? "✅ متصل" : "⚠️ غير مهيأ بعد");

    const form = byId("supabase-form");
    if (form && !form.dataset.boundCommon) {
      const urlInput = byId("supa-url");
      const keyInput = byId("supa-key");

      if (urlInput && supa.url) urlInput.value = supa.url;
      if (keyInput && supa.anonKey) keyInput.value = supa.anonKey;

      form.addEventListener("submit", (e) => {
        e.preventDefault();

        saveSupabaseConfig(urlInput?.value || "", keyInput?.value || "");
        const state = getSupabaseConfig();

        setText("page-supa-status", state.connected ? "✅ تم الحفظ" : "⚠️ ناقص");
        toast(
          state.connected
            ? "✅ تم حفظ بيانات Supabase"
            : "⚠️ أدخل URL و Anon Key معًا"
        );
      });

      form.dataset.boundCommon = "1";
    }
  }

  window.AppCommon = {
    byId,
    qs,
    qsa,
    toast,
    storageGet,
    storageSet,
    storageRemove,
    uid,
    ensureUserId,
    getSupabaseConfig,
    saveSupabaseConfig,
    getPageConfig,
    getDiscoverOptions,
    buildDiscoverPrompt,
    buildClassifyPrompt,
    groupItemsBySection,
    buildRatingTableHTML,
    dbFetch,
    dbInsert,
    dbUpdate,
    dbDelete,
    callAI,
    parseAIJson,
    setText,
    wirePage
  };
})();
