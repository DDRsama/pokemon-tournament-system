const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const i18nPath = path.join(root, 'public/shared/i18n.js');
const i18nSource = fs.readFileSync(i18nPath, 'utf8');

function loadRuntime(lang = 'en') {
  const fakeDoc = {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createTreeWalker() { return { nextNode() { return null; } }; },
    createElement() {
      return {
        setAttribute() {},
        appendChild() {},
        add() {},
        textContent: '',
        value: '',
        classList: { add() {}, remove() {} },
        style: {},
      };
    },
    documentElement: { dataset: {}, setAttribute() {}, prepend() {}, appendChild() {} },
    title: 'x',
    body: null,
  };
  const fakeWindow = {
    addEventListener() {},
    location: { search: `?lang=${lang}`, href: `http://example.test/?lang=${lang}` },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: lang },
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    console,
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: fakeDoc,
    MutationObserver: fakeWindow.MutationObserver,
    localStorage: fakeWindow.localStorage,
    location: fakeWindow.location,
    navigator: fakeWindow.navigator,
    console,
    setTimeout,
    clearTimeout,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  });
  vm.runInContext(i18nSource, context);
  return fakeWindow.PTSI18n;
}

function createFakeElement(tagName = 'DIV') {
  const attributes = new Map();
  const element = {
    nodeType: 1,
    tagName,
    children: [],
    parentElement: null,
    appendChild(node) {
      node.parentElement = element;
      element.children.push(node);
      return node;
    },
    closest(selector) {
      if (selector !== '[data-i18n-skip]') return null;
      if (attributes.has('data-i18n-skip')) return element;
      return element.parentElement?.closest?.(selector) || null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    querySelectorAll() {
      const elements = [];
      const visit = node => {
        if (!node || node.nodeType !== 1) return;
        elements.push(node);
        node.children.forEach(visit);
      };
      element.children.forEach(visit);
      return elements;
    },
  };
  return element;
}

function createFakeText(value) {
  return { nodeType: 3, nodeValue: value, parentElement: null };
}

function loadRuntimeWithText(textValue = '新建比赛') {
  const rootElement = createFakeElement('HTML');
  const body = createFakeElement('BODY');
  const input = createFakeElement('INPUT');
  const textNode = createFakeText(textValue);
  rootElement.appendChild(body);
  body.appendChild(input);
  body.appendChild(textNode);

  const fakeDoc = {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: rootElement,
    title: '',
    body,
    createElement: createFakeElement,
    createTreeWalker(root, _whatToShow, filter) {
      const textNodes = [];
      const visit = node => {
        if (!node) return;
        if (node.nodeType === 3) {
          if (!filter || filter.acceptNode(node) === 1) textNodes.push(node);
          return;
        }
        if (node.nodeType === 1) node.children.forEach(visit);
      };
      visit(root);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          index += 1;
          if (index >= textNodes.length) return false;
          this.currentNode = textNodes[index];
          return true;
        },
      };
    },
  };
  const fakeWindow = {
    addEventListener() {},
    location: { search: '', href: 'http://example.test/' },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: 'zh-CN' },
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    console,
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: fakeDoc,
    MutationObserver: fakeWindow.MutationObserver,
    localStorage: fakeWindow.localStorage,
    location: fakeWindow.location,
    navigator: fakeWindow.navigator,
    console,
    setTimeout,
    clearTimeout,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  });
  vm.runInContext(i18nSource, context);
  return { runtime: fakeWindow.PTSI18n, textNode, input };
}

test('main frontend entry points load the shared i18n runtime', () => {
  [
    'public/home/index.html',
    'public/admin/index.html',
    'public/player/index.html',
    'public/player-center/index.html',
    'public/overlay/index.html',
  ].forEach(rel => {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(html, /\/shared\/i18n\.js\?v=3\.2-i18n-1/, rel);
  });
});

