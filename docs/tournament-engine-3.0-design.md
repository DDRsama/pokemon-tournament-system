# PTS 3.0 赛事引擎设计草案

> 状态：第一版草案。
>
> 这份文档一定还会继续补充、推翻和修正。PTS 3.0 的目标已经不是在现有流程上加几个选项，而是重制赛事底层逻辑。实现前必须先把概念、边界、兼容策略和未知问题整理清楚。

## 1. 版本定位

PTS 当前版本本质上是一套非常具体、非常好用的 VGC 社群赛流程：

```text
报名 -> 瑞士轮 -> Top 8 单败淘汰 -> 叠加层 / 战报
```

PTS 3.0 的目标是把这条固定流程升级为可配置的赛事引擎。

核心方向：

- 继续以宝可梦 VGC 社群赛事为主轴。
- 兼容 PTCG、游戏王等其他赛事，但不让它们反过来带歪 VGC 主模型。
- 借鉴官方赛事体系中的有用结构，例如联赛、赛事等级、积分表、总决赛资格。
- 不碰瓷官方赛事，不声明官方 CP、官方资格、官方赛事身份或官方品牌。

## 2. 本版本不是在做什么

- 不是 overlay 视觉重绘版本。
- 不是主题系统版本。
- 不是语言系统版本。
- 不是官方 CP 模拟器。
- 不是官方赛事规则复刻器。
- 不是先做选手端和 overlay，再倒逼底层数据。

3.0 的核心是赛事引擎。选手端、overlay、战报都应该在底层模型稳定后再适配。

## 3. 当前系统已有能力

当前 PTS 已经不是从零开始，它已经有很多可迁移的能力：

- 单场比赛创建、重命名、删除、加载。
- 选手报名、登录、添加、删除。
- 瑞士轮配对。
- 瑞士轮开始时按当前参赛人数自动生成计划轮数；后台可在每轮结束后继续追加或结束资格赛，后台不再修改核心赛制。
- BYE / 轮空处理。
- 瑞士轮平局。
- 退赛处理。
- 当前轮未完成时禁止进入下一轮。
- 瑞士轮回退快照。
- 排名、小分、OMW、OOW、head-to-head。
- 固定 Top 8。
- 固定单败淘汰。
- 固定 Top 8 BO3。
- 决赛、季军赛、领奖台。
- 直播桌选择。
- overlay 展示。
- 选手端查看自己对局。
- 全场战报和个人战报。
- 本地 JSON 存储和旧状态恢复。

问题是：这些能力大多被绑在一条固定流程里。

3.0 要做的是把这些能力从固定流程中抽出来，变成可组合、可配置、可扩展的赛事底层。

## 4. 核心概念

### 4.1 比赛 Tournament

`Tournament` 是一场实际可进行的比赛。

例子：

- 一场普通月赛。
- 一场会被某个联赛纳入积分计算的普通比赛。
- 一场联赛总决赛。
- 一场线上预选赛。
- 一场娱乐赛或边赛。

一场比赛可以独立存在，也可以为联赛贡献积分。

### 4.2 联赛 League

`League` 是跨多场比赛的长期结构。

它可以：

- 定义积分规则。
- 读取若干场比赛的结果。
- 生成排行榜。
- 设置最佳 N 场成绩限制。
- 根据排行榜产生总决赛资格。
- 关联一场或多场总决赛。

重要判断：

**联赛本身通常不是一场比赛。**

联赛更像容器和计算器。它可以有一场实体总决赛，但总决赛本身仍然应该是一场 `Tournament`。

关系可以理解为：

```text
联赛
  -> 绑定若干比赛和积分规则
  -> 计算联赛排行榜
  -> 可选生成或关联总决赛 Tournament
```

### 4.3 联赛比赛绑定 League Tournament Binding

比赛本身不再声明“是否计分”，也不直接挂积分规则。

当前确认的模型是：

