// Bundled into the Sites Worker; each browser retains an authenticated sandbox snapshot.
// This is a disposable demo, not a durable financial ledger or a real bank session.
const encoder=new TextEncoder();
function to64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function from64(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function signingKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function seal(state,secret){
 const overlay={version:1,expires:Date.now()+86400000,accounts:state.accounts,subscriptions:state.subscriptions,tasks:state.tasks.slice(0,30),audit:state.audit.slice(0,50),daily:state.daily,messages:Object.fromEntries(Object.entries(state.messages).map(([k,v])=>[k,v.slice(-12)])),contexts:state.contexts,transfers:state.transactions.filter(t=>t.kind==='transfer').slice(0,50)};
 const body=to64(encoder.encode(JSON.stringify(overlay)));
 return body+'.'+to64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(body))));
}
async function restore(token,secret){
 const fresh=datasetSeed();
 if(!token)return fresh;
 if(typeof token!=='string'||token.length>300000)throw new Error('演示会话无效，请清除浏览器站点数据后重试');
 const [body,signature]=token.split('.');
 if(!body||!signature||!await crypto.subtle.verify('HMAC',await signingKey(secret),from64(signature),encoder.encode(body)))throw new Error('演示快照校验失败，请重新开始');
 const state=JSON.parse(new TextDecoder().decode(from64(body)));
 if(state.expires<Date.now()||state.version!==1)return fresh;
 Object.assign(fresh,{accounts:state.accounts,subscriptions:state.subscriptions,tasks:state.tasks,audit:state.audit,daily:state.daily,messages:state.messages,contexts:state.contexts});
 fresh.transactions.push(...state.transfers);
 return fresh;
}
const mime=p=>p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
const requestWindows=new Map();
export default {async fetch(request,env){
 const url=new URL(request.url);
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
 if(!url.pathname.startsWith('/api/')){
  if(!Object.hasOwn(ASSETS,url.pathname))return new Response('Not found',{status:404});
  return new Response(ASSETS[url.pathname],{headers:{...headers,'Content-Type':mime(url.pathname)}});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'跨站请求已拒绝'},403);
 if(!env.SESSION_SECRET)return json({error:'演示服务尚未配置会话签名密钥'},503);
 try{
  const raw=await request.text();if(raw.length>350000)return json({error:'请求过长'},413);
  const input=JSON.parse(raw||'{}');
  const bank=createStore(await restore(input._snapshot,env.SESSION_SECRET));
  const modelConfig=aiConfig(env);
  let result;
  const route=url.pathname;
  if(route==='/api/bootstrap')result={...bank.bootstrap(),ai:{configured:aiAvailable(modelConfig),model:aiAvailable(modelConfig)?modelConfig.model:null},storage:'browser-signed-demo'};
  else if(route==='/api/chat'){
   if(aiAvailable(modelConfig)&&!input.action){
    if(env.AI_REQUIRE_ACCESS_CODE==='true'&&(!env.TEAM_ACCESS_CODE||input._access!==env.TEAM_ACCESS_CODE))return json({error:'需要团队 AI 访问码',requiresAccess:true},401);
    const ip=request.headers.get('CF-Connecting-IP')||'shared';const time=Date.now();
    const window=requestWindows.get(ip);const hits=window&&time-window.start<60000?window:{start:time,count:0};
    if(hits.count>=6)return json({error:'请求较频繁，请稍后再试'},429);
    hits.count++;requestWindows.set(ip,hits);
    if(requestWindows.size>1000)for(const [k,v] of requestWindows)if(time-v.start>60000)requestWindows.delete(k);
    // Snapshot-bound demonstration quota; replay protection/billing controls must be added for production.
    const key='ai-'+new Date().toISOString().slice(0,10);const used=bank.state.daily[key]||0;
    if(used>=20)return json({error:'本浏览器今日演示 AI 次数已用完'},429);
    bank.state.daily[key]=used+1;
   }
   result=await aiChat(bank,input,modelConfig);
  }
  else if(route==='/api/tasks/confirm')result=bank.confirm(input);
  else if(route==='/api/tasks/cancel')result=bank.cancel(input);
  else if(route==='/api/demo/reset')result=bank.reset();
  else if(route==='/api/transactions')return json(bank.transactions(url.searchParams.get('scope')||'all'));
  else return json({error:'接口不存在'},404);
  result._snapshot=await seal(bank.state,env.SESSION_SECRET);
  return json(result);
 }catch(error){return json({error:error.message||'请求失败'},400);}
}};
