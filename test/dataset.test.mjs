import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { datasetSeed, migrateDataset } from '../src/dataset.mjs';
import { createStore } from '../src/bank.mjs';

test('Sparkov 来源完整，映射记录唯一，业务 API 不暴露欺诈答案',()=>{
  const state=datasetSeed();
  const imported=state.transactions.filter(t=>t.source==='sparkov');
  assert.equal(imported.length,state.dataset.rows);
  assert.equal(new Set(imported.map(t=>t.id)).size,imported.length);
  assert.ok(imported.every(t=>t.originalCurrency==='USD'&&t.currency==='CNY'&&t.originalDate&&t.amount<0));
  assert.ok(imported.every(t=>Math.abs(t.amount+Math.round(t.originalAmount*7*100)/100)<0.001));
  assert.ok(imported.every(t=>!('is_fraud' in t)&&!('isFraud' in t)));
  const labels=JSON.parse(readFileSync(new URL('../data/processed/sparkov-evaluation.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(labels).length,imported.length);
  for(const a of state.accounts) assert.equal(new Set(imported.filter(t=>t.accountId===a.id).map(t=>t.date.slice(0,7))).size,6);
});
test('账单和分析金额从导入流水计算，转账不重复计入消费',()=>{
  const bank=createStore(),period=bank.state.dataset.referenceDate.slice(0,7);
  const expected=bank.state.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(period)).reduce((s,t)=>s-t.amount,0);
  const result=bank.chat({scope:'all',text:'分析本月消费'}).message.card;
  assert.ok(Math.abs(result.total-expected)<0.001);
  for(const a of bank.state.accounts.filter(a=>a.type==='credit')) {
    const due=bank.state.transactions.filter(t=>t.accountId===a.id&&t.date.startsWith(period)).reduce((s,t)=>s-t.amount,0);
    assert.ok(Math.abs(a.due-due)<0.001);
  }
});
test('升级历史状态保留模拟资金变化，取消旧待确认任务',()=>{
  const old=datasetSeed();delete old.dataset;
  old.accounts[0].balance=21800;
  old.transactions.push({id:'old-transfer',accountId:'cmb-debit',kind:'transfer',amount:-200,date:new Date().toISOString()});
  old.tasks.push({id:'old-task',status:'pending'});
  old.subscriptions[0].status='cancelled';
  const migrated=migrateDataset(old);
  assert.equal(migrated.accounts[0].balance,21800);
  assert.equal(migrated.tasks[0].status,'cancelled');
  assert.equal(migrated.subscriptions[0].status,'cancelled');
  assert.equal(migrated.transactions.filter(t=>t.id==='old-transfer').length,1);
  assert.equal(migrateDataset(migrated),migrated);
});