- 比赛只负责产出本场阶段结果和最终排名。
- 积分规则只负责把比赛排名转换为积分。
- 联赛通过绑定记录选择读取哪些比赛，并为每个绑定指定积分规则。
- 同一场比赛可以被多个联赛读取，每个联赛可以使用不同积分规则。

这样可以支持：

- 完全独立的普通比赛。
- 被某个联赛纳入积分计算的比赛。
- 同一场比赛被多个排行榜读取，且规则不同。

### 4.4 阶段 Stage

`Stage` 是一场比赛里的一个阶段。

当前 PTS 隐含了两个阶段：

- 瑞士轮阶段。
- Top 8 单败淘汰阶段。

3.0 应该把阶段显式化。

一个阶段至少需要描述：

- 这个阶段是干什么的。
- 这个阶段用什么赛制。
- 这个阶段的 BO 数、是否允许平局、计分方式。
- 谁进入这个阶段。
- 这个阶段输出什么结果。

### 4.5 阶段角色 Stage Role

阶段角色描述“这个阶段的目的”。

可能的角色：

- `registration`：报名。
- `qualification`：晋级筛选。
- `finals`：决出冠军和最终名次。
- `placement`：排定位次。
- `points`：产生积分。
- `exhibition`：娱乐展示，不计入正式排名。

当前系统的瑞士轮更准确地说是：

```text
stage.role = qualification
stage.type = swiss
```

也就是说，瑞士轮不是“晋级阶段”本身，而是“承担晋级筛选职责的一种赛制”。

### 4.6 阶段赛制 Stage Type

阶段赛制描述“这个阶段怎么打”。

候选赛制：

- `swiss`：瑞士轮。
- `groups`：小组赛。
- `round_robin`：循环赛。
- `single_elimination`：单败淘汰。
- `double_elimination`：双败淘汰。
- `manual_ranking`：手动排名。

瑞士轮、小组赛、循环赛都可以承担晋级筛选职责。单败和双败通常用于决赛阶段，但也可以用于某些预选结构。

### 4.7 参赛单位 Entrant

`Entrant` 是进入比赛的单位。

可能类型：

- `player`：个人选手。
- `team`：队伍。

当前 PTS 中，参赛单位等于选手。3.0 需要至少在模型层预留团队赛。

团队赛不一定在第一阶段完成全部队伍报名、成员审核、队伍锁定流程，但底层不能再写死“参赛单位一定是个人”。

### 4.8 选手池 / 选手档案 / 账号绑定

如果 3.0 要支持联赛积分、联赛排行榜、最佳 N 场成绩和总决赛资格，就必须有一个跨比赛稳定的选手身份层。

这意味着服务器端需要有一个全局选手池，而不是只在单场比赛里临时记名字。

建议拆成三层：

- `Player Profile`：长期存在的选手档案。
- `Tournament Entrant`：某一场比赛里的参赛记录。
- `Auth / Binding`：把外部账号、扫码验证、旧选手记录绑定到档案上的方式。

关键判断：

- 选手可以不注册就参加普通比赛。
- 选手也可以不注册就参加被联赛纳入的比赛，但那场比赛只产出本场结果，不写入联赛积分。
- 一旦需要联赛积分、联赛排行、跨赛事实绩，就需要能识别同一个人是不是同一个档案。
- 因此 3.0 需要支持“先临时参赛，后绑定档案”的路径。

换句话说：

- 普通比赛可以继续用临时身份。
- 被联赛纳入的比赛可以允许临时身份参赛，但临时身份不进入联赛积分。
- 长期统计必须依赖服务器端选手档案。
- 未来账号系统上线后，必须能把旧的临时参赛记录和旧注册选手绑定到新账号上。

这个层级非常重要，不能只把“扫码登录”理解成“当前比赛入口”。
它未来应该演进成真正的选手个人页 + 轻量验证 + 账号绑定体系。

