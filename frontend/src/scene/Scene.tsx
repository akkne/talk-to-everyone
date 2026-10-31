import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useClient } from '../core/client';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { setupRoom, disposeScene } from './setup';
import { CameraController } from './CameraController';
import { Npc } from './Npc';
import { NpcLod } from './lod';

/** <summary>One visible canvas; subscription callbacks bridge Zustand to the imperative three.js scene.</summary> */
export function Scene({ controlsBlocked = false }: { controlsBlocked?: boolean }) {
  const blocked = useRef(controlsBlocked); blocked.current = controlsBlocked;
  const canvas = useRef<HTMLCanvasElement>(null);
  const client = useClient();
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  useEffect(() => {
    const element = canvas.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: element, antialias: true }); }
    catch { setError('Не удалось запустить WebGL. Включите аппаратное ускорение в Chrome и перезагрузите страницу.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const spec = useGameStore.getState().scene;
    if (!spec) { renderer.dispose(); setError('Сервер не прислал описание сцены.'); return; }
    const scene = new THREE.Scene(); setupRoom(scene, spec);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 40);
    const controller = new CameraController(camera, element, client, spec, setHint, message => useGameStore.setState({ error: message }));
    const npcs = new Map<string, Npc>(); const judges = new Map<string, Npc>();
    const lod = new NpcLod(camera, npcs, client);
    let lastChat = ''; let lastMeSeq = -1; let lastSeat: string | null = null;
    const sync = () => {
      const state = useGameStore.getState();
      controller.setOccupied(state.seats.filter(seat => seat.occupiedBy && seat.occupiedBy !== state.playerId).map(seat => seat.id));
      for (const [id, npc] of npcs) if (!state.npcs.some(n => n.id === id)) {
        scene.remove(npc.group); npc.dispose(); npcs.delete(id);
      }
      for (const meta of state.npcs) if (!npcs.has(meta.id)) {
        const stand = spec.npcStands.find(x => x.id === meta.anchorId);
        if (!stand) continue;
        const npc = new Npc(meta);
        npc.group.position.set(stand.position.x, stand.position.y, stand.position.z);
        npc.group.rotation.y = stand.yaw;
        npcs.set(meta.id, npc); scene.add(npc.group);
      }
      const me = state.players.find(p => p.id === state.playerId);
      if (me && (lastMeSeq < 0 || me.pose.seatId !== lastSeat || (me.pose.seq > lastMeSeq && controller.differsFrom(me.pose)))) {
        lastMeSeq = me.pose.seq; lastSeat = me.pose.seatId; controller.syncPose(me.pose);
      }
      if (me) lastMeSeq = Math.max(lastMeSeq, me.pose.seq);
      syncPlayers();
      const latest = state.chat.at(-1);
      if (latest && latest.id !== lastChat) { lastChat = latest.id; npcs.get(latest.npc)?.say(latest.text); }
    };
    const syncPlayers = () => {
      const state = useGameStore.getState();
      const others = state.players.filter(p => p.id !== state.playerId);
      for (const [id, judge] of judges) judge.group.visible = others.some(p => p.id === id && p.connected);
      others.forEach(player => {
        let judge = judges.get(player.id);
        if (!judge) {
          judge = new Npc({ id: player.id, number: 0, color: '#dfbf63', anchorId: '' });
          judge.setName(player.name);
          judges.set(player.id, judge); scene.add(judge.group);
        }
        judge.group.visible = player.connected;
        judge.group.position.set(player.pose.position.x, player.pose.position.y, player.pose.position.z);
        judge.group.rotation.y = -player.pose.yaw;
        judge.head.rotation.x = -player.pose.pitch;
      });
    };
    const syncCache = () => { const entries = useCacheStore.getState().entries; npcs.forEach((npc, id) => npc.setName(entries[id]?.details.displayName)); };
    sync(); syncCache();
    const unsubscribe = useGameStore.subscribe(sync); const unsubscribeCache = useCacheStore.subscribe(syncCache);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const lost = (event: Event) => { event.preventDefault(); setError('Графический контекст потерян. Перезагрузите страницу и войдите в сессию снова.'); };
    element.addEventListener('webglcontextlost', lost);
    let frame = 0; let frames = 0; let sampleAt = performance.now();
    const animate = (now: number) => {
      controller.setEnabled(!blocked.current && !useGameStore.getState().boardOpen && useGameStore.getState().connection === 'ready');
      frame = requestAnimationFrame(animate); controller.update(now); npcs.forEach(npc => npc.update(now));
      lod.update(now, useGameStore.getState().connection === 'ready');
      renderer.render(scene, camera); frames++;
      if (now - sampleAt >= 1000) {
        const info = renderer.info;
        useGameStore.setState({ metrics: { fps: Math.round(frames * 1000 / (now - sampleAt)), calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures } });
        frames = 0; sampleAt = now;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); unsubscribe(); unsubscribeCache();
      element.removeEventListener('webglcontextlost', lost); controller.dispose(); lod.dispose(); disposeScene(scene); renderer.dispose();
    };
  }, [client]);
  return <div className="absolute inset-0"><canvas ref={canvas} className="h-full w-full outline-none" tabIndex={0} aria-label="Комната расследования. WASD — ходьба, мышь — обзор, E — сесть или встать." />
    {error && <div className="scene-error" role="alert">{error}</div>}
    <div className="movement-hint" role="status">{hint}</div>
  </div>;
}
