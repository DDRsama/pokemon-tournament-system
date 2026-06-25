# PTS 3.0 可执行开发目标

> 状态：第一版执行清单。
>
> 目的：把 `tournament-engine-3.0-design.md` 里的方向拆成可开发、可测试、可验收的具体部件。后续开发以本文为执行目标，设计文档用于解释概念和边界。

## 0. 3.0 总目标

PTS 3.0 要把当前固定的：

```text
单场比赛 -> 瑞士轮 -> Top 8 单败淘汰 -> BO3 淘汰赛 -> Overlay / 战报
```

升级为：

```text
选手池 / 临时选手
  -> 普通比赛 / 联赛总决赛
  -> 可配置赛事阶段
  -> 可配置比赛规则
  -> 联赛绑定比赛和积分规则后读取积分
  -> 主页、后台、选手页、Overlay、战报统一消费新模型
```

当前执行口径：

- 比赛只负责产出本场阶段结果和最终排名。
- 积分规则只负责把比赛排名转换为积分。
- 联赛通过绑定记录选择读取哪些比赛，并为每个绑定指定积分规则。

3.0 完成时必须满足：

- 旧的社群赛流程仍然可以直接使用，且旧存档可以迁移。
- 单场比赛可以配置所属游戏、个人赛 / 团队赛、阶段结构、BO 数、晋级规则。
- 阶段至少覆盖瑞士轮、小组循环赛、单败淘汰、双败淘汰的数据模型与后台配置。
- 瑞士轮 + 单败 Top Cut 必须完整可跑，并从固定 Top 8 BO3 改成通用阶段模型驱动。
- 小组赛、双败淘汰、团队赛必须有可执行的最小闭环，允许后续继续优化复杂展示。
- 可以建立全局选手池；临时选手可以参赛，但未绑定全局选手时不获得联赛积分。
- 可以建立联赛；联赛可以从指定比赛读取积分，并支持实体总决赛。
- 主页、后台、选手页、Overlay、战报都不再只理解“瑞士轮 + Top 8”这一种流程。

## 1. 当前已落地基础

这些内容已经进入 3.0 开发分支，可继续扩展：

- `package.json` 版本已切到 `3.0.0-beta`。
- 新增 `docs/tournament-engine-3.0-design.md` 作为设计草案。
- 新增 `schemaVersion = 3` 与默认赛事配置。
- 新增核心模块：
  - `src/core/presets.js`
  - `src/core/rules.js`
  - `src/core/migrations.js`
  - `src/core/stages.js`
  - `src/core/matches.js`
  - `src/core/entrants.js`
  - `src/core/players.js`
  - `src/core/points.js`
  - `src/core/leagues.js`
- `freshState` / `restoreState` / `serializeState` 已加入 3.0 字段迁移。
- `buildClientState()` 已输出 `tournamentSettings`、`stages`、`activeStage`、`globalPlayerProfiles`、`leagues`、`pointsProfiles`。
- 已新增全局选手、联赛、积分规则的基础存储目录与 API。
- 已新增 `/api/player-profiles`、`/api/leagues`、`/api/points-profiles` 和本场选手绑定接口。
- 已新增小组赛、双败淘汰、通用单败淘汰、阶段推进、阶段结果和积分发放核心逻辑。
- 后台已接入 3.0 基础驾驶舱：预设切换、个人赛 / 团队赛、阶段规则、选手档案绑定、联赛纳入和联赛榜单。
- 主页已支持创建不同赛制预设的比赛，并提供联赛创建和运营概览入口。
- 选手端已支持小组赛、双败淘汰、通用淘汰阶段的阶段显示和局分提交。
- Overlay 已支持小组赛、双败淘汰、通用阶段总览和基于 `stageResults` 的领奖台。
- 战报数据已支持非瑞士阶段和泛淘汰历史。
- 已新增核心测试、阶段路由测试、registry 路由测试、overlay router 测试和选手提交测试。

当前通过测试：

```text
node --test
79 passed
```

当前运行验证：

