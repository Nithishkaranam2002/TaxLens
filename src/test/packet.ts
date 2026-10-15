import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Packet } from '../data/packet';

let cached: Packet | null = null;
export function loadTestPacket(): Packet {
  if (!cached) cached = JSON.parse(readFileSync(resolve(__dirname, '../../public/packet.json'), 'utf8')) as Packet;
  return cached;
}
