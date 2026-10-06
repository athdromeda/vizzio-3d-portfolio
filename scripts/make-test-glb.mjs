// Writes a minimal valid GLB (a 1 x 3 x 1 box) used only to test the avatar model slot.
import { writeFileSync } from 'node:fs';
const [w, h, d] = [0.5, 1.5, 0.5];
const pos = new Float32Array([-w,-h,-d, w,-h,-d, w,h,-d, -w,h,-d, -w,-h,d, w,-h,d, w,h,d, -w,h,d]);
const idx = new Uint16Array([0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4, 2,3,7,2,7,6, 1,2,6,1,6,5, 0,4,7,0,7,3]);
const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
const json = {
  asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-w,-h,-d], max: [w,h,d] },
    { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 96 }, { buffer: 0, byteOffset: 96, byteLength: 72 }],
  buffers: [{ byteLength: bin.length }],
};
const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const j = pad(Buffer.from(JSON.stringify(json)), 0x20);
const b = pad(bin, 0);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(process.argv[2], Buffer.concat([head, jh, j, bh, b]));
