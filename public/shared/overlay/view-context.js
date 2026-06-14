(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || (window.PTSOverlay = {});

  class ViewContext {
    constructor(viewKey) {
      this.viewKey = viewKey;
      this.cleanups = [];
      this.destroyed = false;
    }

    cleanup(fn) {
      if (typeof fn !== 'function') return fn;
      if (this.destroyed) {
        try { fn(); } catch (err) { console.error(err); }
        return fn;
      }
      this.cleanups.push(fn);
      return fn;
    }

    setTimeout(fn, ms) {
      const id = window.setTimeout(fn, ms);
      this.cleanup(() => window.clearTimeout(id));
      return id;
    }

    setInterval(fn, ms) {
      const id = window.setInterval(fn, ms);
      this.cleanup(() => window.clearInterval(id));
      return id;
    }

    on(target, event, handler, options) {
      if (!target || !target.addEventListener || !target.removeEventListener) return null;
      target.addEventListener(event, handler, options);
      this.cleanup(() => target.removeEventListener(event, handler, options));
      return handler;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      while (this.cleanups.length) {
        const fn = this.cleanups.pop();
        try { fn(); } catch (err) { console.error(err); }
      }
    }
  }

  function createViewContext(viewKey) {
    return new ViewContext(viewKey);
  }

  PTSOverlay.ViewContext = ViewContext;
  PTSOverlay.createViewContext = createViewContext;
})();
