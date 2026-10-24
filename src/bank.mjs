import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const money = n => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const month = () => day().slice(0, 7);
const uid = prefix => `${prefix}_${randomUUID().slice(0, 12)}`;
function seed() {
  const accounts = [
    { id: 'cmb-debit', name: '招商工资卡', bank: '招商银行', initial: '招', tail: '1024', type: 'debit', balance: 22000, color: '#ab303a', note: '日常收支 · 工资账户' },
    { id: 'icbc-debit', name: '工商储蓄卡', bank: '工商银行', initial: '工', tail: '9588', type: 'debit', balance: 16200, color: '#a83a29', note: '备用资金 · 储蓄账户' },
    { id: 'cmb-credit', name: '招商信用卡', bank: '招商银行', initial: '招', tail: '3321', type: 'credit', due: 7820, limit: 30000, color: '#796952', note: '日常消费', dueDate: `${month()}-28` },
    { id: 'spdb-credit', name: '浦发信用卡', bank: '浦发银行', initial: '浦', tail: '8872', type: 'credit', due: 12430, limit: 50000, color: '#354e8e', note: '大额消费', dueDate: `${month()}-26` },
  ];
  const categories = [['餐饮美食', '小巷食堂', 48], ['购物消费', '生活好物', 168], ['交通出行', '城市出行', 23], ['生活缴费', '生活服务', 86], ['休闲娱乐', '周末影院', 65]];
  const transactions = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(`${month()}-01T12:00:00+08:00`); d.setUTCMonth(d.getUTCMonth() - m);
    const ym = d.toISOString().slice(0, 7);
    for (let i = 1; i <= 22; i++) {
      const c = categories[i % categories.length];
      transactions.push({ id: `seed-${m}-${i}`, accountId: accounts[i % 4].id, merchant: c[1], category: c[0], amount: -(c[2] + ((i * 17 + m * 13) % 80)), date: `${ym}-${String(i).padStart(2, '0')}T10:20:00+08:00`, kind: 'expense' });
    }
    transactions.push({ id: `salary-${m}`, accountId: 'cmb-debit', merchant: '工资入账', category: '工资收入', amount: 18500, date: `${ym}-15T09:00:00+08:00`, kind: 'income' });
    for (const [j, merchant, amount] of [[1, '云端音乐', 18], [2, '视频会员', 25], [3, '云空间', 12]]) transactions.push({ id: `sub-${m}-${j}`, accountId: 'cmb-debit', merchant, category: '订阅服务', amount: -amount, date: `${ym}-${String(j + 2).padStart(2, '0')}T09:00:00+08:00`, kind: 'expense' });
  }
  transactions.push({ id: 'unusual-1', accountId: 'spdb-credit', merchant: '数码商店', category: '购物消费', amount: -3299, date: `${month()}-20T16:35:00+08:00`, kind: 'expense' });
  return { accounts, transactions, tasks: [], audit: [], messages: {}, contexts: {}, daily: {}, subscriptions: [
    { id: 'music', name: '云端音乐', amount: 18, accountId: 'cmb-debit', next: '下月 3 日', status: 'active', icon: 'music' },
    { id: 'video', name: '视频会员', amount: 25, accountId: 'cmb-debit', next: '下月 4 日', status: 'active', icon: 'play' },
    { id: 'cloud', name: '云空间', amount: 12, accountId: 'cmb-debit', next: '下月 5 日', status: 'active', icon: 'cloud' },
  ], contacts: [{ id: 'wang-1', name: '小王', detail: '王明 · 招商银行 · 尾号 6208' }, { id: 'wang-2', name: '小王', detail: '王悦 · 工商银行 · 尾号 3516' }, { id: 'li', name: '小李', detail: '李林 · 工商银行 · 尾号 8812' }] };
}

