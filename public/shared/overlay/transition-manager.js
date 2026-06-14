(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || (window.PTSOverlay = {});

  const TRANSITION_MS = 220;
  const TRANSITION_TIMEOUT_MS = 700;

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function waitForTransition(element, timeoutMs) {
    return Promise.race([
      new Promise(resolve => {
        if (!element) {
          resolve();
          return;
        }
        const done = () => {
          element.removeEventListener('transitionend', done);
          resolve();
        };
        element.addEventListener('transitionend', done, { once: true });
      }),
      new Promise(resolve => window.setTimeout(resolve, timeoutMs)),
    ]);
  }

  function cloneTemplate(view) {
    const template = document.getElementById(view.templateId);
    if (!template) {
      throw new Error(`Missing template: ${view.templateId}`);
    }
    return template.content.cloneNode(true);
  }

  function resetLayer(layer, role) {
    if (!layer) return;
    layer.innerHTML = '';
    layer.style.transition = '';
    layer.style.visibility = role === 'current' ? 'visible' : 'hidden';
    layer.style.opacity = role === 'current' ? '1' : '0';
    layer.style.pointerEvents = 'none';
    layer.setAttribute('aria-hidden', role === 'current' ? 'false' : 'true');
    layer.classList.toggle('overlay-layer-current', role === 'current');
    layer.classList.toggle('overlay-layer-buffer', role !== 'current');
  }

  function getLayerPair() {
    const rootLayer = document.getElementById('overlay-root');
    const bufferLayer = document.getElementById('overlay-buffer');
    if (!rootLayer || !bufferLayer) throw new Error('Missing overlay layers');

    const overlayState = PTSOverlay.state;
    if (!overlayState.currentLayer || !overlayState.bufferLayer) {
      overlayState.currentLayer = rootLayer;
      overlayState.bufferLayer = bufferLayer;
      rootLayer.classList.add('overlay-layer-current');
      rootLayer.classList.remove('overlay-layer-buffer');
      rootLayer.style.visibility = 'visible';
      rootLayer.style.opacity = '1';
      rootLayer.setAttribute('aria-hidden', 'false');
      bufferLayer.classList.add('overlay-layer-buffer');
      bufferLayer.classList.remove('overlay-layer-current');
      bufferLayer.style.visibility = 'hidden';
      bufferLayer.style.opacity = '0';
      bufferLayer.setAttribute('aria-hidden', 'true');
    }

    return {
      currentLayer: overlayState.currentLayer,
      bufferLayer: overlayState.bufferLayer,
    };
  }

  async function prepareView(viewKey, view, state, targetLayer) {
    if (!targetLayer) throw new Error('Missing target overlay layer');

    targetLayer.innerHTML = '';
    targetLayer.style.visibility = 'hidden';
    targetLayer.style.opacity = '0';
    targetLayer.style.transition = '';
    targetLayer.style.pointerEvents = 'none';
    targetLayer.setAttribute('aria-hidden', 'true');

    const context = PTSOverlay.createViewContext(viewKey);
    targetLayer.appendChild(cloneTemplate(view));
    const root = targetLayer.firstElementChild;
    if (!root) throw new Error(`View ${viewKey} rendered no root element`);

    if (typeof view.init === 'function') {
      view.init(root, state, context);
    }
    if (typeof view.update === 'function') {
      view.update(root, state, context);
    }

    await nextFrame();
    await nextFrame();
    root.getBoundingClientRect();
    return { layer: targetLayer, root, context };
  }

  async function mountView(viewKey, state) {
    const overlayState = PTSOverlay.state;
    const view = PTSOverlay.getView(viewKey);
    if (!view) throw new Error(`View is not registered: ${viewKey}`);

    if (overlayState.currentViewKey === viewKey && overlayState.currentView) {
      if (typeof overlayState.currentView.update === 'function') {
        overlayState.currentView.update(overlayState.currentRoot, state, overlayState.currentContext);
      }
      overlayState.latestState = state;
      return;
    }

    if (overlayState.isTransitioning) {
      overlayState.pendingState = state;
      return;
    }

    overlayState.isTransitioning = true;
    overlayState.pendingState = null;

    try {
      const { currentLayer, bufferLayer } = getLayerPair();
      const oldContext = overlayState.currentContext;
      const oldView = overlayState.currentView;
      const oldLayer = currentLayer;
      const sequentialPodiumEntry = overlayState.currentViewKey === 'top8-result' && viewKey === 'podium';
      const prepared = await prepareView(viewKey, view, state, bufferLayer);
      const { layer: newLayer, root, context } = prepared;

      oldLayer.style.transition = `opacity ${TRANSITION_MS}ms ease`;
      newLayer.style.transition = `opacity ${TRANSITION_MS}ms ease`;
      oldLayer.style.visibility = oldLayer.firstElementChild ? 'visible' : 'hidden';
      oldLayer.style.opacity = oldLayer.firstElementChild ? '1' : '0';
      newLayer.style.visibility = 'visible';
      newLayer.style.opacity = '0';
      newLayer.setAttribute('aria-hidden', 'false');

      await nextFrame();
      if (sequentialPodiumEntry) {
        oldLayer.style.opacity = '0';
        await waitForTransition(oldLayer, TRANSITION_TIMEOUT_MS);
        newLayer.style.opacity = '1';
        await waitForTransition(newLayer, TRANSITION_TIMEOUT_MS);
      } else {
        oldLayer.style.opacity = '0';
        newLayer.style.opacity = '1';
        await Promise.race([
          Promise.all([
            waitForTransition(newLayer, TRANSITION_TIMEOUT_MS),
            waitForTransition(oldLayer, TRANSITION_TIMEOUT_MS),
          ]),
          new Promise(resolve => window.setTimeout(resolve, TRANSITION_TIMEOUT_MS)),
        ]);
      }

      if (typeof oldView?.destroy === 'function') {
        oldView.destroy(oldContext);
      }
      if (oldContext) oldContext.destroy();

      resetLayer(oldLayer, 'buffer');
      newLayer.style.transition = '';
      newLayer.style.visibility = 'visible';
      newLayer.style.opacity = '1';
      newLayer.classList.add('overlay-layer-current');
      newLayer.classList.remove('overlay-layer-buffer');

      overlayState.currentViewKey = viewKey;
      overlayState.currentView = view;
      overlayState.currentRoot = root;
      overlayState.currentContext = context;
      overlayState.currentLayer = newLayer;
      overlayState.bufferLayer = oldLayer;
      overlayState.latestState = state;
      overlayState.managedMode = true;
    } finally {
      overlayState.isTransitioning = false;
      const pending = overlayState.pendingState;
      overlayState.pendingState = null;
      if (pending) {
        updateView(pending);
      }
    }
  }

  function updateView(state) {
    const processedState = PTSOverlay.preprocessState(state);
    const viewKey = PTSOverlay.resolveViewKey(processedState);
    return mountView(viewKey, processedState).catch(err => {
      console.error(err);
      PTSOverlay.showError(err.message || 'Overlay update failed');
    });
  }

  function destroyCurrentView() {
    const overlayState = PTSOverlay.state;
    if (typeof overlayState.currentView?.destroy === 'function') {
      overlayState.currentView.destroy(overlayState.currentContext);
    }
    if (overlayState.currentContext) overlayState.currentContext.destroy();
    overlayState.currentViewKey = '';
    overlayState.currentView = null;
    overlayState.currentRoot = null;
    overlayState.currentContext = null;
    if (overlayState.currentLayer) resetLayer(overlayState.currentLayer, 'current');
    if (overlayState.bufferLayer) resetLayer(overlayState.bufferLayer, 'buffer');
  }

  PTSOverlay.mountView = mountView;
  PTSOverlay.updateView = updateView;
  PTSOverlay.destroyCurrentView = destroyCurrentView;
})();
