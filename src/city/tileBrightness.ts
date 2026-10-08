import * as THREE from 'three';

/** Multiplies only streamed tile materials' albedo, preserving their original texture and color. */
export class TileBrightness {
  private originals = new Map<THREE.Material, THREE.Color>();
  private brightness = 1;

  add(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const materials = (object as THREE.Mesh).material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        const colored = material as THREE.Material & { color?: THREE.Color };
        if (!(colored.color instanceof THREE.Color) || this.originals.has(material)) continue;
        const original = colored.color.clone();
        this.originals.set(material, original);
        colored.color.copy(original).multiplyScalar(this.brightness);
      }
    });
  }

  remove(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const materials = (object as THREE.Mesh).material;
      for (const material of Array.isArray(materials) ? materials : [materials]) this.originals.delete(material);
    });
  }

  setBrightness(brightness: number) {
    if (brightness === this.brightness) return;
    this.brightness = brightness;
    for (const [material, original] of this.originals) {
      (material as THREE.Material & { color: THREE.Color }).color.copy(original).multiplyScalar(brightness);
    }
  }

  clear() {
    this.originals.clear();
  }
}
