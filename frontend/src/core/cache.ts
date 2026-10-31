import { NET } from '../shared/contract';
import { UI } from '../shared/config';
import type { Chunk } from '../shared/types';

/** <summary>LRU with both item and byte limits; oversized records are never retained.</summary> */
export class NpcCache {
  private readonly entries = new Map<string, Chunk>();
  private worldBytes = 0;

  /** <summary>A snapshot starts a new cache generation.</summary> */
  reset(worldBytes = 0) { this.entries.clear(); this.worldBytes = Number.isFinite(worldBytes) ? Math.max(0, worldBytes) : 0; }
  /** <summary>Reading a cached entry updates recency.</summary> */
  get(id: string) {
    const value = this.entries.get(id);
    if (value) { this.entries.delete(id); this.entries.set(id, value); }
    return value;
  }
  /** <summary>Charge at least the UTF-8 payload size, never blindly trust a smaller declared size.</summary> */
  put(chunk: Chunk) {
    if (!Number.isFinite(chunk.sizeBytes) || chunk.sizeBytes < 0) return false;
    const bytes = Math.max(chunk.sizeBytes, new TextEncoder().encode(JSON.stringify(chunk.details)).length);
    if (!this.worldBytes || bytes > this.worldBytes * UI.MAX_CACHE_RATIO) return false;
    this.entries.delete(chunk.id);
    while (this.entries.size >= NET.CACHE_MAX_ITEMS || this.bytes + bytes > this.worldBytes * UI.MAX_CACHE_RATIO) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(chunk.id, { ...chunk, sizeBytes: bytes });
    this.log();
    return true;
  }
  /** <summary>Release immediately when the view changes.</summary> */
  remove(id: string) { this.entries.delete(id); this.log(); }
  get bytes() { return [...this.entries.values()].reduce((total, x) => total + x.sizeBytes, 0); }
  get size() { return this.entries.size; }
  get worldSizeBytes() { return this.worldBytes; }
  /** <summary>Unknown world size is reported as unknown, not a fabricated zero percent.</summary> */
  getCacheRatio() { return this.worldBytes > 0 ? this.bytes / this.worldBytes : null; }
  snapshot() { return Object.fromEntries(this.entries); }
  private log() { console.info('[cache/world]', { items: this.size, bytes: this.bytes, worldBytes: this.worldBytes, ratio: this.getCacheRatio() }); }
}
