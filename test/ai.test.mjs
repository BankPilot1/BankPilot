import test from 'node:test';
import assert from 'node:assert/strict';
import { aiChat, complete, aiConfig } from '../src/ai.mjs';
import { createStore } from '../src/bank.mjs';
const config={baseUrl:'https://model.example/v1',apiKey:'test-only-placeholder',model:'test-model'};
test('AI uses server facts and preserves user question; no execution authority',async()=>{
 const bank=createStore();let calls=0;
 const mock=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.model,'test-model');
  if(calls===2){const facts=JSON.parse(body.messages.at(-1).content).facts;assert.equal(facts.type,'analysis');assert.ok(facts.total>0);}
  return Response.json({choices:[{message:{content:calls===1?' {"intent":"analysis"} ':'本月消费以卡片数据为准，建议先核查大额交易。'}}],model:'test-model'});
 };
 const r=await aiChat(bank,{scope:'all',text:'帮我看看哪些地方花钱多，有什么需要注意的'},config,mock);
 assert.equal(calls,2);assert.equal(r.message.ai.status,'success');assert.equal(bank.state.messages.all[0].text,'帮我看看哪些地方花钱多，有什么需要注意的');assert.equal(bank.state.tasks.length,0);
});
test('AI network failure never becomes fabricated success',async()=>{
 const bank=createStore();let calls=0;
 const mock=async()=>++calls===1?Response.json({choices:[{message:{content:'{"intent":"analysis"}'}}]}):new Response('',{status:503});
 const r=await aiChat(bank,{scope:'all',text:'分析本月消费'},config,mock);
 assert.equal(r.message.ai.status,'failed');assert.equal(r.message.card.type,'analysis');assert.match(r.message.text,/失败/);
});
test('model cannot choose arbitrary tool or bypass transfer confirmation',async()=>{
 const bank=createStore();let calls=0;
 const mock=async()=>{calls++;return Response.json({choices:[{message:{content:'{"intent":"execute_transfer"}'}}]});};
 await aiChat(bank,{scope:'all',text:'帮我处理一下'},config,mock);assert.equal(bank.state.tasks.length,0);
 await aiChat(bank,{scope:'all',text:'给小李转 200 元'},config,mock);assert.equal(calls,1);assert.equal(bank.state.tasks[0].status,'pending');assert.equal(bank.state.accounts[0].balance,22000);
});
test('upstream error messages do not expose credentials or provider response',async()=>{
 await assert.rejects(complete(config,[],async()=>new Response('sensitive body',{status:401})),e=>e.message.includes('401')&&!e.message.includes('sensitive'));
});
test('compatible endpoint supports full URL, token parameter and text content parts',async()=>{
 const cfg=aiConfig({AI_BASE_URL:'https://provider.example/v1/chat/completions/',AI_API_KEY:'test-placeholder',AI_MODEL:'model-a',AI_TOKEN_PARAMETER:'max_completion_tokens',AI_TEMPERATURE:'none'});
 const r=await complete(cfg,[],async(url,options)=>{assert.equal(url.href,'https://provider.example/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.max_completion_tokens,1600);assert.ok(!('temperature' in body));assert.equal(body.stream,false);return Response.json({choices:[{message:{content:[{type:'text',text:'兼容调用成功'}]}}]});});
 assert.equal(r.text,'兼容调用成功');
});
test('DeepSeek explicitly disables thinking for concise analysis calls',async()=>{
 const cfg=aiConfig({AI_BASE_URL:'https://api.deepseek.com',AI_API_KEY:'test-placeholder',AI_MODEL:'deepseek-flash'});
 await complete(cfg,[],async(url,options)=>{assert.equal(JSON.parse(options.body).thinking.type,'disabled');return Response.json({choices:[{message:{content:'ok'}}]});});
});
