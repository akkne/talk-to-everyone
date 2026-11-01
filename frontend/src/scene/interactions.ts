import type { SceneSpec, Vec3 } from './world';
export function nearestInteraction(scene: SceneSpec, position: Vec3) {
 const candidates = [
  ...(scene.doors ?? []).map(d => ({id:d.id,position:d.center,hint:`E — ${d.open?'закрыть':'открыть'} · ${d.label}`})),
  ...(scene.foods ?? []).filter(f=>!f.eaten).map(f=>({id:f.id,position:f.position,hint:`E — съесть · ${f.label}`})),
 ];
 return candidates.filter(c=>Math.abs(position.y)<.25 && Math.hypot(c.position.x-position.x,c.position.z-position.z)<=2 && reachable(scene,position,c.position))
 .sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.z-position.z))[0];
}
function reachable(scene:SceneSpec,a:Vec3,b:Vec3){
 const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08));
 for(let i=1;i<count;i++){const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count;
 if(scene.room.walls.some(w=>a.y < w.center.y+w.size.y/2 && a.y+1.8 > w.center.y-w.size.y/2 && Math.abs(x-w.center.x)<w.size.x/2+.3 && Math.abs(z-w.center.z)<w.size.z/2+.3))return false;
 }return true;
}
