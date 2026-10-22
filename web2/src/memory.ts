import {parseMemories} from '../../src/agent/contract.js';
import type {MemoryEntry} from '../../src/agent/contract.js';
export const MEMORY_KEY='wearagain:agent:memory:v1';
type Store=Pick<Storage,'getItem'|'setItem'>|undefined;
export function readMemory(store:Store):MemoryEntry[]{try{const raw=store?.getItem(MEMORY_KEY);return raw?parseMemories(JSON.parse(raw)):[];}catch{return [];}}
export function saveMemory(store:Store,entries:readonly MemoryEntry[]):void{if(!store)throw Error('Device storage unavailable');store.setItem(MEMORY_KEY,JSON.stringify(parseMemories(entries)));}
export function remember(store:Store,entry:MemoryEntry):void{const current=readMemory(store);saveMemory(store,[...current.filter(row=>row.id!==entry.id),entry].slice(-40));}