- 项目依赖已恢复。
- 已完成前端内联脚本语法检查。
- 已完成服务 smoke：默认瑞士轮 + Top Cut、小组赛 + 淘汰赛、联赛绑定比赛后的积分发放、联赛排行榜、总决赛资格、3.0 战报数据、主页 / 后台 / 选手页 / Overlay 页面响应。
- 已完成后台阶段编辑、BO 数保存、参赛者 PATCH、团队名单、选手档案绑定、长期选手页 summary、联赛榜 CSV 导出的接口验证。
- 已新增 PDF 报告渲染脚本编译测试，并完成实际 PDF 导出烟测。
- 积分规则已支持 `{ rank, points }` / 区间对象 / `[8, 4, 2]` 简写三种 placement 配置。
- 已新增小组赛完成后推进到缩放单败淘汰决赛的 HTTP 回归测试。

## 2. 数据模型落地目标

### 2.1 PlayerProfile：全局选手档案

用途：长期身份，不等于某一场比赛的报名记录。

字段目标：

- `id`
- `displayName`
- `aliases`
- `bindings`
- `stats`
- `createdAt`
- `updatedAt`

开发任务：

- 保留当前 `src/core/players.js` 的 profile 创建逻辑。
- 增加查重策略：同名、别名、未来账号绑定冲突时提示。
- 增加合并逻辑 UI 入口：把重复 profile 合并到主 profile。
- 增加绑定来源类型：`local_token`、`manual_admin`、`future_account`。

验收标准：

- 后台能创建全局选手。
- 后台能把本场选手绑定到全局选手。
- 同一全局选手能出现在多场比赛记录里。
- 未绑定选手参赛不报错，但不会计入联赛积分。

### 2.2 TournamentEntrant：本场参赛者

用途：某一场比赛中的报名实体。

字段目标：

- `id`
- `tournamentId`
- `profileId`
- `displayName`
- `entryType`: `registered` / `guest`
- `entrantType`: `player` / `team`
- `teamRoster`
- `source`
- `rankedEligible`

开发任务：

- 当前 `players[]` 和 `playerProfiles{}` 先兼容保留。
- 新增 `entrants[]` 作为 3.0 正式参赛者列表。
- 写迁移：旧存档的 `players[]` 自动转换为 guest entrants，同时保留旧字段给旧 UI 消费。
- 新报名流程写入 `entrants[]`，再同步旧 `players[]`。

验收标准：

- 旧 UI 不坏。
- 新后台能区分注册选手和临时选手。
- 联赛积分只给有 `profileId` 且具备积分资格的 entrant 发放。

### 2.3 TournamentSettings：比赛规则配置

用途：描述一场比赛怎么打。

字段目标：

- `presetId`
- `game`: 默认 `vgc`
- `entrantType`: `player` / `team`
- `stages[]`

开发任务：

- 继续使用 `src/core/rules.js` 做规范化。
- 增加 schema 校验函数，后台保存配置前必须验证。
- 增加 preset：
  - 当前 PTS 默认赛制：瑞士轮 + 单败 Top Cut。
  - 普通瑞士轮不淘汰。
  - 小组赛 + 单败淘汰。
  - 双败淘汰。
  - 联赛总决赛。

验收标准：

- 创建比赛时可以选择 preset 或自定义阶段结构。
- 创建阶段设置后能保存、重载、迁移；比赛进入非 setup 阶段后核心赛制由服务端锁定。
- 非法 BO 数自动修正为奇数。
- 阶段间晋级目标必须存在，否则保存失败。

### 2.4 Stage：赛事阶段

用途：把“瑞士轮”“小组赛”“淘汰赛”抽象成同一类可组合阶段。

通用字段：

- `id`
- `role`: `qualification` / `finals` / `side`
- `type`
- `name`
- `entrySource`
- `matchRules`
- `advancement`

阶段类型目标：

- `swiss`
- `group_round_robin`
- `single_elimination`
- `double_elimination`

验收标准：

