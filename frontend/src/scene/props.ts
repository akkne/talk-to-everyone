import { doorProgress, doorPose } from './doors';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PropSpec, SceneSpec } from './world';
const mat=(color:string,glow=false)=>glow?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness:.55,metalness:.35});
/** Each prop has distinct geometry; size and yaw also drive its navigation bounds. */
export function createProp(p:PropSpec){
 const g=new T.Group();g.name=p.id;const {x:w,y:h,z:d}=p.size,c=p.color??'#465363',dark='#17212e',metal='#83919f';
 const box=(x:number,y:number,z:number,a:number,b:number,c:number,color=metal,glow=false)=>{const m=new T.Mesh(new T.BoxGeometry(a,b,c),mat(color,glow));m.position.set(x,y,z);g.add(m);return m;};
 const cyl=(x:number,y:number,z:number,r:number,len:number,color=metal)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,len,12),mat(color));m.position.set(x,y,z);g.add(m);return m;};
 const sphere=(x:number,y:number,z:number,r:number,color:string)=>{const m=new T.Mesh(new T.SphereGeometry(r,16,12),mat(color));m.position.set(x,y,z);g.add(m);return m;};
 const rod=(a:number[],b:number[],r=.025)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start);const m=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),6),mat(metal));m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());g.add(m);};
 const tripod=()=>{for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod([0,h*.68,0],[Math.cos(a)*w*.45,.05,Math.sin(a)*d*.45],.035);}cyl(0,h*.52,0,.045,h*.9);};
 switch(p.type){
 case 'foosball':
  box(0,h*.78,0,w,.18,d,c);box(0,h*.87,0,w*.87,.04,d*.84,'#2c6846');
  for(const x of [-w*.44,w*.44])for(const z of [-d*.4,d*.4])box(x,h*.38,z,.08,h*.76,.08,dark);
  for(let z=-d*.33;z<=d*.34;z+=d*.22)rod([-w*.7,h*.98,z],[w*.7,h*.98,z],.035);
  break;
 case 'vending':
  box(0,h/2,0,w,h,d,c);box(0,h*.57,d*.51,w*.72,h*.66,.035,dark);
  for(let row=0;row<3;row++)for(let col=0;col<2;col++)box((col-.5)*w*.32,h*(.37+row*.18),d*.54,w*.2,h*.11,.025,['#6b9eaa','#c16e4c','#bba75d'][row],true);
  box(w*.27,h*.25,d*.54,w*.2,h*.13,.04,'#22262c');break;
 case 'panel':box(0,0,0,w,h,d,c);break;
 case 'gate':box(0,0,0,w,h,d,c);for(let y=-h/2;y<h/2;y+=.45)box(0,y,d/2+.01,w,.035,.035,metal);for(const x of [-w/2,w/2])box(x,0,.1,.15,h+.3,.2,dark);break;
 case 'vent':box(0,0,0,w,h,d,c);for(let z=-d/2;z<=d/2;z+=.8)box(0,0,z,w*1.08,h*1.08,.06,metal);break;
 case 'reflector':tripod();{const m=cyl(0,h*.75,0,w/2,.04,'#eee9da');m.rotation.x=Math.PI/2;m.scale.z=1.2;}break;
 case 'monitor':tripod();box(0,h*.83,0,w,h*.36,.12,dark);box(0,h*.83,-.07,w*.9,h*.29,.02,'#407d91',true);for(let i=0;i<4;i++)box(-w*.3+i*w*.2,h*.8,-.09,.08,.12,.01,'#8ac5cb',true);break;
 case 'directorChair':for(const x of [-w*.4,w*.4]){rod([x,0,-d*.4],[x,h*.7,d*.4],.045);rod([x,0,d*.4],[x,h*.7,-d*.4],.045);box(x,h*.8,0,.08,.08,d,dark);}box(0,h*.55,0,w,.08,d*.8,dark);box(0,h*.88,d*.4,w,h*.24,.08,c);break;
 case 'cart':for(const y of [.2,h*.65])box(0,y,0,w,.08,d,c);for(const x of [-w*.42,w*.42])for(const z of [-d*.4,d*.4]){box(x,h/2,z,.06,h,.06);sphere(x,.1,z,.1,dark);}box(0,h*.85,d*.42,w,.07,.07);box(0,h*.85,0,w*.6,.3,d*.6,dark);break;
 case 'reel':{const m=cyl(0,h*.5,0,w*.45,d*.7,dark);m.rotation.x=Math.PI/2;for(const z of [-d*.4,d*.4])cyl(0,h*.5,z,w*.5,.05,c).rotation.x=Math.PI/2;box(0,.04,0,w,.08,d);}break;
 case 'lens':cyl(0,h/2,0,w/2,h,dark);cyl(0,h+.01,0,w*.4,.02,'#397f99');break;
 case 'battery':box(0,h/2,0,w,h,d,dark);box(0,h,.02,w*.45,.02,.06,'#d7b166');break;
 case 'charger':box(0,h/2,0,w,h,d,dark);for(const x of [-w*.25,w*.25]){box(x,h+.1,0,.2,.2,.3);sphere(x,h+.22,-.1,.025,'#5ccc8c');}break;
 case 'camera':case 'tripod':case 'softbox':
  tripod();if(p.type==='camera'){box(0,h*.86,0,w*.5,h*.2,d*.5,dark);cyl(0,h*.86,-d*.34,.16,.4,dark).rotation.x=Math.PI/2;box(0,h*.99,0,.22,.12,.15);box(.3,h*.89,0,.02,.2,.28,'#2e9ab3',true);}if(p.type==='softbox'){box(0,h*.85,0,w,h*.32,.22,dark);box(0,h*.85,-.12,w*.92,h*.29,.025,'#fff3d9',true);}break;
 case 'table':case 'bar':case 'djBooth':
  box(0,h-.07,0,w,.14,d,p.type==='table'?'#af8762':c);
  if(p.type==='table'){for(const x of [-1,1])for(const z of [-1,1])box(x*w*.4,h/2,z*d*.37,.08,h-.14,.08,dark);}else{box(0,h/2,0,w*.96,h-.18,d*.85,dark);box(0,h*.65,d*.46,w*.95,.07,.03,'#8562ed',true);}
  if(p.type==='djBooth'){for(const x of [-w*.29,w*.29]){cyl(x,h+.05,0,.35,.06,dark);cyl(x,h+.09,0,.18,.015,'#aeb4d4');}box(0,h+.08,0,.6,.12,.7,dark);for(let i=0;i<6;i++)box(-.23+i*.09,h+.16,0,.03,.03,.35,'#a671ee',true);}
  if(p.type==='bar')for(let i=0;i<9;i++){const z=-d*.4+i*d*.1;cyl(0,h+.2,z,.08,.4,'#489d8d');cyl(.5,h+.1,z,.09,.18,'#e5ceba');}break;
 case 'shelf':
  for(const x of [-w*.48,w*.48])for(const z of [-d*.46,d*.46])box(x,h/2,z,.06,h,.06);
  for(let j=0;j<4;j++){const y=.15+j*h*.29;box(0,y,0,w,.07,d,c);for(let k=0;k<3;k++)box((k-1)*w*.26,y+.19,0,w*.2,.3,d*.65,['#383f4d','#96754d','#467f85'][k]);}break;
 case 'speaker':box(0,h/2,0,w,h,d,dark);for(const y of [h*.28,h*.68]){cyl(0,y,d*.51,w*.34,.06,'#36424f').rotation.x=Math.PI/2;sphere(0,y,d*.55,w*.12,dark);}box(0,h*.94,d*.51,w*.65,.08,.03,'#9b6ce3',true);break;
 case 'sofa':box(0,.26,0,w,.35,d,dark);box(0,.5,0,w*.9,.22,d*.88,c);box(0,.9,d*.42,w,.7,.2,c);for(const x of [-1,1])box(x*w*.47,.68,0,.18,.55,d,c);for(let i=1;i<3;i++)box(-w/2+i*w/3,.62,0,.025,.02,d*.8,dark);break;
 case 'stool':cyl(0,.06,0,w*.45,.1,dark);cyl(0,h*.45,0,.05,h*.8);cyl(0,h*.9,0,w*.48,.18,c);break;
 case 'truss':
  if(w>h){for(const y of [-h/2,h/2])for(const z of [-d/2,d/2])rod([-w/2,y,z],[w/2,y,z],.035);for(let x=-w/2;x<w/2;x+=1)for(const z of [-d/2,d/2])rod([x,-h/2,z],[Math.min(x+1,w/2),h/2,z]);}else{for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])rod([x,-h/2,z],[x,h/2,z]);for(let y=-h/2;y<h/2;y+=.8)rod([-w/2,y,d/2],[w/2,Math.min(y+.8,h/2),d/2]);}break;
 case 'spotlight':box(0,.1,0,w,.2,d,dark);cyl(0,-h*.2,0,w*.36,h*.65,dark).rotation.x=.4;{const m=cyl(0,-h*.48,-.12,w*.28,.03,c);m.material=mat(p.color??'#fff1cd',true);}if(p.beam){const m=new T.Mesh(new T.ConeGeometry(1.6,5,16,1,true),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.065,depthWrite:false,side:T.DoubleSide}));m.position.y=-3;g.add(m);}break;
 case 'backdrop':box(0,0,0,w,h,.08,c);for(const x of [-w/2,w/2]){box(x,0,.16,.07,h+.2,.07);box(x,-h/2+.05,0,.65,.08,.8,dark);}box(0,-h/2+.025,.6,w,.05,1.2,c);break;
 case 'crate':box(0,0,0,w,h,d,c);for(const y of [-h*.45,h*.45])box(0,y,d*.51,w,.05,.03);for(const x of [-w*.43,w*.43])box(x,0,d*.51,.05,h,.03);box(0,0,d*.53,w*.25,.08,.035,dark);break;
 case 'column':box(0,0,0,w,h,d,c);box(0,-h/2,0,w*1.8,.12,d*1.5);for(const x of [-1,1])box(x*w*.46,0,0,.06,h,d*1.4);break;
 case 'cableTray':box(0,0,0,w,h,d,dark);for(const x of [-.25,0,.25])box(x*w,h*.6,0,.025,.02,d,'#b39c53');break;
 case 'danceTile':case 'neon':box(0,0,0,w,h,d,c,true);break;
 case 'bottle':cyl(0,h*.3,0,w*.48,h*.6,c);cyl(0,h*.77,0,w*.22,h*.35,c);break;
 case 'mirrorball':{const m=new T.Mesh(new T.SphereGeometry(w/2,24,16),new T.MeshStandardMaterial({color:'#cbd6eb',metalness:1,roughness:.12,flatShading:true}));g.add(m);rod([0,0,0],[0,2,0]);for(let i=0;i<18;i++){const a=i*.85;sphere(Math.sin(a)*w*.46,Math.cos(a*2)*h*.3,Math.cos(a)*d*.46,.045,'#bb85fc');}}break;
 case 'plant':cyl(0,.3,0,.35,.6,'#ac8d70');for(let i=0;i<8;i++){const a=i*.8;rod([0,.5,0],[Math.sin(a)*.4,1.2+i*.1,Math.cos(a)*.4],.03);sphere(Math.sin(a)*.4,1.2+i*.1,Math.cos(a)*.4,.24,'#398369').scale.y=2;}break;
 case 'sign':{box(0,0,0,w,h,d,dark);const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d')!;ctx.fillStyle=dark;ctx.fillRect(0,0,1024,160);ctx.fillStyle=p.color??'#dceff5';ctx.font='bold 72px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.label??'',512,80,980);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));m.position.z=d/2+.01;g.add(m);}break;
 }
 batchProp(g);
 g.position.set(p.position.x,p.position.y,p.position.z);g.rotation.y=p.yaw??0;return g;
}
export function addLocationProps(scene:T.Scene,spec:SceneSpec){
 for(const p of spec.objects??[])scene.add(createProp(p));
 // Parent mounted equipment to its support using the relationship stored in the map file.
 for(const p of spec.objects??[]){
  if(!p.attachment)continue;
  const object=scene.getObjectByName(p.id),support=scene.getObjectByName(p.attachment.objectId);
  if(!object||!support||object===support)continue;
  support.add(object);
  const offset=p.attachment.localPosition;
  object.position.set(offset.x,offset.y,offset.z);
 }
 for(const d of spec.doors??[]){const g=new T.Group();g.name=d.id;g.add(new T.Mesh(new T.BoxGeometry(d.size.x,d.size.y,d.size.z),mat('#3c6579')));for(const x of [-1,1]){const handle=new T.Mesh(new T.BoxGeometry(.09,.35,.06),mat('#dce2db'));handle.position.set(x*(d.size.x/2+.04),0,-d.size.z*.32);g.add(handle);}if(spec.theme==='industrial-loft-bar'){const ring=new T.Mesh(new T.TorusGeometry(.35,.06,8,24),mat('#a8aaa0'));ring.position.set(0,.55,-d.size.z/2-.04);g.add(ring);const glass=new T.Mesh(new T.CircleGeometry(.29,24),mat('#364c57'));glass.position.set(0,.55,-d.size.z/2-.05);g.add(glass);const led=new T.Mesh(new T.SphereGeometry(.06,8,6),mat('#4eff87',true));led.position.set(.65,-.35,-d.size.z/2-.08);g.add(led);}scene.add(g);}
 for(const f of spec.foods??[]){const g=new T.Group();g.name=f.id;g.position.set(f.position.x,f.position.y,f.position.z);const add=(geom:T.BufferGeometry,c:string,y=0)=>{const m=new T.Mesh(geom,mat(c));m.position.y=y;g.add(m);return m;};add(new T.CylinderGeometry(.23,.23,.025,20),'#f2eee2',-.04);
 if(f.type==='apple'){add(new T.SphereGeometry(.14,16,12),'#d14a36',.12);add(new T.CylinderGeometry(.018,.018,.12,6),'#594636',.28);}else if(f.type==='pizza'){const m=add(new T.CylinderGeometry(.22,.22,.055,3),'#edbc61',.03);m.rotation.y=.5;for(let i=0;i<3;i++){const q=add(new T.CylinderGeometry(.038,.038,.012,10),'#b84633',.065);q.position.x=(i-1)*.06;q.position.z=.02;}}else if(f.type==='donut'){const m=add(new T.TorusGeometry(.12,.055,8,20),'#e199aa',.045);m.rotation.x=Math.PI/2;}else{add(new T.BoxGeometry(.3,.08,.23),'#d4a15e',.04);add(new T.BoxGeometry(.31,.025,.24),'#4e9b55',.09);add(new T.BoxGeometry(.3,.08,.23),'#f0c489',.14);}scene.add(g);}
}

