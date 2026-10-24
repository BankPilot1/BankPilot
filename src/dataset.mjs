import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../data/demo-config.json', import.meta.url), 'utf8'));
const dataset = JSON.parse(readFileSync(new URL('../data/processed/sparkov.json', import.meta.url), 'utf8'));
export function datasetSeed() {
  const month = dataset.metadata.referenceDate.slice(0,7);
  const accounts = structuredClone(config.accounts);
  const transactions = structuredClone(dataset.transactions);
  const subscriptions = structuredClone(config.subscriptions).map(s => ({...s, next:`下月 ${s.day} 日`, source:'demo-fixture'}));
  // These records support the simulated mandate workflow; they are never presented as Sparkov data.
  for(let i=0;i<6;i++) {
    const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth()-i);
    const period = d.toISOString().slice(0,7);
    for(const s of subscriptions) transactions.push({id:`fixture-${s.id}-${period}`,accountId:s.accountId,merchant:s.name,category:'订阅服务',amount:-s.amount,date:`${period}-${String(s.day).padStart(2,'0')}T09:00:00+08:00`,kind:'expense',currency:'CNY',source:'demo-fixture'});
  }
  for(const account of accounts) {
    account.source='demo-fixture';
    if(account.type==='credit') {
      account.due=Math.round(transactions.filter(t=>t.accountId===account.id&&t.date.startsWith(month)).reduce((s,t)=>s-t.amount,0)*100)/100;
      account.limit=Math.max(account.limit,Math.ceil(account.due/10000)*10000);
      account.dueDate=`${month}-${account.dueDay}`;
      account.billingNote='模拟账单：演示月已导入消费合计，假设本期无还款；非原数据集账单';
    }
  }
  return {accounts,transactions,subscriptions,contacts:structuredClone(config.contacts),dataset:structuredClone(dataset.metadata),tasks:[],audit:[],messages:{},contexts:{},daily:{}};
}
export function migrateDataset(saved) {
  const fresh=datasetSeed();
  if(!saved) return fresh;
  if(saved.dataset?.archiveSha256===fresh.dataset.archiveSha256 && saved.dataset?.referenceDate===fresh.dataset.referenceDate) return saved;
  // Keep executed simulated transfers and current business state. Historical chat cards reference old data and are cleared.
  const transfers=saved.transactions.filter(t=>t.kind==='transfer').map(t=>({...t,source:'demo-operation',currency:'CNY'}));
  fresh.transactions.push(...transfers);
  for(const account of fresh.accounts) if(account.type==='debit') {
    const previous=saved.accounts.find(a=>a.id===account.id); if(previous) account.balance=previous.balance;
  }
  for(const s of fresh.subscriptions) { const previous=saved.subscriptions.find(p=>p.id===s.id); if(previous) s.status=previous.status; }
  fresh.tasks=saved.tasks.map(t=>t.status==='pending'?{...t,status:'cancelled',error:'数据源升级，待执行任务已取消，请重新规划'}:t);
  fresh.daily=saved.daily;
  fresh.audit=[{id:'dataset-migration',time:new Date().toISOString(),action:'数据源升级',detail:`已切换 Sparkov，保留模拟转账及余额，取消旧待确认任务；导入 ${fresh.dataset.rows} 笔消费。`},...saved.audit];
  return fresh;
}
