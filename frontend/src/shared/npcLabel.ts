import type { NpcMeta } from './types';

export function npcLabel(npc: Pick<NpcMeta, 'number' | 'name'>): string {
  return `[${String(npc.number).padStart(2, '0')}] ${npc.name || 'Участник'}`;
}
