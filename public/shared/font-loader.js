(() => {
  const DEFAULT_STACK = '"PTS Inter", "PTS Noto Sans SC", "PTS Noto Sans JP", "Segoe UI Emoji", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

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
    const css = [
      buildFontFace('latin', fonts.latin),
      buildFontFace('sc', fonts.sc),
      buildFontFace('jp', fonts.jp),
    ].filter(Boolean).join('\n');
    if (css) {
      const style = document.createElement('style');
      style.id = 'pts-active-fonts';
      style.textContent = css;
      document.head.appendChild(style);
    }
    const stack = [
      fonts.latin?.family,
      fonts.sc?.family,
      fonts.jp?.family,
    ].filter(Boolean).map(name => `"${cssString(name)}"`).join(', ');
    const fontStack = stack ? `${stack}, "Segoe UI Emoji", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif` : DEFAULT_STACK;
    document.documentElement.style.setProperty('--pts-font-sans', fontStack);
    document.documentElement.style.setProperty('--pto-font-sans', fontStack);
  }

  fetch('/api/fonts/active', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(payload => {
      if (payload?.ok) applyFonts(payload);
    })
    .catch(() => {});
})();
