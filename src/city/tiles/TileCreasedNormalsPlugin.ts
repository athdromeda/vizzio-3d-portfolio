// Ported from three-geospatial's TileCreasedNormalsPlugin: give the streamed tiles real per-face
// normals so the atmosphere's sun/sky light can shade their edges. Google's tiles ship flat normals.
import type { TilesRenderer } from '3d-tiles-renderer';
import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three';
import { fromAttributeLike, toAttributeLike } from './creaseNormals';
import { creaseNormalsAsync } from './creasedNormalsPool';

export interface TileCreasedNormalsPluginOptions {
  creaseAngle?: number;
}

export class TileCreasedNormalsPlugin {
  tiles?: TilesRenderer;
  readonly options: TileCreasedNormalsPluginOptions;
  /** Run before other tile processors, as in the reference. */
  priority = -1000;

  constructor(options?: TileCreasedNormalsPluginOptions) {
    this.options = { ...options };
  }

  init(tiles: TilesRenderer): void {
    this.tiles = tiles;
    tiles.forEachLoadedModel((scene) => void this.processTileModel(scene));
  }

  async processTileModel(scene: Object3D): Promise<void> {
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh && object.geometry instanceof BufferGeometry) {
        const { geometry } = object;
        if (geometry.index != null) {
          object.geometry = geometry.toNonIndexed();
          geometry.dispose();
        }
        meshes.push(object);
      }
    });
    await Promise.all(meshes.map(async (mesh) => {
      const source = mesh.geometry.getAttribute('position');
      if (!(source instanceof BufferAttribute)) return;
      const [position] = toAttributeLike(source);
      const normal = await creaseNormalsAsync(position, this.options.creaseAngle);
      mesh.geometry.setAttribute('normal', fromAttributeLike(normal));
    }));
  }

  dispose(): void {}
}
