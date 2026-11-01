import type { NpcMeta } from './types';

export function npcLabel(npc: Pick<NpcMeta, 'number' | 'name'>): string {
  return `[${npc.number}] ${npc.name || 'Участник'}`;
}
