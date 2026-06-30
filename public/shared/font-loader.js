(() => {
  const DEFAULT_STACKS = {
    'zh-CN': '"PTS Noto Sans SC", "PTS Inter", "PTS Noto Sans JP", "Segoe UI Emoji", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
    en: '"PTS Inter", "PTS Noto Sans SC", "PTS Noto Sans JP", "Segoe UI Emoji", "Noto Sans CJK SC", sans-serif',
    ja: '"PTS Noto Sans JP", "PTS Inter", "PTS Noto Sans SC", "Segoe UI Emoji", "Noto Sans CJK JP", sans-serif',
  };
  let activeFonts = null;

  function cssString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function buildFontFace(role, font) {
    if (!font || !font.family || !font.url) return '';
    const format = font.format ? ` format("${cssString(font.format)}")` : '';
    return `@font-face{font-family:"${cssString(font.family)}";src:url("${cssString(font.url)}")${format};font-weight:100 900;font-style:normal;font-display:swap;}`;
  }

  function applyFonts(payload) {
    const fonts = payload && payload.fonts ? payload.fonts : {};
    activeFonts = fonts;
    const css = [
      buildFontFace('en', fonts.en || fonts.latin),
      buildFontFace('zh', fonts.zh || fonts.sc),
      buildFontFace('ja', fonts.ja || fonts.jp),
    ].filter(Boolean).join('\n');
    if (css) {
      const existing = document.getElementById('pts-active-fonts');
      if (existing) existing.remove();
      const style = document.createElement('style');
      style.id = 'pts-active-fonts';
      style.textContent = css;
      document.head.appendChild(style);
    }
    applyLanguageFontStack(currentLanguage());
  }

  function normalizeLanguage(lang) {
    const value = String(lang || '').toLowerCase();
    if (value.startsWith('ja')) return 'ja';
    if (value.startsWith('en')) return 'en';
    return 'zh-CN';
  }

  function currentLanguage() {
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang) return normalizeLanguage(htmlLang);
    try {
      return normalizeLanguage(localStorage.getItem('pts_language') || navigator.language);
    } catch (_) {
      return normalizeLanguage(navigator.language);
    }
  }

  function fontFamily(font) {
    return font && font.family ? `"${cssString(font.family)}"` : '';
  }

  function applyLanguageFontStack(lang) {
    const normalized = normalizeLanguage(lang);
    const fonts = activeFonts || {};
    const byRole = {
      en: fonts.en || fonts.latin,
      zh: fonts.zh || fonts.sc,
      ja: fonts.ja || fonts.jp,
    };
    const order = normalized === 'ja'
      ? ['ja', 'en', 'zh']
      : (normalized === 'en' ? ['en', 'zh', 'ja'] : ['zh', 'en', 'ja']);
    const stack = order.map(role => fontFamily(byRole[role])).filter(Boolean).join(', ');
    const fallback = DEFAULT_STACKS[normalized] || DEFAULT_STACKS['zh-CN'];
    const fontStack = stack ? `${stack}, ${fallback}` : fallback;
    document.documentElement.setAttribute('data-pts-font-language', normalized);
    document.documentElement.style.setProperty('--pts-font-sans', fontStack);
    document.documentElement.style.setProperty('--pto-font-sans', fontStack);
  }

  fetch('/api/fonts/active', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(payload => {
      if (payload?.ok) applyFonts(payload);
    })
    .catch(() => {});

  window.addEventListener('pts-languagechange', event => {
    applyLanguageFontStack(event?.detail?.language || currentLanguage());
  });
})();
