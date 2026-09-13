// Runs in the page's MAIN world on neetcode.io (see manifest "world": "MAIN").
//
// Observes NeetCode's own API traffic so we never have to scrape the editor:
//   * POST /api/executeCodeFunctionHttp -> a code submission. The request body carries
//     {data: {problemId, rawCode, lang}}, the response carries {data: {status: {description}}}.
//     When the verdict is "Accepted" the code is handed to the content script.
//   * any /api/* call -> we remember the request headers (Firebase bearer token etc.) so the
//     bulk sync can call NeetCode's API on the user's behalf.
//
// NeetCode's Angular HttpClient goes through XMLHttpRequest today; fetch is hooked as well in
// case that changes. Nothing here talks to LeetCode - this file only observes. Communication
// with the isolated-world content script goes through window.postMessage with a __n2l marker.
(() => {
  if (window.__n2lHooked) return;
  window.__n2lHooked = true;

  const SUBMIT_PATH = '/api/executeCodeFunctionHttp';

  const post = (msg) => {
    try { window.postMessage({ __n2l: true, ...msg }, window.location.origin); } catch { /* ignore */ }
  };

  const hasAuth = (headers) => headers && Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');

  const headersToObject = (h) => {
    if (!h) return null;
    try {
      if (h instanceof Headers) return Object.fromEntries(h.entries());
      if (Array.isArray(h)) return Object.fromEntries(h);
      if (typeof h === 'object') return { ...h };
    } catch { /* ignore */ }
    return null;
  };

  const parseSubmission = (body) => {
    if (typeof body !== 'string') return null;
    try {
      const parsed = JSON.parse(body);
      const d = parsed && (parsed.data || parsed);
      if (d && d.problemId && typeof d.rawCode === 'string') {
        return { problemId: d.problemId, lang: d.lang, code: d.rawCode };
      }
    } catch { /* not JSON */ }
    return null;
  };

  const emitVerdict = (submission, json) => {
    const d = (json && (json.data || json.result)) || json || {};
    const status = d && d.status && d.status.description;
    post({
      type: 'N2L_SUBMISSION',
      ...submission,
      status: status || 'Unknown',
      testCases: d.test_case_count,
      correct: d.correct_test_case_count,
      at: Date.now(),
    });
  };

  // ---- XMLHttpRequest (what NeetCode's Angular HttpClient uses)
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  const origSetHeader = XHR.setRequestHeader;

  XHR.open = function n2lOpen(method, url) {
    try { this.__n2l = { method: String(method || ''), url: String(url || ''), headers: {} }; } catch { /* ignore */ }
    return origOpen.apply(this, arguments);
  };

  XHR.setRequestHeader = function n2lSetHeader(name, value) {
    try { if (this.__n2l) this.__n2l.headers[name] = value; } catch { /* ignore */ }
    return origSetHeader.apply(this, arguments);
  };

  XHR.send = function n2lSend(body) {
    const info = this.__n2l;
    try {
      if (info && info.url.includes('/api/')) {
        if (hasAuth(info.headers)) post({ type: 'N2L_API_HEADERS', headers: { ...info.headers }, capturedAt: Date.now() });
        if (info.url.includes(SUBMIT_PATH)) {
          const submission = parseSubmission(body);
          if (submission) {
            this.addEventListener('loadend', () => {
              try {
                const r = this.response;
                const json = typeof r === 'string' ? JSON.parse(r) : r;
                emitVerdict(submission, json);
              } catch { /* non-JSON response */ }
            });
          }
        }
      }
    } catch { /* never break the page */ }
    return origSend.apply(this, arguments);
  };

  // ---- fetch (kept in case NeetCode switches HttpClient to withFetch())
  const origFetch = window.fetch;
  const urlOf = (input) => {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return input.url;
    } catch { /* ignore */ }
    return '';
  };

  window.fetch = function n2lFetch(input, init) {
    const url = urlOf(input);
    let submission = null;
    try {
      if (url.includes('/api/')) {
        const headers = headersToObject((init && init.headers) || (input && input.headers));
        if (hasAuth(headers)) post({ type: 'N2L_API_HEADERS', headers, capturedAt: Date.now() });
        if (url.includes(SUBMIT_PATH) && init) submission = parseSubmission(init.body);
      }
    } catch { /* ignore */ }

    const p = origFetch.apply(this, arguments);
    if (submission) {
      p.then((res) => {
        res.clone().json().then((json) => emitVerdict(submission, json)).catch(() => {});
      }).catch(() => {});
    }
    return p;
  };
})();
