import * as T from 'three';
import { Npc } from '../../src/scene/Npc';
import { createNpcChair } from '../../src/scene/setup';
import profiles from './characterProfiles.json';
import type { NpcAppearance } from '../../src/shared/types';
const select=document.querySelector<HTMLSelectElement>('#character')!;
profiles.forEach((p,i)=>select.add(new Option(`${p.name} · ${i+1}`,String(i))));
const names=['Стоя · спереди','Стоя · сбоку','Сидя · спереди','Сидя · сбоку'];
const panels=names.map((name,i)=>{
 const article=document.createElement('article');article.innerHTML=`<h2>${name}</h2><canvas></canvas>`;document.querySelector('.grid')!.append(article);
 const canvas=article.querySelector('canvas')!,scene=new T.Scene();scene.background=new T.Color('#fdfcf9');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 scene.add(new T.HemisphereLight('#ffffff','#c9c5c1',2));const light=new T.DirectionalLight('#fff4e9',3);light.position.set(-3,6,5);scene.add(light);const fill=new T.DirectionalLight('#dceaff',1);fill.position.set(4,3,-2);scene.add(fill);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f3f1ec',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
 const camera=new T.OrthographicCamera(-1,1,1.2,-1.2,.1,30);camera.position.set(i%2?5:0,1.08,i%2?0:5);camera.lookAt(0,1.08,0);
 return {article,canvas,scene,renderer,camera,npc:null as Npc|null,seated:i>1};
});
let angled=false;
function load(){const p=profiles[Number(select.value)||0];panels.forEach((panel,i)=>{
 if(panel.npc){panel.scene.remove(panel.npc.group);panel.npc.dispose();}
 const npc=new Npc({id:`preview-${i}`,number:0,name:p.name,color:p.appearance.model.color,anchorId:'',appearance:p.appearance as NpcAppearance});
 panel.npc=npc;panel.seated=i>1;npc.group.add(createNpcChair());npc.group.getObjectByName('npc-chair')!.visible=i>1;
 npc.setTargetPose(0,0,0,0,0,i>1);const now=performance.now();for(let t=now-1500;t<=now;t+=16)npc.update(t);
 // Labels are part of the game model; hide them only in this close-up inspection view.
 npc.group.traverse(o=>{if(o instanceof T.Sprite)o.visible=false;});panel.scene.add(npc.group);
});document.querySelector('#status')!.textContent=`${p.name} · ${p.appearance.model.style} · ${p.appearance.model.hair} · ${p.appearance.model.facial}`;}
select.onchange=load;
document.querySelector('#four')!.addEventListener('click',load);
for(const [id,seated] of [['sit',true],['stand',false]] as const)document.querySelector('#'+id)!.addEventListener('click',()=>panels.forEach(p=>{p.seated=seated;p.npc!.stopSpeaking();p.npc!.setTargetPose(0,0,0,0,0,seated);p.npc!.group.getObjectByName('npc-chair')!.visible=true;}));
document.querySelector('#speech')!.addEventListener('click',()=>{load();panels.slice(2).forEach(p=>{p.npc!.enableChair();p.npc!.say('Сейчас я расскажу свою историю.','happy');});});
document.querySelector('#angle')!.addEventListener('click',()=>{angled=!angled;panels.forEach((p,i)=>{p.camera.position.set(i%2?5:angled?3:0,1.08,i%2?(angled?2:0):5);p.camera.lookAt(0,1.08,0);});});
function resize(){panels.forEach(p=>{const w=p.canvas.clientWidth,h=p.canvas.clientHeight;p.renderer.setSize(w,h,false);p.camera.left=-1.2*w/h;p.camera.right=1.2*w/h;p.camera.updateProjectionMatrix();});}window.addEventListener('resize',resize);
load();resize();function frame(now:number){panels.forEach(p=>{p.npc!.update(now);p.renderer.render(p.scene,p.camera);});requestAnimationFrame(frame);}requestAnimationFrame(frame);