## 5. 数据模型方向

以下不是最终 schema，只是第一版目标形状。

### 5.1 比赛设置 tournamentSettings

```js
{
  schemaVersion: 3,
  tournamentSettings: {
    presetId: "vgc_swiss_top_cut",
    game: "vgc",
    entrantType: "player",
    stages: []
  }
}
```

字段含义：

- `game`：`vgc`、`tcg`、`go`、`unite`、`custom`。
- `entrantType`：`player` 或 `team`。
- `presetId`：创建比赛时使用的规则模板。
- `stages`：阶段配置列表。
- 联赛、积分规则和最佳计分场次不属于单场比赛设置；它们在 `League` 的比赛绑定中设置。

### 5.2 瑞士轮阶段配置

```js
{
  id: "stage_swiss_1",
  role: "qualification",
  type: "swiss",
  name: "瑞士轮阶段",
  entrySource: {
    type: "all_entrants"
  },
  matchRules: {
    bestOf: 1,
    allowDraw: true,
    scoreMode: "match"
  },
  swiss: {
    rounds: 5,
    pairingMethod: "swiss",
    byePolicy: "avoid_repeat"
  },
  advancement: {
    mode: "top_cut",
    count: 8,
    targetStageId: "stage_top_cut_1"
  }
}
```

### 5.3 单败淘汰阶段配置

```js
{
  id: "stage_top_cut_1",
  role: "finals",
  type: "single_elimination",
  name: "淘汰赛阶段",
  entrySource: {
    type: "previous_stage_advancers",
    fromStageId: "stage_swiss_1"
  },
  matchRules: {
    bestOf: 3,
    allowDraw: false,
    scoreMode: "games"
  },
  elimination: {
    bracketSize: 8,
    bronzeMatch: true,
    seeding: "rank_order"
  }
}
```

### 5.4 小组赛阶段配置

```js
{
  id: "stage_groups_1",
  role: "qualification",
  type: "groups",
  name: "小组赛阶段",
  entrySource: {
    type: "all_entrants"
  },
  matchRules: {
    bestOf: 1,
    allowDraw: true,
    scoreMode: "match"
  },
  groups: {
    groupCount: 4,
    assignment: "manual_or_seeded",
    format: "round_robin",
    advancePerGroup: 2
  },
  advancement: {
    mode: "per_group",
    targetStageId: "stage_top_cut_1"
  }
}
```

### 5.5 双败淘汰阶段配置

双败淘汰是大功能，需要非常谨慎。

```js
{
  id: "stage_double_elim_1",
  role: "finals",
  type: "double_elimination",
  name: "双败淘汰阶段",
  matchRules: {
    bestOf: 3,
    allowDraw: false,
    scoreMode: "games"
  },
  doubleElimination: {
    bracketSize: 8,
    grandFinalReset: true,
    seeding: "rank_order"
  }
}
```

待确认：

- 总决赛是否需要 bracket reset。
- 3.0 是否必须完整支持双败推进。
- overlay 是否需要在 3.0 展示完整双败图。
- 是否可以先做数据模型，后做完整可视化。
- 是否允许 3.0 先做模型层，再后补完整双败 bracket UI。

### 5.6 选手档案和报名记录

选手档案不要只存在于单场比赛 JSON 里。

建议建立全局选手数据：

```js
{
  id: "pl_123456",
  displayName: "DDR",
  aliases: ["DDR", "DDrama"],
  bindings: [
    {
      type: "scan_code",
      value: "player-login-token-xxx"
    }
  ],
  stats: {
    tournamentsPlayed: 12,
    rankedTournamentsPlayed: 7,
    leaguePoints: 84
  }
}
```

单场比赛里的报名记录应当只保存“这次参赛是谁”：

```js
{
  id: "entry_1",
  tournamentId: "t_20260615_xxx",
  profileId: "pl_123456",
  displayName: "DDR",
  entryType: "registered",
  source: "manual_or_scan",
  rankedEligible: true
}
```

