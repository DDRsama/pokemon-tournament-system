# Pokemon Tournament System

`Pokemon Tournament System`，简称 `PTS`，是一套面向宝可梦线下赛事的管理系统。  
它最初以宝可梦 VGC 线下赛事为主要开发目标，但由于核心流程围绕瑞士轮、淘汰赛、直播桌管理与战报整理展开，因此同样适用于 PTCG、游戏王等采用瑞士轮结构的对战赛事。  
它将后台管理、直播叠加层、选手端页面、瑞士轮与淘汰赛流程、战报导出，以及 Docker 部署能力整合到同一套系统中，目标是尽可能覆盖一场比赛从报名到赛后整理的完整流程。

## 项目定位

PTS 并不是一个单纯的直播 overlay 页面，而是一套完整的赛事工具链，主要解决以下问题：

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

- 配置瑞士轮轮数
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

### 战报与记录

- 全场比赛结束后生成本场比赛战报
  <img width="50%" alt="3386c2e1e0e1c905a4c24a01d9caa24c" src="https://github.com/user-attachments/assets/2c6aeeb6-c28f-4c98-9f4a-dfefacef807f" />
- 个人比赛结束（夺冠/退赛/淘汰/止步瑞士轮）后生成个人本场比赛战报
  <img width="20%" alt="b3ebfe7e9182c9d6272c58ce775fea0c" src="https://github.com/user-attachments/assets/f8cbd2ae-2457-4ae2-accc-f2658abeac0d" />
- 瑞士轮与淘汰赛过程记录

## 页面组成

### 1. 后台管理页
<img width="48%" alt="9db23c63095214fc6f1f6b920fb604b7" src="https://github.com/user-attachments/assets/36940de0-4a06-4884-8de9-1228a10d306e" />
<img width="48%" alt="1fa0fd0e84800e3b265950fd8a96de99" src="https://github.com/user-attachments/assets/925e794a-7872-4e8b-9cff-bd4ef447a61a" />
<img width="48%" alt="7b1fe3cc82c40723908c8356811eb53a" src="https://github.com/user-attachments/assets/3c1fd3e7-c616-4d7e-803b-84eab073fcd3" />
<img width="48%" alt="9e52f9a95489344e06d3365a546434e7" src="https://github.com/user-attachments/assets/7676ad6f-c6fb-4ab7-90a3-20c0549f9376" />



路径：

```text
/admin/
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
/overlay/
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
/player-login
```

用途：

- 扫码进入比赛
- 报名 / 登录
- 查看本轮对局信息
- 查看历史记录
- 提交胜利

## 项目结构

- `src/`
  服务端主逻辑
- `public/admin/`
  后台管理页面
- `public/overlay/`
  直播叠加层页面
- `public/player/`
  选手端页面
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

- 后台：`/admin/`
- 叠加层：`/overlay/`
- 选手端：`/player-login`

示例：

- `http://localhost:18765/admin/`
- `http://localhost:18765/overlay/`
- `http://localhost:18765/player-login`

## Docker 部署

### 启动

```bash
docker compose up -d --build
```

### 默认端口

```text
18765:18765
```

### 数据目录

Docker Compose 默认将数据持久化到项目目录下：

- `./data/tournaments`
- `./data/reports`

## 环境变量

可选环境变量如下：

- `PORT`
  服务端口，默认 `18765`
- `PUBLIC_BASE_URL`
  对外访问地址，用于生成二维码与选手端链接
- `DATA_DIR`
  比赛数据目录
- `REPORTS_DIR`
  战报输出目录
- `PYTHON_BIN`
  Python 可执行文件路径，默认使用 `python`

## 字体与战报

项目内置了界面字体资源：

- `public/shared/fonts/ud-shin-go-sc-r.ttf`

战报导出会优先尝试使用可用中文字体；Docker 镜像中已包含中文字体与 `reportlab` 运行环境。

## 适用场景

- 局域网桌面管理
- Docker 部署
- OBS 直播叠加层接入
- 选手手机扫码查看对局信息

## 开发说明

本项目在开发过程中使用了 Codex 进行协作开发与迭代整理。  
项目中许多流程、联调、测试与修复工作都在与 Codex 的配合下完成。

## 致谢

特别感谢 [ssccinng](https://github.com/ssccinng) 的慷慨赞助与支持。

## 发布说明

本仓库默认不包含：

- 实际比赛数据
- 导出 PDF
- `node_modules`
- 本地运行缓存

如需部署，请根据自己的环境设置 `PUBLIC_BASE_URL`。