- 后台能显示阶段列表、当前阶段、完成进度。
- 每个阶段都有自己的对局列表和完成状态。
- Overlay 和战报不再硬编码“Top 8 才是淘汰赛”。

### 2.5 MatchRules / MatchResult：对局规则与结果

字段目标：

- `bestOf`
- `winsRequired`
- `allowDraw`
- `scoreMode`: `match` / `games`
- `winner`
- `draw`
- `gameWins`
- `done`

开发任务：

- 用 `src/core/matches.js` 替换散落在旧代码里的 BO3 专用判断。
- `applyBo3Score` 保留为兼容入口，但内部走通用 `applyGameScoreToMatch`。
- 所有阶段都能读取自己的 `matchRules`。

验收标准：

- BO1、BO3、BO5 都能正确判定。
- BO3 旧接口继续可用。
- 瑞士轮允许平局，淘汰赛默认不允许平局。

### 2.6 League：联赛

用途：不是一场比赛，而是一组“比赛 + 积分规则”绑定、排行榜和总决赛资格规则。

字段目标：

- `id`
- `name`
- `game`
- `divisions`
- `regions`
- `pointsProfileId`
- `tournamentBindings[]`
- `finalTournamentIds`
- `bestFinishLimit`

开发任务：

- 联赛不强制拥有比赛；联赛通过绑定记录读取指定比赛的排名。
- 普通比赛不声明是否计分；同一场比赛可以被多个联赛读取。
- 每条联赛比赛绑定都可以选择自己的积分规则。
- 联赛可以设置实体总决赛，即 `finalTournamentIds`。
- 增加联赛排行榜 API。

验收标准：

- 能创建联赛。
- 能选择哪些比赛计入联赛，并为每场比赛选择积分规则。
- 能生成联赛排行榜。
- 能从排行榜生成总决赛资格名单。

### 2.7 PointsProfile / PointAward：积分规则与积分发放

用途：不要复刻官方 CP，而是提供自办赛事可用的积分规则。

字段目标：

- `id`
- `name`
- `participationPoints`
- `placementPoints`
- `eventTierMultiplier`

开发任务：

- 默认提供一套自办赛积分规则。
- 后台可创建积分规则。
- 比赛结束后生成 `PointAward[]`。
- 联赛排行榜按联赛比赛绑定读取比赛排名，再套用对应积分规则汇总。

验收标准：

- guest 不得分。
- registered entrant 得分。
- 不同名次、赛事倍率、best finish limit 生效。

## 3. 后端 API 落地计划

### 3.1 已有基础 API

- `GET /api/player-profiles`
- `POST /api/player-profiles`
- `POST /api/tournaments/:tournamentId/player-bindings`
- `GET /api/leagues`
- `POST /api/leagues`
- `GET /api/points-profiles`
- `POST /api/points-profiles`

### 3.2 必须新增 API

比赛设置：

- `GET /api/tournaments/:tournamentId/settings`
- `PUT /api/tournaments/:tournamentId/settings`
- `POST /api/tournaments/:tournamentId/settings/preset`

参赛者：

- `GET /api/tournaments/:tournamentId/entrants`
- `POST /api/tournaments/:tournamentId/entrants`
- `PATCH /api/tournaments/:tournamentId/entrants/:entrantId`
- `POST /api/tournaments/:tournamentId/entrants/:entrantId/bind-profile`

阶段：

- `GET /api/tournaments/:tournamentId/stages`
- `POST /api/tournaments/:tournamentId/stages/:stageId/start`
- `POST /api/tournaments/:tournamentId/stages/:stageId/generate-matches`
- `POST /api/tournaments/:tournamentId/stages/:stageId/complete`
- `POST /api/tournaments/:tournamentId/stages/:stageId/advance`

联赛：

- `GET /api/leagues/:leagueId`
- `PATCH /api/leagues/:leagueId`
- `GET /api/leagues/:leagueId/leaderboard`
- `POST /api/leagues/:leagueId/include-tournament`
- `POST /api/leagues/:leagueId/final-qualification`

积分：

