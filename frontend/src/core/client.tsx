import { createContext, useContext } from 'react';
import { S2C } from '../shared/contract';
import type { Commands, EventHandler, GameClient } from '../shared/types';
import { applyGameEvent, useGameStore, type ConnectionStatus } from '../store/gameStore';
import { acceptChunk, resetCache, releaseChunk } from '../store/cacheStore';

export const ClientContext = createContext<GameClient | null>(null);
/** <summary>Inject the selected transport into components and the three.js scene.</summary> */
export function useClient() {
  const client = useContext(ClientContext);
  if (!client) throw new Error('Game client is not mounted');
  return client;
}
export const receiveEvent: EventHandler = (event, payload) => {
  if (event === S2C.STATE_SNAPSHOT) resetCache((payload as import('../shared/types').Snapshot).worldSizeBytes);
  if (event === S2C.CHUNK_DATA) acceptChunk(payload as import('../shared/types').Events[typeof S2C.CHUNK_DATA]);
  if (event === S2C.NPCS_REMOVED) {
    const { ids } = payload as import('../shared/types').Events[typeof S2C.NPCS_REMOVED];
    ids.forEach(releaseChunk);
  }
  applyGameEvent(event, payload);
};
/** <summary>Drop cached details when the authenticated connection is lost.</summary> */
export function connectionStatus(connection: ConnectionStatus) {
  useGameStore.setState({ connection });
  if (connection === 'offline' || connection === 'reconnecting') resetCache();
}
/** <summary>Never optimistically mutate the authoritative board or score.</summary> */
export async function command<K extends keyof Commands>(client: GameClient, method: K, payload: Commands[K]) {
  try { await client.send(method, payload); return true; }
  catch { useGameStore.setState({ error: 'Команда не подтверждена. Проверьте соединение и состояние доски перед повтором.' }); return false; }
}
