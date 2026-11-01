import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {loadModule} from './helpers/modules.mjs';
const {AvatarRig,ANATOMY,NPC_SEAT,JURY_SEAT,SOFA_SEAT,legPose}=await loadModule('src/scene/AvatarRig.ts');
const {expressionPose}=await loadModule('src/scene/expression.ts');
const profiles=JSON.parse(readFileSync('tests/fixtures/characterProfiles.json'));
const rest=expressionPose('neutral',-1,0);
const position=o=>o.getWorldPosition(new T.Vector3());
const chairBoxes=[[[0,.47,-.06],[.82,.14,.74]],[[0,.92,-.46],[.96,.94,.16]],...[ -1,1].map(s=>[[s*.48,.7,-.06],[.14,.32,.78]])].map(([c,s])=>new T.Box3().setFromCenterAndSize(new T.Vector3(...c),new T.Vector3(...s)).expandByScalar(-.001));
function intersects(mesh,box){
 const vertices=mesh.geometry.attributes.position,index=mesh.geometry.index;
 if(!new T.Box3().setFromObject(mesh).intersectsBox(box))return false;
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),tri=new T.Triangle(a,b,c);
 for(let i=0;i<(index?.count??vertices.count);i+=3){
  [a,b,c].forEach((p,j)=>p.fromBufferAttribute(vertices,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
  if(box.intersectsTriangle(tri))return true;
 }
 return false;
}
test('80 public looks preserve hair constraints and exactly one bald character',()=>{
 assert.equal(profiles.length,80);assert.equal(profiles.filter(p=>p.appearance.model.hair==='bald').length,1);
 for(const p of profiles){const m=p.appearance.model;assert.ok((m.gender==='f'?['straight','shoulder','waves','layered']:['crop','fade','part','messy','bald']).includes(m.hair),p.name);}
});
test('fixed thigh and shin lengths, planted soles and forward knees at all three seat heights',()=>{
 for(const fit of [NPC_SEAT,JURY_SEAT,SOFA_SEAT]){
  const p=legPose(fit.surface+.11,fit.hipZ,ANATOMY.ankle,fit.footZ);
  assert.ok(Math.abs(Math.hypot(p.kneeY-fit.surface-.11,p.kneeZ-fit.hipZ)-ANATOMY.thigh)<1e-6);
  assert.ok(Math.abs(Math.hypot(p.kneeY-ANATOMY.ankle,p.kneeZ-fit.footZ)-ANATOMY.shin)<1e-6);
  assert.ok(p.kneeZ>.35);assert.ok(p.kneeY>fit.surface+.03);
  const rig=new AvatarRig(profiles[0].appearance.model);rig.pose(1,fit,0,rest,0,0);rig.root.updateMatrixWorld(true);
  for(const side of [-1,1]){const foot=rig.root.getObjectByName(`foot-${side}`);assert.ok(Math.abs(new T.Box3().setFromObject(foot).min.y)<1e-6);}
 }
});
test('all 80 occupants clear seat, back and armrests throughout sitting and standing',()=>{
 for(const p of profiles){
  const rig=new AvatarRig(p.appearance.model);
  for(let step=0;step<=20;step++){
   rig.pose(step/20,NPC_SEAT,.65,rest,0,0);rig.root.updateMatrixWorld(true);
   rig.root.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<chairBoxes.length;i++)assert.equal(intersects(o,chairBoxes[i]),false,`${p.name} ${p.appearance.model.style} step ${step} ${o.parent.name}/${o.name} furniture ${i}`);});
  }
 }
});
test('forehead hair stays above eyes and glasses while the hairstyle remains',()=>{
 for(const p of profiles.filter(p=>p.appearance.model.gender==='m'&&p.appearance.model.hair!=='bald')){
  const rig=new AvatarRig(p.appearance.model),cap=rig.head.getObjectByName('hair-cap');assert.ok(cap);
  const attr=cap.geometry.attributes.position;
  for(let i=0;i<attr.count;i++)if(attr.getZ(i)>.7)assert.ok(attr.getY(i)*.17+.024>.055,p.name);
 }
});
test('jury chair and sofa surfaces remain clear with planted feet during the whole transition',()=>{
 const box=(c,s)=>new T.Box3().setFromCenterAndSize(new T.Vector3(...c),new T.Vector3(...s)).expandByScalar(-.001);
 const jury=[box([0,.52,0],[.72,.14,.7]),box([0,.92,-.34],[.75,.72,.11])];
 // Sofa coordinates relative to the middle seat after the game's Math.PI - yaw facing transform.
 const sofa=[box([0,.5,-.1],[2.97,.22,1.056]),box([0,.9,-.604],[3.3,.7,.2])];
 for(const [fit,boxes] of [[JURY_SEAT,jury],[SOFA_SEAT,sofa]])for(const p of profiles){
  const rig=new AvatarRig(p.appearance.model);
  for(let step=0;step<=20;step++){
   rig.pose(step/20,fit,.75,rest,0,0);rig.root.updateMatrixWorld(true);
   rig.root.traverse(o=>{if(o.isMesh)for(const b of boxes)assert.equal(intersects(o,b),false,`${p.name} surface ${fit.surface} step ${step} ${o.parent.name}`);});
  }
 }
});