export function createStore(saved) {
  let state = saved || seed();
  const log = (action, detail) => state.audit.unshift({ id: uid('audit'), time: now(), action, detail });
  function scopeAccounts(scope) {
    if (scope === 'all') return state.accounts;
    if (scope === 'savings') return state.accounts.filter(a => a.type === 'debit');
    if (scope === 'credits') return state.accounts.filter(a => a.type === 'credit');
    if (scope === 'repayment') return state.accounts.filter(a => ['cmb-debit', 'cmb-credit', 'spdb-credit'].includes(a.id));
    const account = state.accounts.find(a => a.id === scope);
    if (!account) throw new Error('无效的账户范围');
    return [account];
  }
  const account = id => state.accounts.find(a => a.id === id);
  function saveMessage(scope, role, text, card) {
    const message = { id: uid('msg'), role, text, card, time: now() };
    (state.messages[scope] ||= []).push(message);
    return message;
  }
  function response(scope, text, card) { return { message: saveMessage(scope, 'assistant', text, card) }; }
  function newTask(scope, type, title, payload) {
    const task = { id: uid('task'), scope, type, title, payload, status: 'pending', risk: type === 'transfer' && ((state.daily[day()] || 0) + payload.amount > 1000) ? 'red' : 'yellow', createdAt: now(), attempts: 0 };
    state.tasks.unshift(task); log('任务规划', `${title}；风险等级 ${task.risk}；等待用户授权`);
    return response(scope, task.risk === 'red' ? '本次转账将使今日累计超过 ¥1,000，需要确认并完成演示强验证。' : '操作已准备好，请核对以下详情后确认。', { type: 'task', taskId: task.id });
  }
  return {
    get state() { return state; },
    bootstrap() { return { ...state, environment: 'demo', demoDate: day() }; },
    reset() { state = seed(); log('重置演示', '已恢复初始演示数据'); return { ok: true }; },
    transactions(scope) { const ids = scopeAccounts(scope).map(a => a.id); return state.transactions.filter(t => ids.includes(t.accountId)).sort((a, b) => b.date.localeCompare(a.date)); },
    chat({ scope = 'all', text, action }) {
      scopeAccounts(scope);
      if (typeof text !== 'string' || !text.trim()) throw new Error('请输入消息');
      text = text.trim().slice(0, 2000); saveMessage(scope, 'user', text);
      log('意图解析', `范围 ${scope}；规则式演示意图路由（非大模型）`);
      const selected = scopeAccounts(scope);
      const ctx = state.contexts[scope] ||= {};
      if (action?.type === 'contact') {
        const candidate = ctx.transfer;
        if (!candidate || !state.contacts.find(c => c.id === action.id && c.name === candidate.name)) return response(scope, '收款人选择已过期，请重新输入转账需求。');
        delete ctx.transfer;
        for (const message of state.messages[scope]) if (message.card?.type === 'contacts') message.card.resolved = true;
        return newTask(scope, 'transfer', `向${candidate.name}转账 ${money(candidate.amount)}`, { ...candidate, contactId: action.id });
      }
      if (action?.type === 'cancel-sub') {
        const sub = state.subscriptions.find(s => s.id === action.id && s.status === 'active');
        if (!sub || !selected.some(a => a.id === sub.accountId)) return response(scope, '当前范围内没有该有效代扣。');
        return newTask(scope, 'subscription', `取消${sub.name}模拟代扣`, { subscriptionId: sub.id, accountId: sub.accountId });
      }
      if (/跳过|绕过|忽略.*(规则|验证)|已经验证/.test(text)) { log('权限拦截', '聊天指令无法替代确认或强验证'); return response(scope, '聊天内容不能替代操作确认或身份验证。请通过任务卡片完成所需步骤。', { type: 'notice', tone: 'red', title: '权限边界生效', detail: '本次请求未执行资金操作。' }); }
      if (/转.*\d|\d.*转/.test(text)) {
        if (/-\s*\d|\d+\.\d{3,}/.test(text)) return response(scope, '转账金额须为正数，且最多保留两位小数。请重新输入。');
        const match = text.match(/(?:转(?:账)?\s*)(\d+(?:\.\d{1,2})?)/) || text.match(/(\d+(?:\.\d{1,2})?)\s*元/);
        const amount = Number(match?.[1]);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return response(scope, '请输入有效转账金额，例如“给小王转 200 元”。');
        const payer = selected.find(a => a.type === 'debit');
        if (!payer) return response(scope, '当前会话没有可用于转账的储蓄账户，请切换至工资卡或全部储蓄卡。');
        const name = text.includes('小王') ? '小王' : text.includes('小李') ? '小李' : null;
        if (!name) return response(scope, '演示联系人支持“小王”和“小李”。请补充收款人后重新发送转账需求。');
        const payload = { name, amount, accountId: payer.id, remark: text.match(/备注[：:、\s]*(.+)/)?.[1] || '无备注' };
        const contacts = state.contacts.filter(c => c.name === name);
        if (contacts.length > 1) { ctx.transfer = payload; return response(scope, '找到了两位“小王”，请选择正确的收款人。', { type: 'contacts', contacts }); }
        return newTask(scope, 'transfer', `向${name}转账 ${money(amount)}`, { ...payload, contactId: contacts[0].id });
      }
      if (/订阅|代扣|续费/.test(text)) {
        ctx.pendingSubscriptionQuery = true;
        return response(scope, '订阅查询按赛题采用黄色权限。确认后读取本次范围内的模拟代扣与历史扣费记录。', { type: 'subscription-consent' });
      }
      if (action?.type === 'subscription-query') {
        if (!ctx.pendingSubscriptionQuery) return response(scope, '查询确认已失效，请重新发起订阅查询。');
        delete ctx.pendingSubscriptionQuery;
        for (const message of state.messages[scope]) if (message.card?.type === 'subscription-consent') message.card.resolved = true;
        log('用户确认', '用户确认读取当前范围订阅与代扣记录');
        return response(scope, '以下是演示商户的模拟代扣授权。连续六个月的同额扣费作为周期识别依据；此处不代表真实商户订阅。', { type: 'subscriptions', ids: state.subscriptions.filter(s => selected.some(a => a.id === s.accountId)).map(s => s.id) });
      }
      if (/够|资金计划|还款计划/.test(text)) {
        const savings = state.accounts.filter(a => a.type === 'debit');
        const debt = (selected.some(a => a.type === 'credit') ? selected.filter(a => a.type === 'credit') : state.accounts.filter(a => a.type === 'credit')).reduce((s, a) => s + a.due, 0);
        const total = savings.reduce((s, a) => s + a.balance, 0);
        return response(scope, '本次同时查询了已授权的储蓄账户，未改变群成员。以下是当前快照估算，未计入未来收支。', { type: 'funds', total, debt, remaining: total - debt, reserve: scope === 'repayment' ? 10000 : 0, accounts: savings.map(a => ({ name: a.name, balance: a.balance })), updatedAt: now() });
      }
      if (/待还|还款|还多少|还要还|信用卡.*账单/.test(text)) {
        const cards = selected.filter(a => a.type === 'credit');
        return response(scope, cards.length ? '已汇总当前范围内的信用卡账单。本期未还金额如下：' : '当前范围没有信用卡，可切换至“全部信用卡”。', { type: 'bills', accounts: cards.map(a => ({ name: a.name, tail: a.tail, due: a.due, dueDate: a.dueDate })), total: cards.reduce((s, a) => s + a.due, 0), updatedAt: now() });
      }
      if (/消费|花|支出|分析|异常|账单|报告/.test(text)) {
        const previous = /上个?月/.test(text) && !/比|对比/.test(text);
        const d = new Date(`${month()}-01T12:00:00+08:00`); d.setUTCMonth(d.getUTCMonth() - 1); const last = d.toISOString().slice(0, 7);
        const period = previous ? last : month();
        const tx = state.transactions.filter(t => selected.some(a => a.id === t.accountId) && t.kind === 'expense' && t.date.startsWith(period));
        const prior = state.transactions.filter(t => selected.some(a => a.id === t.accountId) && t.kind === 'expense' && t.date.startsWith(last)).reduce((s, t) => s - t.amount, 0);
        const categories = {}; tx.forEach(t => categories[t.category] = (categories[t.category] || 0) - t.amount);
        const total = tx.reduce((s, t) => s - t.amount, 0);
        return response(scope, '已按交易类别汇总消费，转账不计入消费。大额记录仅作为待核查提示，不代表已判定欺诈。', { type: 'analysis', period, total, prior: previous ? null : prior, count: tx.length, categories: Object.entries(categories).sort((a,b) => b[1]-a[1]), unusual: tx.filter(t => -t.amount > 2000), updatedAt: now() });
      }
      if (/余额|多少钱|资产|资金/.test(text)) return response(scope, '以下为当前会话范围的账户快照。储蓄余额与信用卡额度分别展示。', { type: 'balances', accounts: selected.map(a => ({ name: a.name, tail: a.tail, type: a.type, amount: a.type === 'debit' ? a.balance : a.limit - a.due })), updatedAt: now() });
      if (/交易|流水|明细/.test(text)) return response(scope, '已读取当前范围最近的 8 笔交易。', { type: 'transactions', transactions: this.transactions(scope).slice(0, 8) });
      return response(scope, '我是 BankPilot，当前运行规则式演示助手，尚未接入大模型。你可以查询余额、分析本月消费、汇总信用卡待还，或发起一笔模拟转账。', { type: 'suggestions' });
    },
    confirm({ taskId, code }) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) throw new Error('任务不存在');
      if (task.status !== 'pending') return { task, message: '该任务已处理，不会重复执行' };
      if (Date.now() - Date.parse(task.createdAt) > 15 * 60 * 1000) { task.status = 'expired'; log('任务过期', task.id); return { task, error: '确认已过期，请重新发起任务' }; }
      if (task.attempts >= 3) throw new Error('此任务已锁定，请取消后重新发起');
      if (task.type === 'transfer') {
        const total = (state.daily[day()] || 0) + task.payload.amount;
        if (total > 1000) task.risk = 'red';
        if (task.risk === 'red' && code !== '246810') {
          if (code) { task.attempts++; log('强验证失败', `${task.id}；第 ${task.attempts} 次`); }
          if (task.attempts >= 3) { task.status = 'locked'; log('异常熔断', `${task.id} 连续三次验证失败，锁定此任务`); }
          return { task, error: code ? '演示验证码错误' : '需要强验证', needsVerification: true };
        }
        const payer = account(task.payload.accountId);
        if (!payer || payer.type !== 'debit' || payer.balance < task.payload.amount) {
          task.status = 'failed'; task.error = '可用余额不足'; log('执行失败', `${task.id}；可用余额不足`); return { task, error: task.error };
        }
        log('用户授权', `${task.id}；已确认${task.risk === 'red' ? '并通过模拟强验证' : ''}`);
        payer.balance = Math.round((payer.balance - task.payload.amount) * 100) / 100;
        state.daily[day()] = total;
        const tx = { id: uid('tx'), accountId: payer.id, merchant: `转账给${task.payload.name}`, category: '转账', amount: -task.payload.amount, date: now(), kind: 'transfer', remark: task.payload.remark };
        state.transactions.unshift(tx); task.receipt = tx.id;
      } else {
        const sub = state.subscriptions.find(s => s.id === task.payload.subscriptionId);
        if (!sub || sub.status !== 'active') { task.status = 'failed'; task.error = '代扣已取消'; return { task, error: task.error }; }
        sub.status = 'cancelled'; task.receipt = uid('mandate');
        log('用户授权', `${task.id}；用户明确确认取消模拟代扣`);
      }
      task.status = 'success'; task.completedAt = now();
      log('执行成功', `${task.title}；回执 ${task.receipt}`);
      saveMessage(task.scope, 'assistant', task.type === 'transfer' ? '模拟转账已完成，余额和交易记录已更新。回执已同步至上方操作卡片及任务中心。' : '模拟代扣授权已取消；这不代表真实商户服务订阅已终止。');
      return { task };
    },
    cancel({ taskId }) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) throw new Error('任务不存在');
      if (['pending', 'locked'].includes(task.status)) { task.status = 'cancelled'; log('用户取消', task.title); }
      return { task };
    },
  };
}