- `POST /api/tournaments/:tournamentId/calculate-points`
- `GET /api/tournaments/:tournamentId/point-awards`

验收标准：

- 每个 API 都有错误返回和测试。
- 所有写操作保存 JSON 并广播状态。
- 旧 API 保持兼容，直到 UI 完全迁移。

## 4. 赛事执行引擎落地计划

### 4.1 Swiss Engine：瑞士轮

当前已有能力：

- 配对。
- BYE。
- 平局。
- 退赛。
- 小分排序。
- 回退。

必须改造：

- 瑞士轮 stage 不再保存固定轮数；开始阶段时按当前参赛人数生成计划轮数。
- 生成对局时写入 `stageId`。
- 当前轮、当前阶段、晋级名单都从 stage view model 生成。

验收标准：

- 当前默认赛制行为和旧版本一致。
- 瑞士轮每轮完成后，后台可继续追加一轮或结束资格赛生成排名。
- 瑞士轮结束后根据 stage.advancement 产生晋级名单。

### 4.2 Group Round Robin Engine：小组赛

开发任务：

- 分组策略：手动分组、随机分组、按种子蛇形分组。
- 组内循环赛生成。
- 组内排名。
- 每组晋级 N 人。
- 支持小组内同分排序规则。

验收标准：

- 可以创建 2 个或更多小组。
- 可以生成组内循环对局。
- 可以从每组晋级指定人数到下一阶段。

### 4.3 Single Elimination Engine：单败淘汰

当前已有能力：

- 固定 Top 8。
- 四分之一、半决赛、决赛、季军赛。
- BO3 分数。

必须改造：

- bracketSize 不再固定 8。
- 支持 Top 4、Top 8、Top 16。
- BO 数读取 stage.matchRules。
- 是否季军赛读取 stage.elimination.bronzeMatch。
- 对局写入 `stageId`。

验收标准：

- 旧 Top 8 BO3 完整可跑。
- Top 4 / Top 16 能生成合法 bracket。
- BO5 淘汰赛能正确结束。

### 4.4 Double Elimination Engine：双败淘汰

开发任务：

- 建立 winners bracket / losers bracket / grand final 数据结构。
- 选手第一败进入败者组，第二败淘汰。
- 总决赛支持：
  - `single_final`
  - `if_needed_reset`
- Overlay 先显示简化 bracket，后台优先保证可运行。

验收标准：

- 4 人、8 人双败能跑完。
- 每个 entrant 第二败后淘汰。
- 冠军产生逻辑正确。

### 4.5 Team Event：团队赛

开发任务：

- `entrantType = team`。
- Team entrant 支持队伍名和队员列表。
- 排名、对阵、Overlay 先以队伍为主体展示。
- 个人队员战绩先作为扩展字段，不强制进入 3.0 首版统计。

验收标准：

- 后台能创建队伍参赛者。
- 瑞士轮 / 淘汰赛可以以队伍为单位运行。
- Overlay、战报显示队伍名，不显示为单人选手错误。

## 5. 前端落地计划

### 5.1 Home：主页 / 赛事中心

必须修改：

- 主页从“比赛列表”升级为“赛事中心”。
- 增加 tabs：
  - 比赛
  - 联赛
  - 全局选手
  - 积分规则
- 新建比赛时配置比赛自身规则；积分规则在联赛绑定比赛时选择。
- 新建联赛入口不创建实体比赛，只创建 league。

验收标准：

- 用户能从主页创建比赛、联赛、选手、积分规则。
- 首页清楚区分“比赛”和“联赛”。
- 不破坏旧比赛列表加载。

### 5.2 Admin：后台 / 比赛操作台

必须修改：

- 增加比赛设置页：
  - 游戏类型。
  - 个人赛 / 团队赛。
  - 阶段 preset。
- 增加阶段编辑器：
  - 添加 / 删除阶段。
  - 设置阶段类型。
  - 设置 BO 数。
  - 设置晋级规则。
- 增加参赛者页：
  - guest / registered 标记。
  - 绑定全局选手。
  - 队伍成员管理。
