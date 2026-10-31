/** <summary>Unlike randomUUID, getRandomValues also works on plain HTTP LAN origins.</summary> */
export function createId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
}