如果没有绑定档案，则可以是：

```js
{
  id: "entry_2",
  tournamentId: "t_20260615_xxx",
  profileId: null,
  displayName: "临时选手A",
  entryType: "guest",
  source: "scan_only",
  rankedEligible: false
}
```

这类临时参赛者可以正常打比赛，也可以拿本场赛事奖品和本场名次。
但如果比赛被联赛纳入积分计算，且该选手没有绑定档案，那么这次结果不进入联赛积分。

未来完整账号系统上线后，需要能把这些 `guest` 或旧版 `playerProfiles` 合并到正式 `Player Profile` 中。

## 6. 对局和结果模型

当前 PTS 已经有：

- `winner`
- `done`
- `draw`
- `p1Wins`
- `p2Wins`

3.0 应该演进成更通用的结果模型。

建议方向：

```js
{
  id: "stage_swiss_1-r1-m1",
  stageId: "stage_swiss_1",
  round: 1,
  table: 1,
  entrantA: "player_a",
  entrantB: "player_b",
  status: "pending",
  result: {
    type: "normal",
    winner: null,
    draw: false,
    aGameWins: 0,
    bGameWins: 0,
    aMatchPoints: 0,
    bMatchPoints: 0,
    reportedBy: null,
    decidedBy: null,
    reason: null
  },
  live: {
    wasLive: false,
    roomCode: null
  }
}
```

结果类型需要支持或预留：

- `normal`：正常完成。
- `draw`：平局。
- `bye`：轮空。
- `forfeit`：弃权。
- `drop`：退赛。
- `judge_decision`：裁判判定。
- `no_show`：未到场。
- `reset`：重赛或重置。

BO 逻辑应通用化：

```text
BO1 -> 先到 1 胜
BO3 -> 先到 2 胜
BO5 -> 先到 3 胜
BO N -> 先到 floor(N / 2) + 1 胜
```

瑞士轮默认可以继续 BO1。Top Cut 默认可以继续 BO3。

## 7. 排名与晋级

每个阶段都应该输出标准结果：

```js
{
  stageId: "stage_swiss_1",
  standings: [],
  advancers: [],
  eliminated: [],
  completed: true
}
```

当前瑞士轮排名逻辑应保留：

- 积分。
- 胜 / 平 / 负。
- OMW。
- OOW。
- head-to-head。
- 名字排序兜底。

新增排名需求：

- 小组内排名。
- 跨组排名。
- 晋级前手动调整名单。
- Top 2 / Top 4 / Top 8 / Top 16 / 自定义 Top Cut。
- 决赛阶段最终名次输出。

关键原则：

**晋级是阶段输出，不是写死的 Swiss -> Top 8。**

## 8. 联赛积分

PTS 应该使用官方体系启发的结构，但不使用官方身份。

建议社区模型：

```js
{
  id: "league_2026_spring",
  name: "2026 春季联赛",
  game: "vgc",
  divisions: ["open"],
  regions: [],
  tournamentBindings: [
    {
      tournamentId: "t_monthly_01",
      pointsProfileId: "profile_monthly_v1"
    }
  ],
  finalTournamentIds: []
}
```

### 8.1 积分规则 Points Profile

```js
{
  id: "profile_monthly_v1",
  name: "月赛积分规则",
  participationPoints: 1,
  placementPoints: [
    { rank: 1, points: 30 },
    { rank: 2, points: 24 },
    { rankMin: 3, rankMax: 4, points: 18 },
    { rankMin: 5, rankMax: 8, points: 12 }
  ],
  eventTierMultiplier: 1
}
```

可支持或预留：

- 参赛积分。
- 名次积分。
- 阶段奖励积分。
- 赛事等级倍率。
- 最佳 N 场成绩应放在联赛规则或联赛比赛绑定聚合规则中，不放在单场积分规则里。
- 手动加分或扣分。
- 个人积分和团队积分。

