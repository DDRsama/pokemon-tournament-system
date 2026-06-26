# Changelog

## v3.1.0

### 简体中文

PTS 3.1.0 是体验、视觉和部署可靠性整理版。这个版本不新增核心赛制模型，不做主题系统，也不重写 Overlay 架构；重点是把 3.0 beta 实际联调中暴露出来的入口、展示和部署问题收束到更稳定的正式版本状态。

- 新增独立选手中心入口 `/player/`，支持 iOS Safari 和 Android Chrome 添加到手机主屏幕。
- 统一主屏幕图标、manifest、service worker 和主要页面 favicon。
- Docker 默认使用 `DATA_ROOT=/data`，Compose 默认只需要映射 `./data:/data`，持久化比赛、选手档案、联赛、积分方案和战报。
- 保留 `DATA_DIR`、`PLAYERS_DIR`、`LEAGUES_DIR`、`POINTS_DIR`、`REPORTS_DIR` 等旧环境变量的单独覆盖能力。
- 精简选手中心登录前信息与登录后比赛列表排版，减少大按钮和大卡片。
- 已结束比赛在选手中心历史中保留战报导出入口，不再突出赛中返回入口。
- 修复 Overlay 完赛后优先显示冠军/领奖台页，避免停留在旧 Top 8 树或错误赛段。
- 修正 Overlay 内部英文阶段值、等待对手文案、比分视觉、排名上升动画裁切和标签溢出问题。
- 后台等待对手、TBD、BYE 对局增加禁用视觉，避免看起来像可操作对局。
- 后台 Overlay 预览移除无意义遮罩层，保持预览画面清晰。
- README 三语同步 3.1 的 Docker 数据目录、手机入口和正式版部署说明。

### English

PTS 3.1.0 focuses on experience polish, visual fixes, and deployment reliability. It does not add a new tournament-format model, theme system, or overlay architecture rewrite. The goal is to stabilize the 3.0 beta experience into a formal release based on integration testing feedback.

- Added a standalone player-center entry at `/player/`, installable from iOS Safari and Android Chrome.
- Unified home-screen icons, manifest, service worker, and favicon assets across main pages.
- Docker now defaults to `DATA_ROOT=/data`; Compose maps `./data:/data` and persists tournaments, player profiles, leagues, points profiles, and reports.
- Existing overrides such as `DATA_DIR`, `PLAYERS_DIR`, `LEAGUES_DIR`, `POINTS_DIR`, and `REPORTS_DIR` remain supported.
- Compact player-center login and tournament-list layouts to reduce oversized buttons and cards.
- Finished tournaments keep report export in player-center history without emphasizing in-match return actions.
- Overlay now prefers champion/podium screens after completion instead of staying on stale Top 8 or wrong-stage views.
- Fixed internal English stage labels, waiting-opponent labels, compact score visuals, ranking animation clipping, and overflowing match labels.
- Admin match cards now show disabled visuals for waiting-opponent, TBD, and BYE matches.
- Admin overlay preview no longer has an unnecessary status layer over the iframe.
- README files now document 3.1 Docker data directories, phone entry, and stable deployment in Chinese, English, and Japanese.

### 日本語

PTS 3.1.0 は、体験、表示、デプロイ信頼性の整理版です。新しい大会形式モデル、テーマシステム、Overlay アーキテクチャの全面刷新は含みません。3.0 beta の連携テストで見つかった入口、表示、デプロイまわりの問題を正式版として安定させることを目的としています。

- 独立したプレイヤーセンター入口 `/player/` を追加し、iOS Safari と Android Chrome からホーム画面に追加できるようにしました。
- 主要ページのホーム画面アイコン、manifest、service worker、favicon を統一しました。
- Docker は既定で `DATA_ROOT=/data` を使用し、Compose は `./data:/data` の単一マウントで大会、プレイヤープロフィール、リーグ、ポイント設定、レポートを永続化します。
- `DATA_DIR`、`PLAYERS_DIR`、`LEAGUES_DIR`、`POINTS_DIR`、`REPORTS_DIR` など既存の個別上書き環境変数も引き続き利用できます。
- プレイヤーセンターのログイン前表示とログイン後の大会一覧をコンパクト化し、大きすぎるボタンとカードを整理しました。
- 終了済み大会はプレイヤーセンターの履歴でレポート出力入口を残し、試合中ページへの復帰を強調しないようにしました。
- Overlay は大会終了後、古い Top 8 表や誤ったステージ表示ではなく、優勝者 / 表彰台画面を優先します。
- 内部英語ステージ名、対戦相手待ち表示、スコア表示、順位上昇アニメーションのクリップ、対戦ラベルのはみ出しを修正しました。
- 管理画面では対戦相手待ち、TBD、BYE の対戦カードに無効状態の見た目を追加しました。
- 管理画面の Overlay プレビューから不要な状態レイヤーを外し、iframe の表示を見やすくしました。
- README は Docker データディレクトリ、スマートフォン入口、安定版デプロイ説明を三言語で更新しました。

### Verification

- Run `node --test` before publishing.
- Manually verify `/player/` installability on iOS Safari and Android Chrome.
- Verify Docker persistence with a single host directory mapped to `/data`.
- Verify Overlay at 1920x1080 transparent background for Top 4 / Top 8 / Top 16 / Top 32, podium, group stage, and double elimination views.
