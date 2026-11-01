import type { SceneSpec, Vec3 } from './world';

const actionNames: Record<string, string> = {
  peek_porthole: 'заглянуть', jiggle_handle: 'проверить ручку', knock_loudly: 'постучать',
  toggle_factory_mood: 'свет', toggle_overhead_fan: 'вентилятор',
  change_track_lofi: 'лоу фай', change_track_triphop: 'трип хоп', change_track_industrial: 'индастриал', mute: 'выключить',
  spin_rods: 'сыграть', read_private_notes: 'читать заметки', leave_note: 'записать',
  kick_machine: 'пнуть', buy_soda: 'газировка',
};
const objectNames: Record<string, string> = {
  'interact-door': 'дверь', 'interact-switchboard': 'щиток',
  'interact-vinyl': 'проигрыватель', 'interact-foosball': 'кикер',
  'interact-lounge-table': 'стол', 'interact-vending': 'автомат',
};

export function nearestInteraction(scene: SceneSpec, position: Vec3) {
  const candidates = [
    ...(scene.interactiveObjects ?? []).map(item => ({
      id: item.id, position: item.interactionTrigger, radius: item.interactionTrigger.radius,
      actions: item.actions,
      hint: `${objectNames[item.id] ?? item.id}: ${item.actions.map((action, index) => `${index === 0 ? 'E/1' : index + 1} — ${actionNames[action] ?? action}`).join(' · ')}`,
    })),
    ...(scene.doors ?? []).filter(d => !scene.interactiveObjects?.some(item => item.targetId === d.id)).map(d => ({ id: d.id, position: d.center, radius: 2, actions: [] as string[], hint: `E — ${d.open ? 'закрыть' : 'открыть'} · ${d.label}` })),
    ...(scene.foods ?? []).filter(f => !f.eaten).map(f => ({ id: f.id, position: f.position, radius: 2, actions: [] as string[], hint: `E — ${f.restockDelayMs ? 'взять' : 'съесть'} · ${f.label}` })),
  ];
  return candidates.filter(c => Math.abs(position.y) < .35 &&
    Math.hypot(c.position.x - position.x, c.position.z - position.z) <= c.radius && reachable(scene, position, c.position))
    .sort((a, b) => Math.hypot(a.position.x - position.x, a.position.z - position.z) - Math.hypot(b.position.x - position.x, b.position.z - position.z))[0];
}

function reachable(scene: SceneSpec, a: Vec3, b: Vec3) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .08));
  for (let i = 1; i < count; i++) {
    const x = a.x + (b.x - a.x) * i / count, z = a.z + (b.z - a.z) * i / count;
    if (scene.room.walls.some(w => a.y < w.center.y + w.size.y / 2 && a.y + 1.8 > w.center.y - w.size.y / 2 &&
      Math.abs(x - w.center.x) < w.size.x / 2 + .3 && Math.abs(z - w.center.z) < w.size.z / 2 + .3)) return false;
  }
  return true;
}