### 8.2 联赛总决赛

联赛可以产生总决赛：

```text
常规比赛 -> 联赛按绑定关系计算排行榜 -> 前 N 名晋级 -> 总决赛 Tournament
```

总决赛仍然是一场普通 `Tournament`，只是和 `League` 有关系。

## 9. 规则模板 Presets

用户不应该每次从零搭建阶段。3.0 需要规则模板。

首批模板：

- `current_pts_default`：当前 PTS 默认流程，瑞士轮 + Top 8 单败，瑞士轮 BO1，Top Cut BO3。
- `swiss_only`：纯瑞士轮，以排名决定最终名次。
- `swiss_top4`：瑞士轮 + Top 4 单败。
- `groups_top_cut`：小组赛 + 单败淘汰。
- `single_elimination`：纯单败淘汰。
- `league_ready_event`：适合被联赛纳入积分计算的单场比赛模板。

未来模板：

- 双败淘汰。
- 团队赛。
- 线上预选进入总决赛。
- 联赛总决赛。

## 10. 旧数据迁移

旧比赛必须能继续打开。

默认迁移：

```text
旧 setup / swiss / swiss-ended / top8 状态
  -> schemaVersion 3
  -> tournamentSettings preset current_pts_default
  -> stage_swiss_1
  -> stage_top_cut_1
```

兼容原则：

- 尽量保留旧 API 行为。
- 迁移期间保留旧字段，不要立刻删除。
- 先添加新字段和适配器。
- overlay 和选手端先吃兼容 view model。
- 等底层稳定后，再逐步移除历史兼容层。

可能需要的迁移函数：

- `normalizeTournamentSettings(state)`
- `buildDefaultStagesForLegacyState(state)`
- `getActiveStage(state)`
- `getStageMatches(state, stageId)`
- `buildStageViewModel(state, stageId)`

## 11. 后端结构方向

可能新增核心模块：

```text
src/core/rules.js
src/core/stages.js
src/core/matches.js
src/core/advancement.js
src/core/players.js
src/core/entrants.js
src/core/league.js
src/core/points.js
src/core/migrations.js
```

现有模块不要马上推倒重写，而是逐步包装：

- `swiss.js` 变成 `stage.type = swiss` 的实现。
- `top8.js` 变成 `stage.type = single_elimination` 的第一版实现。
- `standings.js` 保留瑞士轮排名能力，再扩展为阶段排名工具。
- `reportsData.js` 逐渐改为消费标准阶段输出。
- `playerView.js` 逐渐改为消费阶段 view model。

## 12. 后台、选手端、overlay 策略

3.0 不只是引擎重构，UI 也会跟着变。
首页、后台、选手页、overlay 都不能再假设系统只有“单场比赛入口”这一层。

### 12.1 后台

3.0 后台至少需要：

- 从规则模板创建比赛。
- 显示比赛规则。
- 显示阶段列表和当前阶段。
- 启动当前阶段。
- 完成当前阶段。
- 进入下一阶段。
- 查看晋级名单。
- 创建联赛。
- 查看联赛排行榜。
- 管理服务器端选手池。
- 将本场临时选手绑定到已有选手档案。
- 合并重复选手档案。
- 锁定比赛开始后不应修改的关键规则。

### 12.2 选手端

选手端应跟随当前阶段：

- 显示当前阶段。
- 显示当前对局。
- 显示 BO 小局比分。
- 显示阶段相关排名。
- 未来显示队伍信息、联赛积分和联赛排名。

选手端还应从“单场比赛入口页”升级为“选手个人页”的雏形：

- 查看本人参与过的历史比赛。
- 查看本人的本场和联赛积分。
- 查看本人的胜负战绩。
- 查看绑定状态。
- 查看本人在不同联赛中的排名。

