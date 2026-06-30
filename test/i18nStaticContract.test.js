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
    createEvent() { return { initCustomEvent(type, _bubbles, _cancelable, detail) { this.type = type; this.detail = detail; } }; },
    title: 'x',
    body: null,
  };
  const fakeWindow = {
    addEventListener() {},
    dispatchEvent() {},
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
    createEvent() { return { initCustomEvent(type, _bubbles, _cancelable, detail) { this.type = type; this.detail = detail; } }; },
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
    dispatchedEvents: [],
    dispatchEvent(event) { this.dispatchedEvents.push(event); return true; },
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
  return { runtime: fakeWindow.PTSI18n, textNode, input, fakeWindow };
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
    assert.match(html, /\/shared\/i18n\.js\?v=3\.3-i18n-scan-1/, rel);
  });
});

test('runtime exposes Chinese, English, and Japanese without translating internal enum values', () => {
  assert.match(i18nSource, /'zh-CN': '中文'/);
  assert.match(i18nSource, /en: 'English'/);
  assert.match(i18nSource, /ja: '日本語'/);
  assert.match(i18nSource, /MutationObserver/);
  assert.match(i18nSource, /dispatchLanguageChange/);
  assert.match(i18nSource, /scheduleTranslateNode/);
  assert.match(i18nSource, /pts-languagechange/);
  assert.match(i18nSource, /pts-language-switcher/);
  assert.match(i18nSource, /pts-language-option/);
  assert.doesNotMatch(i18nSource, /pts-language-select/);
  assert.doesNotMatch(i18nSource, /['"]double_elimination['"]\s*:/);
  assert.doesNotMatch(i18nSource, /['"]single_elimination['"]\s*:/);
  assert.doesNotMatch(i18nSource, /['"]groups-ended['"]\s*:/);
});

test('pages listen for language changes and rerender dynamic content', () => {
  const entries = [
    ['public/home/home.js', 'renderAll();'],
    ['public/admin/admin.js', 'if (currentState) render(currentState);'],
    ['public/player/index.html', 'if (lastView) renderPlayerView(lastView);'],
    ['public/player-center/center.js', 'render();'],
  ];

  for (const [rel, token] of entries) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(source, /window\.addEventListener\('pts-languagechange'/, rel);
    assert.equal(source.includes(token), true, `${rel} should rerender after language changes`);
    assert.match(source, /PTSI18n\?\.translateNode\?\.\(document\.documentElement\)/, rel);
  }
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
    ['切入直播', 'Go Live', '配信へ切替'],
    ['取消候场', 'Cancel Staging', '待機を取消'],
    ['确认录入小分', 'Confirm Game Score', 'ゲームスコア入力確認'],
    ['第 3 轮', 'Round 3', '第 3 ラウンド'],
    ['12 人', '12 players', '12 人'],
    ['判定「皮卡丘」获胜', 'Set "皮卡丘" as winner', '「皮卡丘」の勝利にします'],
    ['更新小分为 2-1', 'Update score to 2-1', 'スコアを 2-1 に更新'],
  ];

  cases.forEach(([source, en, ja]) => {
    assert.equal(runtime.t(source, 'en'), en, source);
    assert.equal(runtime.t(source, 'ja'), ja, source);
  });
});

test('home management panels and toasts translate in English and Japanese', () => {
  const runtime = loadRuntime('en');
  const cases = [
    ['联赛管理', 'League Management', 'リーグ管理'],
    ['新建档案', 'New Profile', 'プロフィール作成'],
    ['积分规则管理', 'Points Rule Management', 'ポイントルール管理'],
    ['新建规则', 'New Rule', 'ルール作成'],
    ['编辑选手档案', 'Edit Player Profile', 'プレイヤープロフィール編集'],
    ['编辑积分规则', 'Edit Points Rule', 'ポイントルール編集'],
    ['保存选手档案失败', 'Failed to save player profile', 'プレイヤープロフィール保存に失敗しました'],
    ['保存积分规则失败', 'Failed to save points rule', 'ポイントルールの保存に失敗しました'],
    ['创建联赛失败', 'Failed to create league', 'リーグ作成に失敗しました'],
    ['联赛已创建', 'League created', 'リーグを作成しました'],
    ['积分规则已创建', 'Points rule created', 'ポイントルールを作成しました'],
    ['选手档案已删除', 'Player profile deleted', 'プレイヤープロフィールを削除しました'],
    ['选择积分规则', 'Select Points Rule', 'ポイントルール選択'],
    ['？删除联赛不会删除源比赛。', '? Deleting the league will not delete source tournaments.', '？リーグを削除しても元の大会は削除されません。'],
  ];

  cases.forEach(([source, en, ja]) => {
    assert.equal(runtime.t(source, 'en'), en, source);
    assert.equal(runtime.t(source, 'ja'), ja, source);
  });
});

test('admin and player static chrome labels translate with icons and short actions', () => {
  const runtime = loadRuntime('en');
  const cases = [
    ['🎮赛事管理', '🎮 Tournament Admin', '🎮 大会管理'],
    ['🧩 阶段', '🧩 Stages', '🧩 ステージ'],
    ['📋 选手', '📋 Players', '📋 プレイヤー'],
    ['📱 参赛端', '📱 Entrant Page', '📱 参加ページ'],
    ['OBS 设置', 'OBS Settings', 'OBS 設定'],
    ['等待比赛开始', 'Waiting for tournament start', '大会開始待ち'],
    ['直播房号', 'Live Room Code', '配信ルームコード'],
    ['改名', 'Rename', '名前変更'],
    ['修改档案名称', 'Edit Profile Name', 'プロフィール名を変更'],
    ['保存后会同步到已经绑定这个档案的比赛记录。', 'After saving, linked tournament records for this profile will be updated.', '保存後、このプロフィールに紐付く大会記録にも同期されます。'],
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

test('language switching emits a browser event for page-level rerender hooks', () => {
  const { runtime, fakeWindow } = loadRuntimeWithText('新建比赛');
  runtime.setLanguage('en');
  assert.equal(runtime.getLanguage(), 'en');
  assert.equal(fakeWindow.dispatchedEvents.length > 0, true);
  assert.equal(fakeWindow.dispatchedEvents.at(-1).type, 'pts-languagechange');
  assert.equal(fakeWindow.dispatchedEvents.at(-1).detail.language, 'en');
});

test('player center PWA caches i18n runtime and uses multilingual install metadata', () => {
  const sw = fs.readFileSync(path.join(root, 'public/player-center/sw.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'public/player-center/manifest.webmanifest'), 'utf8');
  assert.match(sw, /\/shared\/i18n\.js\?v=3\.3-i18n-scan-1/);
  assert.match(sw, /\/shared\/font-loader\.js\?v=3\.3-font-loader-1/);
  assert.match(sw, /\/player\/center\.js\?v=3\.3-entry-name-1/);
  assert.match(sw, /pts-player-center-v3\.3-report-fonts-2/);
  assert.match(manifest, /Player Center/);
  assert.match(manifest, /プレイヤーセンター/);
});