export function syncLocationProps(scene:T.Scene,spec:SceneSpec){
 animateLocationDoors(scene,spec);
 for(const f of spec.foods??[]){const mesh=scene.getObjectByName(f.id);if(mesh)mesh.visible=!f.eaten;}
}

/** Merge repeated rods and panels by material to keep the detailed pavilion inexpensive to draw. */
function batchProp(group:T.Group){
 const preserved:T.Object3D[]=[];
 const batches=new Map<string,{material:T.Material;geometries:T.BufferGeometry[]}>();
 group.updateMatrixWorld(true);
 group.traverse(child=>{if(!(child instanceof T.Mesh)||Array.isArray(child.material))return;
  const m=child.material as T.MeshStandardMaterial;
  if(m.map){preserved.push(child);return;}
  const key=[m.type,m.color?.getHex(),m.roughness,m.metalness,m.opacity,m.side].join(':');
  let batch=batches.get(key);if(!batch){batch={material:m,geometries:[]};batches.set(key,batch);}
  else if(batch.material!==m)m.dispose();
  batch.geometries.push(child.geometry.clone().applyMatrix4(child.matrixWorld));child.geometry.dispose();
 });
 group.clear();if(preserved.length)group.add(...preserved);
 for(const {material,geometries} of batches.values()){const merged=mergeGeometries(geometries,false);if(merged)group.add(new T.Mesh(merged,material));for(const geometry of geometries)geometry.dispose();}
}

/** Evaluate the same timestamped motion used by server and client collisions on every frame. */
export function animateLocationDoors(scene:T.Scene,spec:SceneSpec){
 const now=Date.now();
 for(const door of spec.doors??[]){
  const mesh=scene.getObjectByName(door.id);if(!mesh)continue;
  const progress=doorProgress(door,now);
  const pose=doorPose(door,progress);
  mesh.position.set(pose.x,pose.y,pose.z);
  mesh.rotation.y=pose.angle;
 }
}
