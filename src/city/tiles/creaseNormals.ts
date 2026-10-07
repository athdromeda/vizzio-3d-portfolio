// Creased-normals maths for the real tiles, shared by the main thread and the worker.
// Ported from three-geospatial's TileCreasedNormalsPlugin task.
import { BufferAttribute, BufferGeometry, Vector3, type TypedArray } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A BufferAttribute's data, in a shape that survives postMessage. */
export interface AttributeLike {
  array: TypedArray;
  itemSize: number;
  normalized: boolean;
}

/** Copy an attribute into a transferable form (the copy is owned by the receiver). */
export function toAttributeLike(attribute: BufferAttribute): [AttributeLike, ArrayBufferLike[]] {
  const array = attribute.array.slice() as TypedArray;
  return [{ array, itemSize: attribute.itemSize, normalized: attribute.normalized }, [array.buffer]];
}

export function fromAttributeLike(input: AttributeLike): BufferAttribute {
  return new BufferAttribute(input.array, input.itemSize, input.normalized);
}

/** Non-indexed positions in, creased normals out, with degenerate triangles fended off NaN. */
export function creaseNormals(position: AttributeLike, creaseAngle?: number): AttributeLike {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', fromAttributeLike(position));
  const result = toCreasedNormals(geometry, creaseAngle);
  const normal = result.getAttribute('normal') as BufferAttribute;
  const v0 = new Vector3(), v1 = new Vector3(), v2 = new Vector3();
  for (let i = 0; i < normal.count; i += 3) {
    v0.fromBufferAttribute(normal, i);
    v1.fromBufferAttribute(normal, i + 1);
    v2.fromBufferAttribute(normal, i + 2);
    if (v0.length() < 0.5 || v1.length() < 0.5 || v2.length() < 0.5) {
      normal.setXYZ(i, 0, 0, 1);
      normal.setXYZ(i + 1, 0, 0, 1);
      normal.setXYZ(i + 2, 0, 0, 1);
    }
  }
  const out = toAttributeLike(normal)[0];
  geometry.dispose();
  result.dispose();
  return out;
}
