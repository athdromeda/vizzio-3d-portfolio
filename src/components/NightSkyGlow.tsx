// A subtle glow for the real city's night sky. The physical atmosphere has no airglow or light
// pollution, so the sky goes almost black after sunset. This adds a faint warm lift at the horizon
// (city light pollution) and a cool one above it, active only at night. Depth testing stays on, so
// buildings occlude the glow and it reads as sky, never as an overlay.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';

// Cool and low: a broad blue-night gradient, never a warm sunset band.
const HORIZON = new THREE.Color(0.02, 0.028, 0.048);
const ZENITH = new THREE.Color(0.008, 0.013, 0.028);

interface Props {
  /** The atmosphere's current hour, animated by AtmosphereSky. */
  hourRef: RefObject<number>;
}

export function NightSkyGlow({ hourRef }: Props) {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uNight: { value: 0 },
          uHorizon: { value: HORIZON.clone() },
          uZenith: { value: ZENITH.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uNight;
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            float horizon = pow(1.0 - clamp(h, 0.0, 1.0), 2.0);
            vec3 col = mix(uZenith, uHorizon, horizon);
            col *= smoothstep(-0.04, 0.2, h);
            gl_FragColor = vec4(col * uNight, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    [],
  );
  useFrame(() => {
    material.uniforms.uNight.value = THREE.MathUtils.smoothstep(hourRef.current, 17, 21);
    mesh.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={mesh} material={material} renderOrder={999}>
      <sphereGeometry args={[20000, 32, 16]} />
    </mesh>
  );
}
