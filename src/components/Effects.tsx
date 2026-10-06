import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface Props {
  /** Linear brightness above which pixels glow. Tune per scene so only lamps, windows and the sun cross it. */
  threshold: number;
  strength: number;
  radius: number;
}

/** Bloom + tone mapping for a scene, with MSAA kept on. Takes over rendering from R3F. */
export function Effects({ threshold, strength, radius }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const { composer, bloom } = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.2, 0.4, 1);
    c.addPass(b);
    c.addPass(new OutputPass());
    return { composer: c, bloom: b };
  }, [gl, scene, camera]);
  // the look can change while the scene runs (day and dusk), without rebuilding the passes
  useEffect(() => {
    bloom.threshold = threshold;
    bloom.strength = strength;
    bloom.radius = radius;
  }, [bloom, threshold, strength, radius]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((_, dt) => composer.render(dt), 1);
  return null;
}
