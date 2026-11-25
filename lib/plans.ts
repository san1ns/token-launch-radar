export type Pair = [string, string];
export type Step = { title: Pair; text: Pair; minutes: number };

type Activity = [RegExp, Pair, Pair];
const activities: Activity[] = [
  [/lend|cdp|collateral|stablecoin|stable[s-]/i,
    ['记一笔模拟存取', 'Trace a paper deposit'],
    ['查一份公开市场说明，选一项抵押品，记下存入、赎回和清算条件。用 100 个虚拟单位试算一次资金进出。', 'Pick a documented collateral market. Record its deposit, redemption and liquidation terms. Trace 100 paper units through entry and exit.']],
  [/curator|allocator|yield|farm|liquidity manager|index/i,
    ['核对金库进出路径', 'Trace a vault round trip'],
    ['从公开金库页面抄下底层资产、份额换算和赎回等待期。用 100 个虚拟单位计算份额，再按同一时点的报价模拟退出。', 'Read a public vault factsheet for its asset, share conversion and redemption delay. Convert 100 paper units to shares, then simulate the exit at the same quote.']],
  [/dex|marketplace|otc/i,
    ['比较一笔模拟报价', 'Compare two paper quotes'],
    ['在公开行情页选同一交易对和数量，记下买入、卖出报价及费率，用 100 个虚拟单位算出往返差额。', 'Choose one listed pair and size on a public quote screen. Record bid, ask and fees. Compute the round-trip spread on 100 paper units.']],
  [/rwa|credit|cedefi/i,
    ['核查资产与赎回条款', 'Inspect redemption terms'],
    ['在公开发行文件找到资产类型、参与资格和赎回周期。记录条款日期，任何一项缺失就标记“资料不足”。', 'Read the published instrument terms for asset type, access restrictions and redemption window. Save the document date. Mark missing terms as unresolved.']],
  [/deriv|basis|synthetic|option|perp|prediction/i,
    ['记录合约结算条件', 'Map a paper settlement'],
    ['选一张有公开规则的合约，记下价格来源、到期或资金费规则。用两种假设价格计算虚拟盈亏，保留费用假设。', 'Choose a contract with public terms. Note its price source and expiry or funding rule. Use two hypothetical prices to calculate paper outcomes including the fee assumption.']],
  [/stake|staking|restak|lock/i,
    ['复核锁定与退出条件', 'Inspect an unlock schedule'],
    ['从公开文档找出锁定周期、退出队列和罚没规则，在纸上列出最早退出日期，并标出哪些条件可能让它推迟。', 'Find the published lock, exit queue and slashing terms. Draw the earliest possible exit on paper and record which conditions could delay it.']],
  [/payment|chain|card|privacy/i,
    ['追踪一条公开记录', 'Trace a public receipt'],
    ['在公开浏览器选一条已完成的示例记录，核对网络、时间和手续费单位，记录哪些字段能复查。', 'Select a completed public example in an explorer. Check the network, timestamp and fee unit, then list the fields a second reader can reproduce.']],
  [/insurance/i,
    ['阅读保障条款', 'Read a sample policy'],
    ['找一份公开保单，列出承保事件、一项除外条款和理赔窗口，再写出一例触发与一例无法触发的情形。', 'Read one public policy. Record a covered event, an exclusion and the claims window, then write one scenario for each side of the trigger.']],
  [/./,
    ['复现一个公开示例', 'Reproduce a public example'],
    ['选取文档里一项有示例输入与输出的功能，在纸上复现流程，记录依赖条件、费用单位和退出方式。', 'Choose a documented feature with sample inputs and outputs. Reproduce it on paper and record prerequisites, the fee unit and the way to exit.']]
];

export function makePlan(p: {name: string; slug: string; category: string | null; chains: string[]}, weekly: number | null): Step[] {
  const chain = p.chains[0];
  const context: Pair = chain ? [chain, chain] : ['文档列出的网络', 'the documented network'];
  const [, title, detail] = activities.find(([pattern]) => pattern.test(p.category || 'Protocol'))!;
  const reviewDays = weekly !== null && Math.abs(weekly) >= 25 ? 3 : 7;
  return [
    {title:['核对活动公告','Check the program notice'], minutes:5, text:[
      '查 ' + p.name + ' 的官方文档，核对名称、网络及带日期的活动公告。找不到公开资格规则，就把资格留为“未确认”。',
      'Read the official documentation for ' + p.name + '. Match its name and network to a dated campaign notice. Leave eligibility unconfirmed if no public terms are available.']},
    {title, minutes:12, text:[
      '以' + context[0] + '为核查范围。' + detail[0],
      'Use ' + context[1] + ' as the scope. ' + detail[1]]},
    {title:['算清模拟成本','Calculate the paper cost'], minutes:5, text:[
      '为 ' + p.name + ' 记录公开费率、一次进入和一次退出的假设费用。缺少报价就写“未知”。将模拟费用与实际支出分栏。',
      'For ' + p.name + ', log the published fee schedule and assumed entry and exit costs. Mark unavailable quotes unknown. Keep paper costs separate from actual spend.']},
    {title:['核查积分计划','Check the points program'], minutes:10, text:[
      '在官方文档或公告里找到积分页，记下积分怎么算、多久更新一次、有没有写明兑换规则。没有积分页就写“无公开积分计划”，不要猜。',
      'Find the points page in the official docs or announcements. Record how points accrue, how often they update, and whether any conversion rule is published. If there is no points page, write "no public points program" instead of guessing.']},
    {title:['追踪锁仓与同行','Track TVL and peers'], minutes:8, text:[
      '记下今天的锁仓金额和 7 天变化，再抄下两个最接近的可比协议及其市值/锁仓倍数。下次复核时对照同一组数字，看排名依据有没有变。',
      'Record today’s TVL and 7-day change, plus the cap/TVL multiples of the two nearest comparable protocols. Compare the same figures at the next review to see whether the ranking basis has moved.']},
    {title:['留存资格证据','Keep eligibility evidence'], minutes:5, text:[
      '把活动公告、积分页和费率页的链接连同查看日期存进记录，关键页截一张图。以后资格有争议时，这些带日期的记录就是依据。',
      'Save the links to the campaign notice, points page and fee schedule with the date you viewed them, plus a screenshot of the key page. Dated records are the evidence if eligibility is ever disputed.']},
    {title:['复核风险与退出','Review risks and exit'], minutes:6, text:[
      '写下三条风险：可能永远不发币、积分可能不兑换、规则可能中途改。每一项写一句如果发生该怎么办，退出条件想清楚再动手。',
      'Write down three risks: the token may never launch, points may never convert, and the rules may change mid-program. For each, note what you would do if it happens, and settle your exit conditions before acting.']},
    {title:['设置复核日期','Date the next review'], minutes:3, text:[
      '把协议编号 ' + p.slug + '、证据日期和疑点加入记录。' + reviewDays + ' 天后复核公告和代币标识。发现正式代币或活动取消，就移出追踪。',
      'Log ' + p.slug + ', the evidence date and unresolved questions. Recheck notices and token identifiers in ' + reviewDays + ' days. Retire the candidate if a token or cancellation is confirmed.']}
  ];
}

