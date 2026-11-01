import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene} from 'three';
import {loadModule} from './helpers/modules.mjs';
const {walk,buildSceneObstacles}=await loadModule('src/scene/movement.ts');
const {nearestInteraction}=await loadModule('src/scene/interactions.ts');
const {setupRoom}=await loadModule('src/scene/setup.ts');
const {syncLocationProps}=await loadModule('src/scene/props.ts');
const original=JSON.parse(readFileSync('public/scenes/hangar.json'));
const load=()=>structuredClone(original);
const at=(x,z,y=0)=>({x,y,z});
test('hangar IDs, finite coordinates, collision bounds, and all renderers',()=>{
 const s=load(),ids=[];const collect=o=>{if(!o||typeof o!=='object')return;if(o.id)ids.push(o.id);for(const v of Object.values(o)){if(typeof v==='number')assert.ok(Number.isFinite(v));else collect(v);}};collect(s);assert.equal(new Set(ids).size,ids.length);
 for(const p of s.objects)if(p.collidable!==false)assert.ok(p.collider,p.id);
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
 const scene=new Scene();setupRoom(scene,s);
 for(const p of [...s.objects,...s.doors,...s.foods])assert.ok(scene.getObjectByName(p.id)?.children.length,p.id);
 s.foods[0].eaten=true;s.doors[0].open=true;syncLocationProps(scene,s);
 assert.equal(scene.getObjectByName(s.foods[0].id).visible,false);
 assert.equal(scene.getObjectByName(s.doors[0].id).position.z,9.8);
});
test('door blocks when closed, opens from either side, and permits passage only in the doorway',()=>{
 const s=load();assert.equal(nearestInteraction(s,at(9.5,7.2))?.id,'equipment-door');
 assert.ok(walk(at(9,7.2),4,0,s).x<10.7);
 s.doors[0].open=true;assert.ok(walk(at(9,7.2),4,0,s).x>12.9);
 assert.equal(nearestInteraction(s,at(12.5,7.2))?.id,'equipment-door');
 assert.ok(walk(at(9,5),4,0,s).x<10.7);
});
test('spawn points, exits, ramps and food approach remain clear',()=>{
 const s=load();for(const p of [...s.spawnPoints,...s.playerSeats.map(s=>s.exit)])assert.ok(walk(p,.02,.02,s).x>p.x);
 for(const r of s.room.ramps){let p=walk({...r.from,z:r.from.z+.5},0,r.to.z-r.from.z-1,s);assert.ok(Math.abs(p.y-.9)<.01,JSON.stringify(p));p=walk(p,0,6,s);assert.ok(Math.abs(p.y)<.01);}
 s.doors[0].open=true;
 let p=walk(at(9,7.2),3.5,0,s);p=walk(p,0,2.3,s);p=walk(p,2.3,0,s);assert.ok(p.x>14.7&&p.z>9.4,JSON.stringify(p));
 for(const f of s.foods){const near=at(f.position.x,9.5);assert.equal(nearestInteraction(s,near)?.id,f.id);}
 const selected=nearestInteraction(s,at(13.75,9.5));s.foods.find(f=>f.id===selected.id).eaten=true;assert.notEqual(nearestInteraction(s,at(13.75,9.5))?.id,selected.id);
 // No camera sits outside the storage room.
 for(const c of s.objects.filter(o=>o.type==='camera'))assert.ok(c.position.x>11&&c.position.z>2);
 assert.ok(buildSceneObstacles(s).length>50);
});
