import * as THREE from 'three';
import { C2S } from '../shared/contract';
import { UI } from '../shared/config';
import { createId } from '../shared/id';
import type { GameClient } from '../shared/types';
import { expectChunk, releaseChunk, useCacheStore } from '../store/cacheStore';
import type { Npc } from './Npc';

/** <summary>Select one visible NPC near the centre, with debounce and request-generation protection.</summary> */
export class NpcLod {
  private readonly frustum = new THREE.Frustum();
  private readonly matrix = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private candidate: string | null = null;
  private active: string | null = null;
  private changedAt = 0;
  private requestedAt = 0;
  private generation = -1;
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly npcs: Map<string, Npc>, private readonly client: GameClient) {}
  update(now: number, ready: boolean) {
    if (!ready) return;
    const cache = useCacheStore.getState();
    if (cache.generation !== this.generation) { this.active = null; this.candidate = null; this.generation = cache.generation; }
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    let nearest: string | null = null; let distance = Infinity;
    for (const [id, npc] of this.npcs) {
      this.point.copy(npc.group.position); this.point.y += 1.5;
      if (!this.frustum.containsPoint(this.point)) continue;
      this.point.project(this.camera);
      const next = this.point.x ** 2 + this.point.y ** 2;
      if (next < distance) { distance = next; nearest = id; }
    }
    if (nearest !== this.candidate) { this.candidate = nearest; this.changedAt = now; }
    if (this.active && this.active !== nearest) this.release();
    if (cache.expected && now - this.requestedAt > UI.CHUNK_TIMEOUT_MS) { this.release(); this.changedAt = now; }
    if (nearest && nearest !== this.active && now - this.changedAt >= UI.LOD_DEBOUNCE_MS) this.request(nearest, now);
  }
  private request(id: string, now: number) {
    this.active = id; this.requestedAt = now;
    const reqId = createId(); expectChunk(reqId, id);
    console.info('[yaw → RequestChunk]', { reqId, ids: [id], yaw: -this.camera.rotation.y });
    void this.client.send(C2S.REQUEST_CHUNK, { reqId, ids: [id] }).catch(() => { if (this.active === id) this.release(); });
  }
  private release() {
    if (!this.active) return;
    const id = this.active; this.active = null; releaseChunk(id);
    void this.client.send(C2S.RELEASE_CHUNK, { ids: [id] }).catch(() => {});
  }
  dispose() { this.release(); }
}
