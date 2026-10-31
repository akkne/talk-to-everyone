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
    if (!spec) { renderer.dispose(); setError('Сервер не передал SceneSpec. Для осмотра студии выберите локальный режим.'); return; }
    const scene = new THREE.Scene(); setupRoom(scene, spec);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 40); camera.position.set(0, 1.65, 2.6);
    const controller = new CameraController(camera, element, client, spec, useGameStore.getState().preview, setHint, message => useGameStore.setState({ error: message }));
    const npcs = new Map<string, Npc>(); const judges = new Map<string, Npc>();
    const lod = new NpcLod(camera, npcs, client);
    let initializedPose = false;
    let lastChat = ''; let lastReaction = -1;
    const sync = () => {
      const state = useGameStore.getState();
      for (const meta of state.npcs) if (!npcs.has(meta.id)) {
        const anchor = spec.npcStands.find(a => a.id === meta.anchorId) ?? spec.npcStands[meta.index];
        if (!anchor) continue;
        const npc = new Npc(meta);
        npc.group.position.copy(anchor.position); npc.group.rotation.y = -anchor.yaw;
        npcs.set(meta.id, npc); scene.add(npc.group);
      }
      controller.setOccupied(state.seats.filter(s => s.occupiedBy !== null && s.occupiedBy !== state.playerId).map(s => s.id));
      const pose = state.players.find(p => p.id === state.playerId)?.pose;
      if (pose) { controller.reconcile(pose, !initializedPose); initializedPose = true; }
      syncPlayers();
      const latest = state.chat.at(-1);
      if (latest && latest.id !== lastChat) { lastChat = latest.id; npcs.get(latest.npc)?.say(latest.text); }
      const reaction = state.reactions.at(-1);
      if (reaction && reaction.at !== lastReaction) { lastReaction = reaction.at; npcs.get(reaction.npc)?.react(reaction.at); }
    };
    const syncPlayers = () => {
      const state = useGameStore.getState();
      const others = state.players.filter(p => p.id !== state.playerId);
      for (const [id, judge] of judges) judge.group.visible = others.some(p => p.id === id && p.connected);
      others.forEach((player, i) => {
        let judge = judges.get(player.id);
        if (!judge) {
          judge = new Npc({ id: player.id, index: i, color: '#dfbf63' });
          judge.group.position.set((i % 2 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 0.85), 0, 2.8);
          judge.setName(state.lobby?.players.find(p => p.id === player.id)?.name || `Судья ${i + 2}`);
          judges.set(player.id, judge); scene.add(judge.group);
        }
        judge.group.visible = player.connected;
        if (player.pose) judge.group.position.copy(player.pose.position);
        judge.head.rotation.set(player.pose?.pitch ?? player.pitch, Math.PI - (player.pose?.yaw ?? player.yaw), 0, 'YXZ');
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
    let previous = performance.now();
    let frame = 0; let frames = 0; let sampleAt = performance.now();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const state = useGameStore.getState();
      controller.setEnabled(!blocked.current && !state.boardOpen && state.phase === 'playing' && state.connection === 'ready');
      controller.update(Math.min((now - previous) / 1000, .05), now); previous = now;
      npcs.forEach(npc => npc.update(now));
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
