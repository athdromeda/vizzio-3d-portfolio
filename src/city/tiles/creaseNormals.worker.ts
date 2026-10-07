// Web worker entry: receives copied positions, returns creased normals (buffer transferred back).
import { creaseNormals, type AttributeLike } from './creaseNormals';

interface Request { id: number; position: AttributeLike; creaseAngle?: number; }

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<Request>) => {
  const { id, position, creaseAngle } = e.data;
  const normal = creaseNormals(position, creaseAngle);
  ctx.postMessage({ id, normal }, [normal.array.buffer as ArrayBuffer]);
};
