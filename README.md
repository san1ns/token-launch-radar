# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/san1ns/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/san1ns/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's "Build the best token launch radar"
(token-radar-01) bounty. It reads a sealed DefiLlama snapshot (758 protocols,
2026-11-14), ranks the pre-token protocols by what a launch would be worth,
and hands in a static dashboard with a paper research plan for each one:
**157 rows — the 40-protocol watchlist plus 117 early protocols below the
floor**.

## Run it

Node.js 22.18 or later, standard library only, no network, no npm install:

```sh
node main.ts --input input/snapshot.json --output out
node tools/verify.mjs out input/snapshot.json
```

Open `out/dashboard/index.html` in a browser (it renders offline from
`data.js`). The run is deterministic: the same snapshot bytes always write
the same output bytes. The root `data.js`, `board.json`, `dossier.json` and
`screenshots/` are one full build from the official snapshot, so the
dashboard works straight from the checkout too.

## 看板

默认按模拟流通市值排列。点协议名或图中的数据点可进入详情，查看每一步乘法、可比协议和纸上调研计划。输入协议名称、选链或类别能组合筛选。切换“市场参照”可查看已有代币记录的项目，切换“估值方法”可查看样本与误差。浏览器的前进、后退和带筛选条件的片段链接均可使用。右上角 EN 切换英文界面。

| 2026-11-14 官方快照 | 结果 |
| --- | ---: |
| 输入协议 | 758 |
| 候选 | 157 |
| 官方观察名单覆盖 | 40 / 40 |
| 低于 5,000 万美元锁仓门槛的新候选 | 117 |
| 已有代币记录 / 有正市值记录 | 416 / 128 |
| 用于估值的去重样本 | 82 |

快照抓取时间为 2026-11-14 01:18:33 UTC，来源为 DefiLlama protocols 数据。这个数据集没有发行日、空投资格、个人获配比例或实时行情。每条计划提供类别相关的资料核查、模拟动作、用时和成本记录方式，实际支出为 0 美元。

## 估值与筛选

程序先纳入官方名单。门槛以下的附加候选必须同时缺少代币代码、CoinGecko 标识和市值，并通过交易所、桥接、质押、封装、版本、金库/资金池产品名称及已知代币家族筛查。母协议字段未在封存快照中逐行提供，所以附加候选保留归属复核提示。源码使用字段和名称模式筛选，各协议没有手工指定的估值。

预估流通市值 = 锁仓金额 × 参考倍数 × 规模修正 × 七天变化修正 × 收录时长修正。模型使用快照中已记录的流通市值，估算假设发行时的同口径市值。代币供应量、每枚价格、空投池规模及个人能得到多少均无法从本数据推导。

- 取有正市值的独立可比代币，以 CoinGecko ID 去重，缺失时使用代币代码。同一代币有多条记录时取锁仓规模最大者。
- 用锁仓规模至少相差两倍的样本对估计 log 市值对 log 锁仓的中位斜率 β，限制于 0.25 至 1。本快照 β ≈ 0.531。同类倍数与全市场倍数统一到样本锁仓中位数，使用 n/(n+6) 的同类权重在对数空间混合。
- 规模修正为 (协议锁仓 / 样本锁仓中位数)^(β−1)。七天变化修正为 1 + 0.002 × clamp(百分数, −50, 50)。缺失变化取零。收录时长修正从第 0 天的 0.85 升至第 365 天的 1，缺失日期按半年处理。
- 对 82 个已发行样本逐个留出，其他样本重新估算斜率、基准和类别倍数。模型典型误差为 3.19 倍，固定市值/锁仓中位数的基线为 4.13 倍。误差因子等于估值与观察值中较大者除以较小者。参考范围取留出样本实际值与估值之比的第 10、90 百分位。这是同一时点的交叉验证，未来发行的表现尚未验证。

## 纸上调研计划

每行 8 步，全部是纸面研究、实际支出 $0：核对活动公告、按类别做一次模拟操作、算清模拟成本、核查积分计划、追踪锁仓与同行、留存资格证据、复核风险与退出、设置复核日期。每步带用时，步骤之间按核查流程区分，先核对、再模拟、再留证、最后复核。计划不承诺发币：做的是调研记录，发行是协议自己的决定。

## 源码结构

| 文件 | 用途 |
| --- | --- |
| main.ts | 读取快照，构建榜单、网页数据、截图目录和 dossier |
| lib/model.ts | 候选识别、同类校准、留一检验和排名 |
| lib/plans.ts | 按协议、链和类别生成双语纸上调研步骤 |
| dashboard/ | 静态页面、交互和分布图 |
| input/snapshot.json | 官方封存快照 |
| screenshots/ | 浏览器实拍的榜单、详情与筛选视图，各 1440 × 900 |
| tools/verify.mjs | 按公布的七项输出规格做本地校验 |
| tools/capture.py | 用 Playwright + Chromium 重拍三张截图 |
| vendor/makefun-board.ts | 官方工具包提供的 dossier 生成器，逐字节保留 |
| LICENSE | MIT 许可。原始数据来源见 input/README.md |

### 重拍截图

附带截图与快照相匹配。修改页面或数据后，可使用已安装 Playwright 的 Python 和 Chromium 重新拍摄。默认构建只复制已拍摄的图片，因此不需要浏览器。

~~~sh
node main.ts --input input/snapshot.json --output out --preview
python tools/capture.py --dashboard out/dashboard/index.html --browser /path/to/chromium
node main.ts --input input/snapshot.json --output out
node tools/verify.mjs out input/snapshot.json
~~~

本地验证覆盖榜单、排名、名单、步骤、截图、离线文件及官方生成器重建 dossier 的字节一致性。make.fun 的正式评分由平台运行。本项目的交付状态为本地作品。

官方题目与原始数据包

- https://make.fun/bounty/token-radar-01
- https://make.fun/c/token-radar-01/kit

快照 SHA-256 — 42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393

---

<sub>Entered on [make.fun](https://make.fun/?ref=d7cf9b6m&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
