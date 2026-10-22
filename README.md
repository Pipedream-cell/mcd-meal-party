# 麦麦开饭局 🍽️

**一桌人的偏好，一份刚好的方案。** 基于麦当劳中国 MCP 的多人预算配餐 Skill，面向组织团队午餐、朋友聚餐、多人外带的用户。

项目仓库：https://github.com/fuqian1464/mcd-meal-party · [活动报名 Issue #1027](https://github.com/M-China/mcd-developer-innovation-challenge/issues/1027)。报名已提交，是否通过以该 Issue 下的官方校验回复为准。

输入预算和每位成员的偏好，得到每人一份的清单、选择原因、餐品汇总与费用明细。真实模式由 Skill 查询门店菜单、核实完整套餐并使用官方 `calculate-price` 核价。

> 独立开发的参赛作品，非麦当劳官方产品。演示数据全部虚构；餐品、价格及供应状态以官方渠道为准。输出不构成医疗、营养或其他专业建议。

## 三分钟运行

需要 Node.js 22 或以上。

```sh
npm ci
npm run demo
npm start
```

打开 http://127.0.0.1:3210 ，调整总预算或展开编辑团队 JSON，生成方案、复制清单、下载 JSON。页面只调用本机规划算法，不接收 Token，不连接你的账户。

命令行演示：

```text
【演示数据 / 非真实报价】麦麦开饭局
小林：演示鸡肉热饮组合 ¥26.00 · 偏好命中 鸡肉、热饮
小周：演示牛肉组合 ¥29.00 · 偏好命中 牛肉
小陈：演示鸡肉配水组合 ¥23.00 · 偏好命中 鸡肉
小许：演示基础热饮组合 ¥20.00 · 偏好命中 热饮
合计 ¥104.00（含配送 ¥6.00），预算剩余 ¥16.00
```

## 为什么选这个题目

聚餐组织者需要兼顾每个人的选择，不只是挑一份便宜套餐。本项目把「让最不满意的人也有合适选择」放在前面，依次优化：

1. 每个人都获得一份满足已核实回避条件的完整餐品或套餐。
2. 在总预算内，最大化所有人中最低的偏好命中数。
3. 最大化全员偏好总命中数；同分时选费用较低的方案。

算法使用整数金额和动态规划，支持 1–12 人、1–100 个候选。预算不足时返回最低所需金额；缺失回避信息时返回待核实名单。未知成分不能视为不含，不依靠虚构优惠。

## 安装与使用 Skill

将 `skills/mcd-meal-party` 文件夹复制到支持 `SKILL.md` 的客户端技能目录，例如个人 `~/.codex/skills/`。在支持自定义技能的其他客户端中，按该客户端方式导入。MCP 的连接配置按客户端规范填写；示例里的环境变量不保证所有客户端都自动展开。

示例请求：

> 帮我组织4人的麦当劳午餐，总预算120元含配送。小林偏好鸡肉和热饮、不吃辣；小周喜欢牛肉；小陈喜欢鸡肉、回避咖啡因；小许想喝热饮。先查我指定门店的可售菜单，给每个人分餐，再用官方工具核价，不下单。

Skill 会读取实时工具 schema，查询门店菜单与套餐详情，规范化候选后执行本地规划，再通过官方试算核验。CLI 另提供默认套餐到店自取的自动流程；其他场景由 Skill 根据实际 schema 和返回信息完成映射。

## 连接真实麦当劳 MCP

