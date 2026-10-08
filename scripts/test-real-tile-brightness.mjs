import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TileBrightness } from '../src/city/tileBrightness.ts';

test('tints streamed tile textures without changing the avatar or losing their original colors', () => {
  const tiles = new TileBrightness();
  const tileMaterial = new THREE.MeshBasicMaterial({ color: 0x80a0c0 });
  const avatarMaterial = new THREE.MeshBasicMaterial({ color: 0x80a0c0 });
  const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), tileMaterial);
  const original = tileMaterial.color.clone();

  tiles.add(tile);
  tiles.setBrightness(0.55);
  assert.ok(tileMaterial.color.equals(original.clone().multiplyScalar(0.55)));
  assert.ok(avatarMaterial.color.equals(original));

  const later = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x80a0c0 }));
  tiles.add(later);
  assert.ok(later.material.color.equals(original.clone().multiplyScalar(0.55)));

  tiles.setBrightness(1);
  assert.ok(tileMaterial.color.equals(original));
  assert.ok(later.material.color.equals(original));
  tiles.remove(tile);
  tiles.remove(later);
});