- 改造对局录入：
  - 从 matchRules 判断胜场数。
  - 不再写死 BO3。

验收标准：

- 当前默认赛制无需配置即可开赛。
- 修改规则后保存、刷新不丢失。
- 所有阶段都有明确状态：未开始、进行中、已完成。

### 5.3 Player：选手页 / 个人页

必须修改：

- 选手页不再只是“本次比赛入口”。
- 未登录 / 未绑定时：
  - 可以作为 guest 报名。
  - 明确提示 guest 不获得联赛积分。
- 已绑定全局选手时：
  - 显示当前比赛对局。
  - 显示本人历史比赛。
  - 显示积分与联赛排名。

3.0 账号策略：

- 3.0 不强制做完整账号系统。
- 3.0 必须做本地可验证身份和绑定迁移口。
- 未来账号系统接入时，绑定到已有 `PlayerProfile.bindings[]`，不能推翻旧数据。

验收标准：

- guest 可以参赛。
- registered player 可以得分。
- 后台可以把 guest 赛后绑定到全局选手，并补发积分时有数据基础。

### 5.4 Overlay：直播叠加层

3.0 不是 overlay 视觉重绘版本，但必须兼容新模型。

必须修改：

- Overlay state 读取 `activeStage`。
- 标题显示当前阶段名称。
- 对局显示 BO 数。
- 淘汰赛不再假设只有 Top 8。
- 排名页能显示联赛积分来源时的标记。
- 保持 1920x1080 透明背景合同。

验收标准：

- 默认瑞士轮 + Top 8 Overlay 行为不退化。
- BO5、Top 4、Top 16 至少不会显示错误文案。
- 小组赛 / 双败可以使用简化 Overlay 展示，不空白。

### 5.5 Reports：战报

必须修改：

- 全场战报加入赛事配置摘要。
- 每个阶段单独列出。
- 每个 match 显示 BO 与局分。
- 联赛绑定比赛后可导出积分发放结果。
- 联赛可以导出排行榜。

验收标准：

- 旧战报仍可导出。
- 新阶段结构不会让战报崩溃。
- 计分结果可追溯到比赛、选手、名次和积分规则。

## 6. 开发顺序

### P0：兼容底座

目标：旧流程不坏，新 schema 可持久化。

已完成大部分：

- 3.0 schema。
- 默认 preset。
- stage view model。
- player / league / points core。
- registry API。
- 核心测试。

剩余：

- README 版本说明同步。
- 旧数据迁移日志。
- API 错误格式统一。

### P1：参赛者模型迁移

目标：从 `players[]` 过渡到 `entrants[]`，但旧 UI 不坏。

任务：

- 增加 `entrants[]`。
- 写旧 `players[]` -> `entrants[]` 迁移。
- add/remove/drop player 同步 entrant。
- 积分计算读取 entrant。
- 测试 guest / registered / team entrant。

完成后可以验收：

- 普通赛 guest 完整可跑。
- 被联赛纳入的比赛中，registered 得分、guest 不得分。

### P2：比赛设置与阶段配置 API

目标：后台可以保存赛事规则，而不是只靠默认值。

任务：

- 新增 settings routes。
- 新增 stage validation。
- 新增 preset 应用。
- 保存后广播状态。
- 测试非法 stage / BO / advancement。

完成后可以验收：

- 创建比赛时可选择赛制。
- 创建比赛时设置 BO、资格赛/淘汰赛结构、Top Cut 人数后能保存；瑞士轮计划轮数在开赛时按人数生成。

### P3：后台 UI 规则配置

目标：主办方能真实操作 3.0 设置。

任务：

- 比赛设置面板。
- 阶段列表面板。
- 阶段编辑弹窗。
- 联赛绑定状态只读提示或跳转入口。
- 参赛者绑定控件。

完成后可以验收：

- 不改 JSON 文件也能配置一场完整比赛。
- 后台清楚显示当前阶段和规则。

### P4：赛事执行通用化

目标：把固定流程改成 stage-driven flow。

任务：