这意味着选手页不应只作为“扫码进入某场比赛”的入口，而应逐步变成“选手本人在系统里的长期主页”。

### 12.3 Overlay

3.0 不重绘 overlay。

overlay 先通过兼容 view model 接入：

- 瑞士轮阶段继续使用现有瑞士轮画面。
- 单败 Top Cut 尽量继续使用现有 Top 8 画面。
- 未识别阶段可以显示安全的通用待机 / 排名 / 直播桌画面。

完整 overlay 组件化放到后续 3.0 之后的开发版本。

### 12.4 首页

首页不应继续只围绕“新建比赛”设计。

它需要开始支持：

- 新建比赛。
- 新建联赛。
- 浏览比赛和联赛列表。
- 查看哪些比赛已被联赛绑定。
- 查看选手档案入口。
- 查看当前联赛积分概览。

首页的主要职责会从“比赛入口页”扩展为“赛事中心首页”。

### 12.5 后台主界面

后台主界面也不能只围绕单场赛事操作。

它需要分层显示：

- 当前比赛。
- 当前阶段。
- 比赛规则。
- 联赛关联。
- 选手池 / 报名池。
- 积分产出。
- 历史比赛关联。

后台的结构更像“赛事运营控制台”，而不是单纯的“瑞士轮操作面板”。

### 12.6 直播桌叠加层

overlay 也要改，但不是先重绘风格，而是先改它能理解的数据结构。

它至少要能消费：

- 当前阶段类型。
- 当前阶段角色。
- 当前比赛是否已被联赛绑定。
- 当前对局是否属于某个联赛积分来源。
- 选手档案信息。
- 阶段排名和晋级信息。

换句话说，overlay 未来不只是展示“这场比赛正在打什么桌”，还要能展示“这场比赛属于什么体系、当前结果有什么长期意义”。

## 13. 战报与导出

战报最终应该阶段化。

战报内容：

- 比赛规则摘要。
- 阶段列表。
- 每个阶段的排名。
- 每个阶段的对局记录。
- 最终名次。
- 如果比赛已被联赛绑定，展示积分产出。
- 个人或队伍战报。
- 联赛总榜导出。

旧战报先保持可用，再逐步扩展。

## 14. 测试清单

核心测试：

- 比赛规则默认值。
- 旧数据迁移。
- 规则模板生成。
- BO1 / BO3 / BO5 结算。
- 瑞士轮作为阶段运行。
- 单败淘汰作为阶段运行。
- 创建比赛时配置 Top Cut 人数。
- 从晋级阶段进入决赛阶段。
- 小组赛排名。
- 循环赛排名。
- 双败 bracket 生成和推进。
- 联赛绑定比赛后的积分计算。
- 最佳 N 场成绩。
- 联赛排行榜。
- 总决赛资格名单。
- 选手档案创建和恢复。
- 临时选手不产生联赛积分。
- 临时选手赛后绑定档案。
- 旧版 playerProfiles 迁移。
- 首页比赛 / 联赛列表 view model。
- 后台阶段控制 view model。
- overlay 阶段兼容 view model。
- 选手端兼容。
- 战报数据兼容。

## 15. 目前已知未知问题

### 15.1 比赛结构

- 一场比赛是否允许多个晋级筛选阶段？
- 是否允许多个决赛 bracket？
- 是否需要支持季军赛以外的更多排位赛？
- 是否需要纯手动阶段？

### 15.2 联赛结构

- 一场比赛是否可以计入多个联赛？
- 联赛读取比赛是手动选择，还是通过标签自动读取？
- 总决赛本身是否也能给联赛积分？
- 联赛是否需要同时支持个人榜和团队榜？

### 15.3 积分规则

- PTS 第一版社区积分表应该长什么样？
- 积分只看最终名次，还是也看阶段表现？
- 参赛积分是否要求至少完成一场对局？
- 退赛如何影响积分？

