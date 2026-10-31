import { create } from 'zustand';
import { NpcCache } from '../core/cache';
import type { Chunk, Events } from '../shared/types';
import { S2C } from '../shared/contract';

interface CacheState {
  entries: Record<string, Chunk>; bytes: number; worldBytes: number; ratio: number | null;
  expected: { reqId: string; id: string } | null; generation: number; warning: string | null;
}
const cache = new NpcCache();
export const useCacheStore = create<CacheState>(() => ({ entries: {}, bytes: 0, worldBytes: 0, ratio: null, expected: null, generation: 0, warning: null }));
/** <summary>Publish references only to currently resident details.</summary> */
function publish() { useCacheStore.setState({ entries: cache.snapshot(), bytes: cache.bytes, worldBytes: cache.worldSizeBytes, ratio: cache.getCacheRatio() }); }
/** <summary>Invalidate every outstanding response on reconnect or session change.</summary> */
export function resetCache(worldBytes = 0) {
  cache.reset(worldBytes);
  useCacheStore.setState(s => ({ expected: null, generation: s.generation + 1, warning: null }));
  publish();
}
/** <summary>Only the latest requested NPC is eligible to enter the cache.</summary> */
export function expectChunk(reqId: string, id: string) { useCacheStore.setState({ expected: { reqId, id }, warning: null }); }
/** <summary>Discard data immediately, before awaiting the release acknowledgement.</summary> */
export function releaseChunk(id: string) {
  cache.remove(id);
  useCacheStore.setState({ expected: null });
  publish();
}
/** <summary>Reject stale responses and oversized details without keeping a second copy.</summary> */
export function acceptChunk(payload: Events[typeof S2C.CHUNK_DATA]) {
  const pending = useCacheStore.getState().expected;
  if (!pending || pending.reqId !== payload.reqId) return;
  const chunk = payload.npcs.find(x => x.id === pending.id);
  const accepted = chunk ? cache.put(chunk) : false;
  useCacheStore.setState({ expected: null, warning: accepted ? null : 'Детали не загружены: проверьте размер мира и лимит 10%.' });
  publish();
}