- Swiss 读取 stage。
- Single elimination 泛化 bracketSize 和 BO。
- Group round robin 最小闭环。
- Double elimination 最小闭环。
- 阶段晋级统一入口。

完成后可以验收：

- 默认赛制完整跑完。
- 小组赛 + 单败能跑完。
- 双败能跑完。

### P5：联赛与积分闭环

目标：普通比赛攒分，联赛读取积分，联赛总决赛作为实体比赛存在。

任务：

- 比赛结束生成可被联赛读取的最终排名。
- 联赛 leaderboard API。
- 联赛 include tournament UI，并在绑定时选择积分规则。
- 总决赛资格名单生成。
- 选手个人积分汇总。

完成后可以验收：

- 三场比赛通过联赛绑定汇总出联赛榜。
- top N 生成总决赛名单。
- guest 不进入榜单。

### P6：选手页改造

目标：从比赛入口升级成个人页。

任务：

- guest 报名提示。
- 绑定全局 profile。
- 当前比赛对局。
- 历史比赛。
- 积分和联赛排名。

完成后可以验收：

- 同一选手跨比赛能看到历史。
- 临时选手不误拿积分。

### P7：Overlay / 战报适配

目标：所有展示层消费新模型。

任务：

- Overlay activeStage 文案。
- BO / 阶段 / bracket size 文案。
- 小组赛和双败简化展示。
- 战报按阶段输出。
- 联赛积分导出。

完成后可以验收：

- 默认 overlay 不退化。
- 新赛制不空屏、不显示硬编码 Top 8 错误。

### P8：发布前硬化

目标：3.0 可作为开发版交付。

任务：

- 全测试通过。
- 旧存档迁移测试。
- 手动跑完整默认赛制。
- 手动跑联赛绑定比赛后的积分汇总。
- 手动跑联赛榜。
- 手动跑小组赛、双败、团队赛最小流程。
- 文档更新。

完成后可以验收：

- `node --test` 全绿。
- 新建比赛、旧比赛加载、Overlay、选手页、战报都能跑。
- 关键数据重启后不丢。

## 7. 不在 3.0 首版强行完成的内容

这些要保留扩展口，但不作为 3.0 首版阻塞项：

- 官方 CP 精确模拟。
- 官方赛事品牌、赛事名、资格声明。
- 完整 OAuth / 邮箱密码账号系统。
- 多语言系统。
- 主题系统。
- Overlay 视觉大重绘。
- 云端多租户。
- 支付、门票、奖品库存。

其中账号系统的策略是：

- 3.0 做 `PlayerProfile` 和 `bindings[]`。
- 3.0 做本地身份绑定和迁移。
- 后续完整账号系统只追加 binding，不重建选手池。

## 8. 每次开发回合的执行规则

每次进入 3.0 开发时，按以下顺序执行：

1. 先确认当前阶段属于 P0-P8 哪一段。
2. 只改本阶段相关文件，不做无关重构。
3. 改模型时必须补迁移或兼容层。
4. 改后端时必须补 API 或核心测试。
5. 改前端时必须手动打开页面检查关键流程。
6. Overlay 改动必须保持 1920x1080 透明背景合同。
7. 每完成一个阶段，更新本文状态或新增开发记录。

## 9. 下一步建议

下一步应该进入 P1：参赛者模型迁移。

原因：

- 选手积分、联赛积分、小组赛、团队赛都依赖 entrant。
- 如果继续沿用 `players[]`，后面 UI 和积分逻辑会反复返工。
- 先把 guest / registered / team entrant 分清楚，后续规则引擎会稳定很多。

P1 的第一批具体任务：

- 在 `src/core/state.js` 加 `entrants: []`。
- 在 `src/core/entrants.js` 增加 player/team entrant helpers。
- 在 `restoreState()` 里迁移旧 `players[]`。
- 在 `addPlayer()`、`removePlayer()`、`dropPlayer()` 同步 entrant。
- 在 `buildClientState()` 输出 `entrants`。
- 增加 entrant API 与测试。
