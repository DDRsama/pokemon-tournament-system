# Pokemon Tournament System

[简体中文](./README.md) | [English](./README.en.md) | 日本語 | [ロードマップ](./ROADMAP.ja.md)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-ddrsama%2Fpokemon--tournament--system-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Pulls](https://img.shields.io/docker/pulls/ddrsama/pokemon-tournament-system?logo=docker&label=pulls)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Image Size](https://img.shields.io/docker/image-size/ddrsama/pokemon-tournament-system/latest?logo=docker&label=image%20size)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system/tags)
[![Release](https://img.shields.io/github/v/release/DDRsama/pokemon-tournament-system?label=release)](https://github.com/DDRsama/pokemon-tournament-system/releases)
[![License](https://img.shields.io/github/license/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/commits/main)

`Pokemon Tournament System`、略称 `PTS` は、ポケモンのオフライン大会向けに作られた大会運営システムです。もともとはポケモン VGC のローカル大会を主な対象として開発されましたが、スイスドロー、決勝トーナメント、配信卓管理、レポート出力を中心に構成されているため、PTCG、遊戯王、その他スイスドロー形式の自主管理イベントにも応用できます。

PTS は、管理画面、配信用オーバーレイ、プレイヤー向けモバイルページ、スイスドロー、Top 8 決勝トーナメント、レポート出力、Docker デプロイを一つのシステムにまとめています。

最新安定版：`3.3.3`

現在の beta 版：なし

リリースチャンネル：

- `latest`：安定版 Docker イメージ
- `beta`：beta Docker イメージ
- `3.3.3-beta` のようなタグ：特定の beta イメージ
- `3.3.3` のようなタグ：特定の安定版イメージ

ロードマップ：[ROADMAP.ja.md](./ROADMAP.ja.md)

## プロジェクトの目的

PTS は最初、配信用オーバーレイページとして始まりました。その後、オフライン大会全体を支えるツールチェーンへ発展しました。

想定している用途：

- 主催者がプレイヤー、ラウンド、対戦、配信卓、レポートを管理する
- 配信担当者が OBS にブラウザソースとしてオーバーレイを追加する
- プレイヤーがスマートフォンから参加登録、対戦確認、勝利報告、個人レポート出力を行う
- 月例大会、店舗大会、コミュニティ大会などの小規模スイスドローイベントを運営する

## 主な機能

### 管理画面

- プレイヤーの手動追加
- プレイヤーの一括インポート
- プレイヤー削除
- 大会名の変更
- 配信部屋番号の設定
- 外部アクセス URL の設定
- オーバーレイプレビュー
- レポート出力

### スイスドロー

- スイスラウンド数の設定
- 自動ペアリング生成
- 勝敗と引き分けの入力
- ドロップ処理
- 勝ち点とタイブレーカーによる順位付け
- スイス終了後の Top 8 確定

### 順位とタイブレーカー

- 勝ち点による順位付け
- 対戦相手勝率による順位付け
- 対戦相手の対戦相手勝率による順位付け
- オフライン大会でよく使われるドロップ処理に対応

### Top 8 決勝トーナメント

- Top 8 の対戦管理
- BO3 の小ゲーム勝利数入力
- 準決勝、決勝、3位決定戦の自動進行
- 配信卓設定
- オーバーレイへの同期表示

### プレイヤーページ

- QR コードから大会ページへアクセス
- プレイヤー登録 / ログイン
- 現在の卓番号と対戦相手を確認
- 現在の成績を確認
- 過去の対戦履歴と結果を確認
- 勝利報告
- 配信卓の部屋番号を確認
- 大会終了後に個人レポートを出力
- `/player/` から独立したプレイヤーセンターを開き、スマートフォンのホーム画面に追加

### レポートと記録

- 大会終了後に大会全体のレポートを出力

  <img width="50%" alt="Tournament report example" src="https://github.com/user-attachments/assets/2c6aeeb6-c28f-4c98-9f4a-dfefacef807f" />

- 優勝、ドロップ、敗退、スイス終了後に個人レポートを出力

  <img width="20%" alt="Personal report example" src="https://github.com/user-attachments/assets/f8cbd2ae-2457-4ae2-accc-f2658abeac0d" />

- スイスドローと決勝トーナメントの進行記録を保持

## 画面構成

### 0. ホーム

<img width="1598" height="1163" alt="Home page" src="https://github.com/user-attachments/assets/40079de9-65a7-4d13-bd15-6a1f17eefb0e" />

パス：

```text
/
```

用途：

- 大会作成
- 大会名変更、削除
- 単一大会の管理画面へ移動
- プレイヤーページとオーバーレイのリンクコピー

### 1. 管理画面

<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/36940de0-4a06-4884-8de9-1228a10d306e" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/925e794a-7872-4e8b-9cff-bd4ef447a61a" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/7b1fe3cc82c40723908c8356811eb53a" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/7676ad6f-c6fb-4ab7-90a3-20c0549f9376" />

パス：

```text
/t/<tournamentId>/admin
```

用途：

- 大会進行、プレイヤー、ラウンド、結果、オーバーレイプレビュー、レポートの管理

### 2. 配信用オーバーレイ

<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/872f54ca-6444-4357-98b9-92be58d93ffd" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/1d36aeb7-8f91-4b9e-b290-fba2eb1874aa" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/91a9801e-1c5d-4392-a5f0-93b021715eab" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/714afa6e-13a2-44e4-9724-92f1dc738417" />

パス：

```text
/t/<tournamentId>/overlay
```

用途：

- OBS ブラウザソースとして使用
- 配信卓情報の表示
- 大会概要の表示
- Top 8 トーナメント表の表示

### 3. プレイヤーページ

<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/459c4488-be7a-4555-ba20-a4fd29c77994" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/5d651856-cb23-4ce5-8a21-e51f90bdd7af" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/bdfe0a30-5c33-44da-91e4-e54e8d769864" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/1da1c121-dad0-40c1-84a9-434d56bde1f2" />

パス：

```text
/t/<tournamentId>/player-login
```

用途：

- QR コードからアクセス
- 登録 / ログイン
- 現在の対戦確認
- 履歴確認
- 勝利報告

### 4. プレイヤーセンター

パス：

```text
/player/
```

用途：

- 大会当日以外でも、スマートフォンのホーム画面アイコンや固定リンクからプレイヤーセンターへ入る
- 現在の軽量な名前確認方式でプレイヤープロフィールにログインする
- 進行中の大会、参加登録できる大会、個人レポート履歴を確認する
- iOS Safari と Android Chrome でホーム画面に追加する

## プロジェクト構成

- `src/`
  サーバー側の主処理
- `public/admin/`
  管理画面
- `public/overlay/`
  配信用オーバーレイ
- `public/player/`
  プレイヤーページ
- `public/player-center/`
  独立したプレイヤーセンターとスマートフォンのホーム画面入口
- `public/shared/`
  共通スタイル、QR コードスクリプト、フォント、素材
- `data/`
  ローカル大会データとレポート保存先

## ローカル実行

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Python レポート依存関係

レポート出力には Python と `reportlab` が必要です。

```bash
pip install reportlab
```

### 3. サーバー起動

```bash
npm start
```

デフォルトポート：

```text
18765
```

起動後にアクセスできるページ：

- ホーム：`/`
- 管理画面：`/t/<tournamentId>/admin`
- オーバーレイ：`/t/<tournamentId>/overlay`
- プレイヤーページ：`/t/<tournamentId>/player-login`
- プレイヤーセンター：`/player/`

旧入口 `/admin`、`/overlay`、`/player-login` はホームにリダイレクトされます。`/player` と `/player/` は正式なプレイヤーセンター入口です。

## Docker デプロイ

### Docker Hub イメージ

```bash
docker pull ddrsama/pokemon-tournament-system:latest
```

beta を取得することもできます。

```bash
docker pull ddrsama/pokemon-tournament-system:beta
```

バージョンを指定して取得することもできます。

```bash
docker pull ddrsama/pokemon-tournament-system:3.3.3
```

### ローカル開発用 Docker Compose

```bash
docker compose up -d --build
```

現在のワークスペースから直接イメージをビルドします。

### 安定版 Docker Compose デプロイ

```bash
docker compose -f docker-compose.deploy.yml up -d
```

特定の安定版イメージに固定する場合：

```bash
PTS_TAG=3.3.3 docker compose -f docker-compose.deploy.yml up -d
```

### Beta Docker Compose デプロイ

```bash
docker compose -f docker-compose.deploy.yml -f docker-compose.deploy.beta.yml up -d
```

デフォルトポート：

```text
18765:18765
```

Docker Compose はデフォルトで `./data` にデータを永続化します。

- `./data/tournaments`
- `./data/players`
- `./data/leagues`
- `./data/points`
- `./data/fonts`
- `./data/reports`

## GitHub と Docker リリース

このリポジトリは 2 つのリリースチャンネルに対応しています。

- GitHub の正式 release：
  `x.y.z` と `latest` を公開します
- GitHub の pre-release：
  `x.y.z-beta` と `beta` を公開します
- GitHub Actions の手動実行：
  追加で beta イメージを公開できます

## 環境変数

- `PORT`
  サーバーポート。デフォルトは `18765`
- `PUBLIC_BASE_URL`
  QR コードとプレイヤーリンク生成に使う外部アクセス URL
- `DATA_ROOT`
  データルートディレクトリ。Docker では既定で `/data`
- `DATA_DIR`
  大会データディレクトリ
- `PLAYERS_DIR`
  選手プロフィールディレクトリ
- `LEAGUES_DIR`
  リーグディレクトリ
- `POINTS_DIR`
  ポイントプロファイルディレクトリ
- `FONTS_DIR`
  私有フォントディレクトリ
- `REPORTS_DIR`
  レポート出力ディレクトリ
- `PYTHON_BIN`
  Python 実行ファイルのパス。Docker では `/usr/local/bin/python`

## フォントとレポート

既定では再配布可能なオープンソースフォントを同梱しています。

- `public/shared/fonts/InterVariable.woff2`
- `public/shared/fonts/NotoSansSC-VF.ttf`
- `public/shared/fonts/NotoSansJP-VF.ttf`
- `public/shared/fonts/NotoSansSC-Medium.ttf`
- `public/shared/fonts/NotoSansJP-Medium.ttf`

自分の環境でライセンス済みの私有フォントを使う場合は、データディレクトリの `fonts` 配下に言語別フォルダを作って配置することを推奨します。

- 中国語：`/data/fonts/zh`
- 英語：`/data/fonts/en`
- 日本語：`/data/fonts/ja`

Web UI は表示言語を切り替えるとページ全体のフォントスタックも切り替えます。そのため、日本語 UI 内の漢字も日本語フォントを優先して表示します。旧デプロイとの互換性のため、`/data/fonts` 直下に置いたフォントもファイル名から自動判定しますが、これは移行用のフォールバックとして扱います。PDF レポートはサーバー側で生成され、現在の UI 言語に対応するフォルダ内の `reportlab` に登録可能なフォントを先に試し、その後に同梱の静的 Noto Sans SC/JP Medium TTF レポート用フォントへフォールバックするため、閲覧端末のローカルフォントには依存しません。私有フォントのライセンス確認はデプロイする利用者の責任であり、公開イメージには同梱しません。

Docker イメージには CJK フォントと `reportlab` 実行環境が含まれています。

## ロードマップ

今後の予定は [ROADMAP.ja.md](./ROADMAP.ja.md) を参照してください。

## 想定利用シーン

- ローカルネットワークでの大会管理
- Docker デプロイ
- OBS ブラウザソース用オーバーレイ
- プレイヤーのスマートフォン QR コードアクセス

## 開発メモ

このプロジェクトは Codex と協力しながら開発、整理、検証を進めています。多くのワークフロー、連携、テスト、修正作業は GPT-5.5 との協力によって進められました。

## 謝辞

[ssccinng](https://github.com/ssccinng) さんの寛大なスポンサー支援に感謝します。
