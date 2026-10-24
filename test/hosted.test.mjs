import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../sites/bankpilot-demo/worker/index.js';
const env={SESSION_SECRET:'test-only-session-secret-32-characters'};
const call=(route,body={})=>worker.fetch(new Request('https://bankpilot.test/api/'+route,{method:'POST',headers:{Origin:'https://bankpilot.test','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
test('hosted browser sandboxes are independent and snapshot tampering is rejected',async()=>{
 const first=await(await call('bootstrap')).json();
 assert.equal(first.ai.configured,false);
 const plan=await(await call('chat',{_snapshot:first._snapshot,scope:'all',text:'给小李转 200 元'})).json();
 const done=await(await call('tasks/confirm',{_snapshot:plan._snapshot,taskId:plan.message.card.taskId})).json();
 const changed=await(await call('bootstrap',{_snapshot:done._snapshot})).json();
 assert.equal(changed.accounts[0].balance,21800);
 const other=await(await call('bootstrap')).json();assert.equal(other.accounts[0].balance,22000);
 const bad=await call('bootstrap',{_snapshot:'invalid.signature'});assert.equal(bad.status,400);
 assert.ok(!JSON.stringify(first).includes(env.SESSION_SECRET));
});
test('hosted APIs reject cross-site origins',async()=>{
 const r=await worker.fetch(new Request('https://bankpilot.test/api/bootstrap',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),env);
 assert.equal(r.status,403);
});
test('public demo does not require a team code unless explicitly enabled',async()=>{
 const configured={...env,AI_BASE_URL:'https://model.example/v1',AI_API_KEY:'test-placeholder',AI_MODEL:'test-model'};
 const req=()=>new Request('https://bankpilot.test/api/chat',{method:'POST',headers:{Origin:'https://bankpilot.test'},body:JSON.stringify({scope:'all',text:'给小李转 200 元'})});
 const open=await worker.fetch(req(),configured);assert.equal(open.status,200);assert.ok((await open.json()).message.card.taskId);
 const locked=await worker.fetch(req(),{...configured,AI_REQUIRE_ACCESS_CODE:'true',TEAM_ACCESS_CODE:'example'});assert.equal(locked.status,401);
});
