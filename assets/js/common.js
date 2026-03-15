(function () {
  const CONFIG = window.APP_CONFIG || {};

  function byId(id) { return document.getElementById(id); }
  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function toast(message, duration = 2600) {
    let el = byId('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
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
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  function ensureUserId() {
    const key = CONFIG?.STORAGE_KEYS?.USER_ID || 'platform_user_id_v2';
    let value = storageGet(key, '');
    if (!value) {
      value = uid('u');
      storageSet(key, value);
    }
    return value;
  }

  function getSupabaseConfig() {
    const urlKey = CONFIG?.STORAGE_KEYS?.SUPA_URL || 'supa_url_v2';
    const anonKeyKey = CONFIG?.STORAGE_KEYS?.SUPA_KEY || 'supa_key_v2';
    const localUrl = storageGet(urlKey, '').trim();
    const localAnon = storageGet(anonKeyKey, '').trim();
    const url = localUrl || CONFIG?.SUPABASE?.URL || '';
    const anonKey = localAnon || CONFIG?.SUPABASE?.ANON_KEY || '';
    return { url, anonKey, connected: Boolean(url && anonKey) };
  }

  function saveSupabaseConfig(url, anonKey) {
    const urlKey = CONFIG?.STORAGE_KEYS?.SUPA_URL || 'supa_url_v2';
    const anonKeyKey = CONFIG?.STORAGE_KEYS?.SUPA_KEY || 'supa_key_v2';
    storageSet(urlKey, (url || '').trim());
    storageSet(anonKeyKey, (anonKey || '').trim());
    return true;
  }

  function getPageConfig(pageKey) {
    return CONFIG?.PAGES?.[pageKey] || null;
  }

  function buildHeaders() {
    const { anonKey } = getSupabaseConfig();
    return {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function dbRequest(path, options = {}) {
    const { url, connected } = getSupabaseConfig();
    if (!connected) throw new Error('Supabase غير مهيأ بعد');

    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...buildHeaders(),
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const message = data?.message || data?.error_description || data?.error || `Supabase error (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  async function dbFetch(table, query = 'select=*') {
    return dbRequest(`${table}?${query}`, { method: 'GET' });
  }
  async function dbInsert(table, payload) {
    return dbRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
  }
  async function dbUpdate(table, filterQuery, payload) {
    return dbRequest(`${table}?${filterQuery}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
  }
  async function dbDelete(table, filterQuery) {
    return dbRequest(`${table}?${filterQuery}`, { method: 'DELETE' });
  }

  async function callAI(prompt, type = 'discover') {
    const workerUrl = CONFIG?.WORKER_URL;
    if (!workerUrl) throw new Error('WORKER_URL غير موجود');

    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, type })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'فشل الاتصال بالذكاء الاصطناعي');
    if (data?._text) return data._text;
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.filter(part => typeof part?.text === 'string').map(part => part.text).join('').trim();
  }

  function parseAIJson(raw, mode = 'object') {
    const strategies = mode === 'array'
      ? [
          () => JSON.parse(raw),
          () => JSON.parse((raw.match(/\[[\s\S]*\]/) || [])[0]),
          () => JSON.parse(raw.replace(/```json|```/g, '').trim()),
          () => JSON.parse((raw.replace(/```json|```/g, '').match(/\[[\s\S]*\]/) || [])[0])
        ]
      : [
          () => JSON.parse(raw),
          () => JSON.parse(raw.replace(/```json|```/g, '').trim()),
          () => JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0]),
          () => JSON.parse((raw.replace(/```json|```/g, '').match(/\{[\s\S]*\}/) || [])[0])
        ];
    for (const attempt of strategies) {
      try {
        const result = attempt();
        if (result) return result;
      } catch (_) {}
    }
    return null;
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function wirePage(pageKey) {
    const page = getPageConfig(pageKey);
    const supa = getSupabaseConfig();

    setText('page-site-name', CONFIG.SITE_NAME || 'المنصة');
    setText('page-worker-url', CONFIG.WORKER_URL || '—');
    setText('page-db-table', page?.dbTable || '—');
    setText('page-user-table', page?.userTable || '—');
    setText('page-content-type', page?.contentType || '—');
    setText('page-supa-status', supa.connected ? '✅ متصل' : '⚠️ غير مهيأ بعد');

    const form = byId('supabase-form');
    if (form) {
      const urlInput = byId('supa-url');
      const keyInput = byId('supa-key');
      if (urlInput && supa.url) urlInput.value = supa.url;
      if (keyInput && supa.anonKey) keyInput.value = supa.anonKey;

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSupabaseConfig(urlInput?.value || '', keyInput?.value || '');
        const state = getSupabaseConfig();
        setText('page-supa-status', state.connected ? '✅ تم الحفظ' : '⚠️ ناقص');
        toast(state.connected ? '✅ تم حفظ بيانات Supabase' : '⚠️ أدخل URL و Anon Key معًا');
      });
    }

    const testBtn = byId('test-ai-btn');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        try {
          toast('ℹ️ زر الاختبار جاهز — سنفعّل اختبارات الذكاء الاصطناعي في المرحلة التالية');
        } catch (e) {
          toast('❌ ' + e.message);
        }
      });
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
