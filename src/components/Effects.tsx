import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
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
  /** Seconds used to ease between changed settings. Omit for an immediate change. */
  transition?: number;
}

/** Bloom + tone mapping for a scene, with MSAA kept on. Takes over rendering from R3F. */
export function Effects({ threshold, strength, radius, transition = 0 }: Props) {
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
  const change = useRef({ elapsed: 1, duration: 0, fromThreshold: threshold, fromStrength: strength, fromRadius: radius });
  // The look can change while the scene runs without rebuilding the passes.
  useEffect(() => {
    if (!transition) {
      bloom.threshold = threshold;
      bloom.strength = strength;
      bloom.radius = radius;
      return;
    }
    change.current = { elapsed: 0, duration: transition, fromThreshold: bloom.threshold, fromStrength: bloom.strength, fromRadius: bloom.radius };
  }, [bloom, threshold, strength, radius, transition]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((_, dt) => {
    const c = change.current;
    if (c.elapsed < c.duration) {
      c.elapsed = Math.min(c.duration, c.elapsed + dt);
      const x = c.elapsed / c.duration;
      const k = x * x * (3 - 2 * x);
      bloom.threshold = THREE.MathUtils.lerp(c.fromThreshold, threshold, k);
      bloom.strength = THREE.MathUtils.lerp(c.fromStrength, strength, k);
      bloom.radius = THREE.MathUtils.lerp(c.fromRadius, radius, k);
    }
    composer.render(dt);
  }, 1);
  return null;
}
