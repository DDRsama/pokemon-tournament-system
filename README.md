# Pokemon Tournament System

简体中文 | [English](./README.en.md) | [日本語](./README.ja.md) | [路线图](./ROADMAP.md)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-ddrsama%2Fpokemon--tournament--system-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Pulls](https://img.shields.io/docker/pulls/ddrsama/pokemon-tournament-system?logo=docker&label=pulls)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Image Size](https://img.shields.io/docker/image-size/ddrsama/pokemon-tournament-system/latest?logo=docker&label=image%20size)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system/tags)
[![Release](https://img.shields.io/github/v/release/DDRsama/pokemon-tournament-system?label=release)](https://github.com/DDRsama/pokemon-tournament-system/releases)
[![License](https://img.shields.io/github/license/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/commits/main)

`Pokemon Tournament System`，简称 `PTS`，是一套面向宝可梦线下赛事的管理系统。
它最初以宝可梦 VGC 线下赛事为主要开发目标，但由于核心流程围绕瑞士轮、淘汰赛、直播桌管理与战报整理展开，因此同样适用于 PTCG、游戏王等采用瑞士轮结构的对战赛事。
它将后台管理、直播叠加层、选手端页面、瑞士轮与淘汰赛流程、战报导出，以及 Docker 部署能力整合到同一套系统中，目标是尽可能覆盖一场比赛从报名到赛后整理的完整流程。

最新稳定版：`3.3.1`

当前 beta 版：暂无

发布通道约定：

- `latest`：稳定版 Docker 镜像
- `beta`：测试版 Docker 镜像
- 形如 `3.3.1-beta` 的 tag：具体 beta 版本镜像
- 形如 `3.3.1` 的 tag：具体稳定版镜像

版本路线图：[ROADMAP.md](./ROADMAP.md)

## 项目定位

PTS 开发的初衷是一个单纯的直播 overlay 页面，但很快转变方向成为了一套完整的赛事工具链。旨在解决以下问题：

- 主办方需要一个可以直接管理选手、轮次、对局和直播桌的后台
- 直播端需要一个能快速接入 OBS 的叠加层
- 选手需要一个能通过手机录入、查看自己对局信息的页面
- 赛后需要可追溯的比赛记录和可导出的战报

如果你的使用场景是宝可梦线下月赛、店赛、社群赛或者其他使用瑞士轮的自办小型赛事，这个项目就是为这类需求设计的。

## 核心能力

### 后台管理

- 手动添加选手
- 批量导入选手
- 删除选手
- 比赛重命名
- 配置直播房号
- 配置对外访问地址

### 瑞士轮流程

- 按参赛人数自动生成瑞士轮计划轮数
- 自动生成配对
- 录入胜负
- 录入平局
- 处理退赛
- 按积分与小分排序
- 瑞士轮结束后确认 8 强

### 仿官赛思路的排序设计

- 按积分排序
- 按对手胜率排序
- 按对手的对手胜率排序
- 支持线下赛实际常见的退赛处理逻辑

### 淘汰赛流程

- Top 8 对阵管理
- BO3 小局录入
- 半决赛、决赛、季军赛自动推进
- 直播桌设置
- 叠加层同步展示

### 选手端

- 扫码进入比赛专属页面
- 选手登录 / 报名
- 查看当前轮桌号与对手
- 查看当前战绩
- 查看历史配对与结果
- 提交胜利
- 查看直播桌房号
- 比赛结束后导出个人战报
- 打开 `/player/` 进入独立选手中心，并可添加到手机主屏幕

### 战报与记录

- 全场比赛结束后生成本场比赛战报

   <img width="50%" alt="3386c2e1e0e1c905a4c24a01d9caa24c" src="https://github.com/user-attachments/assets/2c6aeeb6-c28f-4c98-9f4a-dfefacef807f" />

- 个人比赛结束（夺冠/退赛/淘汰/止步瑞士轮）后生成个人本场比赛战报

   <img width="20%" alt="b3ebfe7e9182c9d6272c58ce775fea0c" src="https://github.com/user-attachments/assets/f8cbd2ae-2457-4ae2-accc-f2658abeac0d" />

- 瑞士轮与淘汰赛过程记录

## 页面组成

### 0. 主页

<img width="1598" height="1163" alt="image" src="https://github.com/user-attachments/assets/40079de9-65a7-4d13-bd15-6a1f17eefb0e" />

路径：

```text
/
```

用途：

- 创建比赛
- 重命名或删除比赛
- 进入单场比赛后台
- 复制选手端与直播叠加层链接

### 1. 后台管理页

<img width="48%" alt="9db23c63095214fc6f1f6b920fb604b7" src="https://github.com/user-attachments/assets/36940de0-4a06-4884-8de9-1228a10d306e" />
<img width="48%" alt="1fa0fd0e84800e3b265950fd8a96de99" src="https://github.com/user-attachments/assets/925e794a-7872-4e8b-9cff-bd4ef447a61a" />
<img width="48%" alt="7b1fe3cc82c40723908c8356811eb53a" src="https://github.com/user-attachments/assets/7b1fe3cc82c40723908c8356811eb53a" />
<img width="48%" alt="9e52f9a95489344e06d3365a546434e7" src="https://github.com/user-attachments/assets/7676ad6f-c6fb-4ab7-90a3-20c0549f9376" />

路径：

```text
/t/<tournamentId>/admin
```

用途：

- 管理比赛
- 管理选手
- 管理轮次
- 录入结果
- 预览叠加层
- 生成战报

### 2. 直播叠加层

<img width="48%" alt="63fdc6d2103c6c3eea4dff7cee980d54" src="https://github.com/user-attachments/assets/872f54ca-6444-4357-98b9-92be58d93ffd" />
<img width="48%" alt="17661dc3368ace4f0a3a295cc4be86da" src="https://github.com/user-attachments/assets/1d36aeb7-8f91-4b9e-b290-fba2eb1874aa" />
<img width="48%" alt="4db845f08c3fcb9ed0f86f9c082b53d7" src="https://github.com/user-attachments/assets/91a9801e-1c5d-4392-a5f0-93b021715eab" />
<img width="48%" alt="d0bf62aa570a61bb13e4887b1a0c3d9b" src="https://github.com/user-attachments/assets/714afa6e-13a2-44e4-9724-92f1dc738417" />

路径：

```text
/t/<tournamentId>/overlay
```

用途：

- 在 OBS 中作为浏览器源接入
- 展示直播桌信息
- 展示赛事概况
- 展示 Top 8 对阵图

### 3. 选手端页面

<img width="24%" alt="6fd5c6c946f36c5d603eb69007a363f3" src="https://github.com/user-attachments/assets/459c4488-be7a-4555-ba20-a4fd29c77994" />
<img width="24%" alt="e1f19c336a7d36595f8cf785d24385d7" src="https://github.com/user-attachments/assets/5d651856-cb23-4ce5-8a21-e51f90bdd7af" />
<img width="24%" alt="6950d5353197098fce891d8717221347" src="https://github.com/user-attachments/assets/bdfe0a30-5c33-44da-91e4-e54e8d769864" />
<img width="24%" alt="d4a4a63033ab082f7b9a856fbd90c1b5" src="https://github.com/user-attachments/assets/1da1c121-dad0-40c1-84a9-434d56bde1f2" />

路径：

```text
/t/<tournamentId>/player-login
```

用途：

- 扫码进入比赛
- 报名 / 登录
- 查看本轮对局信息
- 查看历史记录
- 提交胜利

### 4. 选手中心

路径：

```text
/player/
```

用途：

- 平时通过手机主屏幕图标或固定入口进入选手中心
- 使用现有轻量名称确认方式登录选手档案
- 查看当前比赛、可报名比赛和历史战报入口
- iOS Safari 和 Android Chrome 可添加到手机主屏幕

## 项目结构

- `src/`
  服务端主逻辑
- `public/admin/`
  后台管理页面
- `public/overlay/`
  直播叠加层页面
- `public/player/`
  选手端页面
- `public/player-center/`
  独立选手中心与手机主屏幕入口
- `public/shared/`
  公共样式、二维码脚本、字体资源
- `data/`
  本地比赛数据与战报目录

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Python 战报依赖

项目导出战报时需要 Python 和 `reportlab`：

```bash
pip install reportlab
```

### 3. 启动服务

```bash
npm start
```

默认端口：

```text
18765
```

启动后可访问：

- 主页：`/`
- 后台：`/t/<tournamentId>/admin`
- 叠加层：`/t/<tournamentId>/overlay`
- 选手端：`/t/<tournamentId>/player-login`
- 选手中心：`/player/`

示例：

- `http://localhost:18765/`
- `http://localhost:18765/t/t_123456/admin`
- `http://localhost:18765/t/t_123456/overlay`
- `http://localhost:18765/t/t_123456/player-login`
- `http://localhost:18765/player/`

旧入口 `/admin`、`/overlay`、`/player-login` 会统一跳回主页。`/player` 与 `/player/` 是正式选手中心入口。

## Docker 部署

### Docker Hub 镜像

```bash
docker pull ddrsama/pokemon-tournament-system:latest
```

也可以拉取 beta：

```bash
docker pull ddrsama/pokemon-tournament-system:beta
```

也可以指定具体版本：

```bash
docker pull ddrsama/pokemon-tournament-system:3.3.1
```

### 本地开发用 Docker Compose

当前仓库根目录的 `docker-compose.yml` 默认用于本地开发快照构建：

```bash
docker compose up -d --build
```

这会直接使用当前工作区源码构建镜像。

### 部署稳定版 Docker Compose

如果要部署 Docker Hub 上的稳定版镜像：

```bash
docker compose -f docker-compose.deploy.yml up -d
```

如果要锁定某个具体稳定版本，也可以显式指定：

```bash
PTS_TAG=3.3.1 docker compose -f docker-compose.deploy.yml up -d
```

### 部署 Beta Docker Compose

如果要部署 Docker Hub 上的 beta 镜像：

```bash
docker compose -f docker-compose.deploy.yml -f docker-compose.deploy.beta.yml up -d
```

默认端口：

```text
18765:18765
```

Docker Compose 默认将数据持久化到项目目录下的 `./data`：

- `./data/tournaments`
- `./data/players`
- `./data/leagues`
- `./data/points`
- `./data/fonts`
- `./data/reports`

## GitHub 与 Docker 发布

当前仓库已支持两条发布通道：

- GitHub Release 正式版：
  发布正式 release 时，会推送 `x.y.z` 和 `latest`
- GitHub Release 预发布版：
  发布 pre-release 时，会推送 `x.y.z-beta` 和 `beta`
- GitHub Actions 手动触发：
  可以手动触发 Docker 工作流，额外推送一次 beta 镜像

推荐发布方式：

- 稳定版：在 GitHub 上发正式 release
- Beta：在 GitHub 上发 pre-release，或手动触发 `Build and Push Docker Image`

## 环境变量

可选环境变量如下：

- `PORT`
  服务端口，默认 `18765`
- `PUBLIC_BASE_URL`
  对外访问地址，用于生成二维码与选手端链接
- `DATA_ROOT`
  数据根目录，Docker 中默认 `/data`
- `DATA_DIR`
  比赛数据目录
- `PLAYERS_DIR`
  选手档案目录
- `LEAGUES_DIR`
  联赛目录
- `POINTS_DIR`
  积分方案目录
- `FONTS_DIR`
  私有字体目录
- `REPORTS_DIR`
  战报输出目录
- `PYTHON_BIN`
  Python 可执行文件路径，Docker 中默认为 `/usr/local/bin/python`

## 字体与战报

项目默认内置可再分发的开源字体资源：

- `public/shared/fonts/InterVariable.woff2`
- `public/shared/fonts/NotoSansSC-VF.ttf`
- `public/shared/fonts/NotoSansJP-VF.ttf`
- `public/shared/fonts/NotoSansSC-Medium.ttf`
- `public/shared/fonts/NotoSansJP-Medium.ttf`

如需在自用部署中使用已授权的私有字体，推荐按语言放入数据目录的 `fonts` 子目录：

- 中文：`/data/fonts/zh`
- 英文：`/data/fonts/en`
- 日文：`/data/fonts/ja`

网页界面会在切换语言时全局切换到对应语言字体，日文界面中的汉字也会优先使用日文字体。为兼容旧部署，直接放在 `/data/fonts` 根目录的字体仍会按文件名自动识别，但只建议作为过渡方案。PDF 战报由服务端生成并嵌入字体，会按当前界面语言优先尝试对应语言目录中可被 `reportlab` 注册的字体，再回退到项目内置的 Noto Sans SC/JP Medium 静态 TTF 战报字体，不依赖查看设备本地字体。私有字体授权由部署者自行确认，不会打包进公开镜像。

Docker 镜像中已包含中文字体与 `reportlab` 运行环境。

## 路线图

后续版本计划请查看 [ROADMAP.md](./ROADMAP.md)。

## 适用场景

- 局域网桌面管理
- Docker 部署
- OBS 直播叠加层接入
- 选手手机扫码查看对局信息

## 开发说明

本项目在开发过程中使用了 Codex 进行协作开发与迭代整理。
项目中许多流程、联调、测试与修复工作都在与 GPT-5.5 的配合下完成。

## 致谢

特别感谢 [ssccinng](https://github.com/ssccinng) 的慷慨赞助与支持。
