// One worker for the whole app: tile creasing is bursty but never parallel enough to fan out.
import type { AttributeLike } from './creaseNormals';

interface Reply { id: number; normal: AttributeLike; }

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (normal: AttributeLike) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./creaseNormals.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const resolve = waiting.get(e.data.id);
    if (resolve) {
      waiting.delete(e.data.id);
      resolve(e.data.normal);
    }
  };
  return worker;
}

export function creaseNormalsAsync(position: AttributeLike, creaseAngle?: number): Promise<AttributeLike> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, position, creaseAngle }, [position.array.buffer as ArrayBuffer]);
  });
}