### 15.4 团队赛

- 队伍是一个参赛单位，还是一个更高层结构？
- 队员是否允许比赛开始后变更？
- 一场团队对局是否包含多个个人对局？
- 团队 BO 和个人 BO 是否分离？

### 15.5 选手身份

- 3.0 是否要做完整账号密码系统，还是先做轻量选手档案和验证？
- 选手档案是否允许选手自助创建？
- 选手档案是否必须由主办方审核？
- 同名选手如何处理？
- 临时选手赛后绑定到档案时，是否回溯计算积分？
- 如果一个临时选手参加了被联赛纳入的比赛但赛后才绑定档案，这场比赛是否补发积分？
- 未来接入完整账号系统时，旧选手档案如何绑定到账号？

### 15.6 双败淘汰

- 3.0 是否必须完整支持双败？
- 是否支持 bracket reset？
- 当前 overlay 是否需要展示完整双败图？

### 15.7 用户体验

- 哪些规则创建后还能改？
- 哪些规则比赛开始后必须锁定？
- 高级设置是否应该藏在模板后面？
- 主页是否拆成“新建比赛”和“新建联赛”？
- 选手入口是否拆成“比赛入口”和“个人主页”？
- 后台是否拆成“比赛后台”和“联赛后台”？
- overlay 是否需要显示联赛名、联赛绑定标记和阶段角色？

## 16. 草案实现顺序

这不是最终计划，只是第一版建议顺序。

1. 为当前 PTS 默认流程写设计 fixture 和测试。
2. 加入 `schemaVersion` 和 `tournamentSettings` 迁移。
3. 加入阶段配置模型，同时暂时保留旧 `phase`。
4. 把现有瑞士轮逻辑包装为阶段实现。
5. 把现有 Top 8 逻辑包装为单败淘汰阶段实现。
6. 通用化 BO 结果处理。
7. 支持创建比赛时配置 Top Cut 人数，并在开赛后锁定核心赛制。
8. 加入联赛比赛绑定和积分规则模型。
9. 加入联赛存储与排行榜计算。
10. 加入服务器端选手池、报名记录和临时身份模型。
11. 加入临时选手绑定到选手档案的流程。
12. 加入小组赛模型和实现。
13. 加入双败淘汰模型，并决定实现深度。
14. 适配后台创建和操作 UI。
15. 适配首页，让它能管理比赛、联赛和选手入口。
16. 适配选手端、选手个人页和战报数据。
17. 加入 overlay 兼容 view model。

## 17. 3.0 最小可发布边界

如果 3.0 太大，需要先定义最小可发布范围。

可能的最小 3.0：

- 当前默认流程迁移到阶段模型。
- 存在 `tournamentSettings`。
- BO 规则通用化。
- Top Cut 人数可在创建比赛时配置，开赛后不再从后台修改核心赛制。
- 联赛可以绑定比赛和积分规则，并读取比赛结果计算积分。
- 存在服务器端选手池。
- 临时选手可以参赛但不获得联赛积分。
- 临时选手可以赛后绑定到选手档案。
- 后台可以创建联赛，并在联赛中绑定比赛和积分规则。
- 首页能进入比赛、联赛和选手档案相关页面。
- 后台能显示阶段、规则、积分和选手池状态。
- overlay 能消费新阶段 view model。
- 选手端、overlay、战报保持兼容。

可能的扩展目标：

- 小组赛完整可玩。
- 团队赛基础能力。
- 双败淘汰完整可玩。
- 从联赛排行榜生成总决赛。

## 18. 给未来开发的提醒

- 不要让官方赛事术语变成官方身份声明。
- 产品中心仍然是 VGC 社群赛。
- 当前可用的瑞士轮 + Top 8 流程必须在迁移期间保持可用。
- 优先做适配器和 view model，不要一口气把所有前端打碎。
- 这份文档一定会反复修改。