1. 在 [麦当劳 MCP 开放平台](https://open.mcd.cn/mcp) 本人登录、同意服务条款并激活 Token。
2. 复制 `.env.example` 为 `.env`，只在本机填入 `MCD_MCP_TOKEN`。不要将 Token 发到聊天、写入源码或提交 Git。
3. 发现实际工具与参数 schema：

```sh
npm run mcp:tools
```

4. 创建私有目录 `.local` 和参数 JSON（按实时 schema），调用查询工具。例如仅在发现 `now-time-info` 的 schema 接受空参数后：

```sh
node --env-file-if-exists=.env src/cli.js smoke
```

`smoke` 会实际连接官方服务器并调用 `now-time-info`，将不含响应正文的连接记录保存到 `.local/live-check.json`。没有 Token 时明确失败，不会回退到演示。

其他查询：

```sh
node --env-file-if-exists=.env src/cli.js call query-meals .local/args.json .local/menu-result.json
node src/cli.js plan .local/team.json --json
```

`.local/team.json` 的格式见 [输入规范](skills/mcd-meal-party/references/input-format.md)。真实菜单的完整套餐必选项、金额单位、标签、门店和时段需要核实；最终总价需 `calculate-price`，basket 不是官方工具参数。

### 一条命令完成真实配餐与核价

```sh
node --env-file-if-exists=.env src/cli.js live examples/live-request.json
```

此示例使用北京王府井东街的一家公开门店和虚构成员代号，不代表你的实际位置。先用查询工具确认你所需的门店与套餐编码，并修改请求 JSON；样例编码会随门店、时段和供应变化失效。

自动流程实时查询菜单、展开完整套餐默认子项、保留默认特调、逐份调用官方试算、执行公平规划、再核验最终篮子的商品数量和应付金额。使用试算直接返回的整数分，不依赖菜单价格单位推测。结果写入 `.local/live-plan.json`。

该自动流程仅支持到店自取、默认完整套餐、1–8个候选，不使用优惠券、不购买会员、不猜测回避成分；成员有回避条件但无官方明确依据时，返回待核实。外送、替换子项和自定义特调仍通过 Skill 核实处理。最终篮子超预算时明确返回 `withinBudget: false`，退出码为2，不声称核价成功即满足预算。

2026-10-22 已完成真实官方联调：4人、150元预算，官方最终试算137元；未创建订单。此价格仅为当时门店查询记录，详见 [真实联调记录](docs/LIVE_VALIDATION.md)。

## 能力边界

- 页面为本地算法演示，真实 MCP 编排由 Skill 或 CLI 执行，不宣称无配置的一键真实点餐。
- 查询客户端仅允许配餐需要的查询和价格试算，拒绝创建订单、扣积分、抽奖、领券等写操作。
- 不优化共享拼盘、跨餐厅组合、库存上限、限量券分配及复杂满减；不声称是全市场最低价。
- 回避标签仅用于偏好筛选，不能证明过敏安全；过敏原与交叉接触风险需向官方或门店确认。
- 候选可重复购买；门店限量和券互斥以官方试算为准。未知配送费会使预算不完整，需先核实。
- 使用本服务须遵守官方 MCP 服务规则；不得泄露凭证、地址或账户返回信息。

## 验证与参赛

```sh
npm test
npm run check
npm run check -- --require-live
```

15项测试包含穷举对照、预算不足、未知成分、费用边界、套餐默认组成、试算商品数量核对、MCP 真实 HTTP 传输的本地模拟及写操作拦截。模拟不等同于真实官方联调。`--require-live` 额外检查本机连接记录；真实业务流程已单独验证并记录于联调文档。

参赛文件包含原样下载的 [CONTEST_DECLARATION.md](CONTEST_DECLARATION.md)、[MCP_INTEGRATION.md](MCP_INTEGRATION.md) 和脱敏配置。本项目使用 Codex 开发，不提供虚构的 `workbuddy.md`，不据此申请 WorkBuddy 专项奖励。

官方规则：[活动主页](https://github.com/M-China/mcd-developer-innovation-challenge)、[完整规则](https://github.com/M-China/mcd-developer-innovation-challenge/blob/main/activityGuidelines.md)。报名截止：北京时间 2026-10-25 23:59，排名以公开 Star 为依据。发布 Public 仓库后，使用 [报名正文草稿](submission/issue-body.txt) 在活动仓库提交 Issue；替换真实仓库地址，收到官方成功回复后才算报名成功。

项目代码采用 MIT 许可证；官方参赛声明按主办方要求保留，麦当劳商标等权利归其权利人。

可选持续集成配置见 `docs/ci-example.yml`，可复制到 `.github/workflows/ci.yml` 启用；默认发布保留为示例，不要求额外的 GitHub workflow 授权。