test('runtime exposes Chinese, English, and Japanese without translating internal enum values', () => {
  assert.match(i18nSource, /'zh-CN': '中文'/);
  assert.match(i18nSource, /en: 'English'/);
  assert.match(i18nSource, /ja: '日本語'/);
  assert.match(i18nSource, /MutationObserver/);
  assert.match(i18nSource, /pts-language-switcher/);
  assert.match(i18nSource, /pts-language-option/);
  assert.doesNotMatch(i18nSource, /pts-language-select/);
  assert.doesNotMatch(i18nSource, /['"]double_elimination['"]\s*:/);
  assert.doesNotMatch(i18nSource, /['"]single_elimination['"]\s*:/);
  assert.doesNotMatch(i18nSource, /['"]groups-ended['"]\s*:/);
});

test('language switcher uses the compact segmented control styles', () => {
  const css = fs.readFileSync(path.join(root, 'public/shared/theme.css'), 'utf8');
  assert.match(css, /\.pts-topbar-tools/);
  assert.match(css, /\.pts-language-switcher/);
  assert.match(css, /\.pts-language-option\.is-active/);
  assert.doesNotMatch(css, /\.pts-language-select/);
});

test('core visible strings translate in English and Japanese', () => {
  const runtime = loadRuntime('en');
  const cases = [
    ['新建比赛', 'New Tournament', '大会を作成'],
    ['赛事后台 - Pokemon Tournament System', 'Admin - Pokemon Tournament System', '大会管理 - Pokemon Tournament System'],
    ['选手中心', 'Player Center', 'プレイヤーセンター'],
    ['提交胜利', 'Submit Win', '勝利報告'],
    ['导出战报', 'Export Report', 'レポート出力'],
    ['双败淘汰', 'Double Elimination', 'ダブルエリミネーション'],
    ['叠加层错误', 'Overlay Error', 'オーバーレイエラー'],
    ['第 3 轮', 'Round 3', '第 3 ラウンド'],
    ['12 人', '12 players', '12 人'],
  ];

  cases.forEach(([source, en, ja]) => {
    assert.equal(runtime.t(source, 'en'), en, source);
    assert.equal(runtime.t(source, 'ja'), ja, source);
  });
});

test('dynamic translation preserves player names while translating UI shell text', () => {
  const runtime = loadRuntime('en');
  assert.equal(runtime.t('联调选手01', 'en'), '联调选手01');
  assert.equal(
    runtime.t('确认将「联调选手01」标记为退赛？', 'en'),
    'Mark "联调选手01" as dropped?',
  );
});

test('language switching reuses original text and tracks later dynamic text updates', () => {
  const { runtime, textNode, input } = loadRuntimeWithText('新建比赛');
  input.setAttribute('placeholder', '选手显示名');

  runtime.translateNode(textNode);
  runtime.setLanguage('en');
  assert.equal(textNode.nodeValue, 'New Tournament');
  assert.equal(input.getAttribute('placeholder'), 'Player display name');

  runtime.setLanguage('ja');
  assert.equal(textNode.nodeValue, '大会を作成');
  assert.equal(input.getAttribute('placeholder'), 'プレイヤー表示名');

  runtime.setLanguage('zh-CN');
  assert.equal(textNode.nodeValue, '新建比赛');
  assert.equal(input.getAttribute('placeholder'), '选手显示名');

  runtime.setLanguage('en');
  textNode.nodeValue = '刷新';
  input.setAttribute('placeholder', '积分规则名称');
  runtime.translateNode(textNode);
  runtime.translateNode(input);
  assert.equal(textNode.nodeValue, 'Refresh');
  assert.equal(input.getAttribute('placeholder'), 'Points rule name');

  runtime.setLanguage('ja');
  assert.equal(textNode.nodeValue, '更新');
  assert.equal(input.getAttribute('placeholder'), 'ポイントルール名');

  runtime.setLanguage('zh-CN');
  assert.equal(textNode.nodeValue, '刷新');
  assert.equal(input.getAttribute('placeholder'), '积分规则名称');
});

test('player center PWA caches i18n runtime and uses multilingual install metadata', () => {
  const sw = fs.readFileSync(path.join(root, 'public/player-center/sw.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'public/player-center/manifest.webmanifest'), 'utf8');
  assert.match(sw, /\/shared\/i18n\.js\?v=3\.2-i18n-1/);
  assert.match(sw, /pts-player-center-v3\.2-i18n-1/);
  assert.match(manifest, /Player Center/);
  assert.match(manifest, /プレイヤーセンター/);
});
