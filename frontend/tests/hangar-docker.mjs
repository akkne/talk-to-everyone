// Explicit integration check against the running local Docker application.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {HubConnectionBuilder,HttpTransportType,LogLevel} from '@microsoft/signalr';
const base=process.env.HANGAR_URL||'http://127.0.0.1:5001';
const credentials={login:'hangar_review_1101',password:'HangarReview2026',name:'Осмотр ангара'};
async function account(credentials){
 let res=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 if(res.status===409)res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 assert.ok(res.ok,await res.clone().text());return res.json();
}
async function room(token){const r=await fetch(base+'/api/lobbies',{method:'POST',headers:{Authorization:'Bearer '+token}});assert.ok(r.ok);return (await r.json()).code;}
const auth=await account(credentials);
const guest=await account({login:'hangar_observer_1101',password:'HangarObserver2026',name:'Проверка лобби'});
writeFileSync('/tmp/hangar-review-credentials.json',JSON.stringify(credentials));
const connect=token=>new HubConnectionBuilder().withUrl(base+'/hubs/game',{transport:HttpTransportType.WebSockets,skipNegotiation:true,accessTokenFactory:()=>token}).configureLogging(LogLevel.Error).build();
const c=connect(auth.token),observer=connect(guest.token),isolated=connect(guest.token);
const code=await room(auth.token),otherCode=await room(guest.token);
let observedState,isolatedSnapshot,isolatedEvents=0;
observer.on('LocationState',s=>{observedState=s;});isolated.on('StateSnapshot',s=>{isolatedSnapshot=s;});isolated.on('LocationState',()=>{isolatedEvents++;});
let snapshot,me,pose,lastState,feedback,seq=0,reject;
c.on('StateSnapshot',s=>{snapshot=s;me=s.me.id;pose=s.players.find(p=>p.id===me).pose;seq=pose.seq;});
c.on('PlayersTick',s=>{pose=s.players.find(p=>p.id===me)?.pose??pose;});
c.on('LocationState',s=>{lastState=s;});c.on('InteractionFeedback',s=>{feedback=s.message;});c.on('ActionReject',s=>{reject=s;});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const interact=id=>c.invoke('Interact',{id,requestId:crypto.randomUUID()});
async function step(position){reject=null;await delay(90);await c.invoke('SendPose',{seq:++seq,position,yaw:0,pitch:0,jumpOffset:0});return !reject;}
async function go(x,z){const start={...pose.position},dist=Math.hypot(x-start.x,z-start.z),n=Math.ceil(dist/.2);for(let i=1;i<=n;i++){const next={x:start.x+(x-start.x)*i/n,y:0,z:start.z+(z-start.z)*i/n};assert.ok(await step(next),JSON.stringify(reject));}assert.ok(Math.hypot(pose.position.x-x,pose.position.z-z)<.05);}
try{
 await c.start();await c.invoke('Auth',{token:code});
 await observer.start();await observer.invoke('Auth',{token:code});
 await isolated.start();await isolated.invoke('Auth',{token:otherCode});assert.ok(snapshot);assert.equal(snapshot.scene.version,'3');assert.equal(snapshot.scene.room.width,40);
 await assert.rejects(interact('equipment-door'));console.log('PASS: JSON v3 loaded; remote interactions rejected');
 // Fresh test accounts spawn in the open southern aisle. Existing QA account resumes there after cleanup.
 await go(pose.position.x,11.8);await go(9.5,11.8);await go(9.5,7.2);
 if(snapshot.scene.doors[0].open)await interact('equipment-door');
 await go(10.4,7.2);
 assert.equal(await step({x:10.9,y:0,z:7.2}),false);assert.equal(reject.code,'COLLISION');
 await interact('equipment-door');assert.equal(lastState.doors[0].open,true);assert.equal(feedback,'Дверь открыта');
 await go(11,7.2);await assert.rejects(interact('equipment-door'),/Проём занят/);
 await go(12.5,7.2);await interact('equipment-door');assert.equal(lastState.doors[0].open,false);
 await interact('equipment-door');await go(12.5,9.5);await go(13.75,9.5);
 console.log('PASS: closed door blocks, open door permits passage; occupied doorway cannot close');
 const fresh=(lastState.foods??snapshot.scene.foods).find(f=>!f.eaten);
 if(fresh){await go(fresh.position.x,9.5);await interact(fresh.id);assert.ok(lastState.foods.find(f=>f.id===fresh.id).eaten);assert.match(feedback,/Вы съели/);await assert.rejects(interact(fresh.id),/уже съеден/);}
 assert.ok(observedState.foods.some(f=>f.eaten));assert.equal(isolatedEvents,0);assert.ok(isolatedSnapshot.scene.foods.every(f=>!f.eaten));
 console.log('PASS: food consumption broadcasts state and feedback; repeat consumption rejected; other lobbies remain unchanged');
 await go(12.5,9.5);await go(12.5,7.2);await go(9.5,7.2);await interact('equipment-door');
 await go(9.5,11.8);await go(.7,11.8);
 // Re-authentication after reconnect must preserve shared state.
 await c.stop();await c.start();await c.invoke('Auth',{token:code});

 assert.ok(snapshot.scene.foods.some(f=>f.eaten));assert.equal(snapshot.scene.doors[0].open,false);
 console.log('PASS: reconnect restores shared door/food state');
 console.log('Review login: '+credentials.login+'; password: '+credentials.password);
}finally{await c.stop();await observer.stop();await isolated.stop();}
