(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || {};

  const registry = new Map();
  const requiredViews = [
    'idle',
    'swiss-live',
    'swiss-result',
    'swiss-overview',
    'swiss-ended',
    'top8-live',
    'top8-result',
    'top8-bracket',
    'podium',
    'error',
  ];

  const state = {
    currentViewKey: '',
    currentView: null,
    currentRoot: null,
    currentContext: null,
    currentLayer: null,
    bufferLayer: null,
    latestState: null,
    isTransitioning: false,
    pendingState: null,
    managedMode: false,
  };

  function registerView(viewKey, viewObject) {
    if (!viewKey || typeof viewKey !== 'string') {
      throw new Error('registerView requires a string viewKey');
    }
    if (!viewObject || typeof viewObject !== 'object') {
      throw new Error(`registerView(${viewKey}) requires a view object`);
    }
    if (!viewObject.templateId) {
      throw new Error(`View ${viewKey} is missing templateId`);
    }
    registry.set(viewKey, viewObject);
    return viewObject;
  }

  function getView(viewKey) {
    return registry.get(viewKey) || null;
  }

  function getRegisteredViewKeys() {
    return Array.from(registry.keys());
  }

  function getMissingRequiredViews() {
    return requiredViews.filter(viewKey => !registry.has(viewKey));
  }

  function assertBootReady() {
    const missing = getMissingRequiredViews();
    if (missing.length) {
      throw new Error(`Missing overlay views: ${missing.join(', ')}`);
    }
    const routeMatch = location.pathname.match(/^\/t\/([^/]+)\/overlay\/?$/);
    if (!routeMatch || !routeMatch[1]) {
      throw new Error('Invalid overlay tournament route');
    }
    return true;
  }

  function showError(message) {
    const root = state.currentLayer || document.getElementById('overlay-root') || document.body;
    const template = document.getElementById('tpl-error');
    if (!template || !root) return;
    root.innerHTML = '';
    const fragment = template.content.cloneNode(true);
    const messageEl = fragment.querySelector('#overlayErrorMessage');
    if (messageEl) messageEl.textContent = message || 'Overlay failed to load';
    root.appendChild(fragment);
  }

  Object.assign(PTSOverlay, {
    registry,
    requiredViews,
    state,
    registerView,
    getView,
    getRegisteredViewKeys,
    getMissingRequiredViews,
    assertBootReady,
    showError,
  });

  window.PTSOverlay = PTSOverlay;
})();
