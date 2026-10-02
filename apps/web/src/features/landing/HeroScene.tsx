'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  type Group,
  type Mesh,
  type MeshPhysicalMaterial,
  type PerspectiveCamera,
  PMREMGenerator,
  type Scene,
  type WebGLRenderer,
  type Sprite,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useSceneColors, type SceneColors } from '@/shared/three/colors';
import { glowTexture } from '@/shared/three/glow';
import type { Tier } from '@/shared/three/quality';
import { useOnScreen } from '@/shared/three/useInView';

/**
 * Landing hero (ADR-0020): the three ideas of the first stages as objects.
 * A loop ring with values travelling round it, a glass "variable" box holding a value, an "if"
 * diamond tipping between two branches, joined by the path a program takes. Purely decorative
 * (aria-hidden): the text next to it says everything.
 */
export default function HeroScene({ tier }: { tier: Exclude<Tier, 'lite'> }) {
  const container = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(container);
  const colors = useSceneColors();
  return (
    <div ref={container} className="absolute inset-0" aria-hidden>
      {colors && (
        <Canvas
          frameloop={visible ? 'always' : 'never'}
          dpr={tier === 'high' ? [1, 1.75] : 1}
          camera={{ position: [0, 0, 9.5], fov: 38 }}
          gl={{ antialias: tier === 'high', alpha: true, powerPreference: 'high-performance' }}
        >
          <FitCamera />
          <Lights colors={colors} tier={tier} />
          <Rig>
            <Floating speed={0.9} offset={0}>
              <LoopRing colors={colors} position={[-2.5, 0.35, 0]} />
            </Floating>
            <Floating speed={1.1} offset={2}>
              <VariableBox colors={colors} position={[2.4, 0.9, -0.6]} />
            </Floating>
            <Floating speed={0.8} offset={4}>
              <IfDiamond colors={colors} position={[0.4, -1.7, 0.8]} />
            </Floating>
            <ProgramPath colors={colors} />
          </Rig>
          <Dust colors={colors} count={tier === 'high' ? 420 : 140} />
        </Canvas>
      )}
    </div>
  );
}

/** Moves the camera back on narrow canvases so the whole scene (about 10 units wide) always fits. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    fitCamera(camera as PerspectiveCamera, size.width / Math.max(1, size.height));
  }, [camera, size]);
  return null;
}

/** three.js objects are mutable by design; changing them happens here, outside React's view. */
function fitCamera(perspective: PerspectiveCamera, aspect: number) {
  const halfWidth = 4.5;
  const halfHeight = 2.7;
  const tan = Math.tan((perspective.fov * Math.PI) / 360);
  perspective.position.z = Math.max(halfHeight / tan, halfWidth / (tan * aspect));
  perspective.updateProjectionMatrix();
}

function Lights({ colors, tier }: { colors: SceneColors; tier: Exclude<Tier, 'lite'> }) {
  const { gl, scene } = useThree();
  // A generated studio environment gives glass and clearcoat real reflections, with no image to download.
  useEffect(() => {
    if (tier !== 'high') return;
    return applyStudioEnvironment(gl, scene);
  }, [gl, scene, tier]);
  return (
    <>
      <ambientLight intensity={colors.dark ? 0.5 : 0.9} />
      <directionalLight position={[5, 6, 5]} intensity={1.6} />
      <pointLight position={[-4, 2, 3]} intensity={30} color={colors.accent} />
      <pointLight position={[4, -2, 2]} intensity={20} color={colors.accent2} />
    </>
  );
}

/** Sets a generated environment map on the scene; returns the cleanup. */
function applyStudioEnvironment(gl: WebGLRenderer, target: Scene): () => void {
  const pmrem = new PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  target.environment = env;
  return () => {
    target.environment = null;
    env.dispose();
    pmrem.dispose();
  };
}

/** Follows the pointer a little and turns as the page scrolls: depth without asking for input. */
function Rig({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const scroll = Math.min(1, window.scrollY / window.innerHeight);
    const ease = 1 - Math.exp(-delta * 3);
    g.rotation.y += (state.pointer.x * 0.35 + scroll * 0.6 - g.rotation.y) * ease;
    g.rotation.x += (-state.pointer.y * 0.2 - g.rotation.x) * ease;
    g.position.y += (scroll * 1.4 - g.position.y) * ease;
  });
  return <group ref={group}>{children}</group>;
}

function Floating({
  children,
  speed,
  offset,
}: {
  children: ReactNode;
  speed: number;
  offset: number;
}) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * speed + offset;
    group.current.position.y = Math.sin(t) * 0.18;
    group.current.rotation.z = Math.sin(t * 0.7) * 0.06;
  });
  return <group ref={group}>{children}</group>;
}

function Glow({
  color,
  scale,
  opacity = 0.9,
}: {
  color: SceneColors['accent'];
  scale: number;
  opacity?: number;
}) {
  const map = useMemo(() => glowTexture(), []);
  return (
    <sprite scale={[scale, scale, 1]}>
      <spriteMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

/** A loop: values 1, 2, 3 go round and round. */
function LoopRing({
  colors,
  position,
}: {
  colors: SceneColors;
  position: [number, number, number];
}) {
  const values = useRef<Group[]>([]);
  useFrame(({ clock }) => {
    values.current.forEach((v, i) => {
      if (!v) return;
      const a = clock.elapsedTime * 0.9 + (i * Math.PI * 2) / 3;
      v.position.set(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0);
    });
  });
  return (
    <group position={position} rotation={[0.5, 0.35, 0]}>
      <mesh>
        <torusGeometry args={[1.35, 0.09, 24, 96]} />
        <meshPhysicalMaterial
          color={colors.accent}
          roughness={0.25}
          metalness={0.2}
          clearcoat={1}
          emissive={colors.accent}
          emissiveIntensity={0.25}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => void (values.current[i] = g!)}>
          <mesh>
            <sphereGeometry args={[0.17, 24, 24]} />
            <meshStandardMaterial
              color={colors.accent2}
              emissive={colors.accent2}
              emissiveIntensity={0.8}
            />
          </mesh>
          <Glow color={colors.accent2} scale={0.9} opacity={0.7} />
        </group>
      ))}
    </group>
  );
}

/** A variable: a box with one value inside. */
function VariableBox({
  colors,
  position,
}: {
  colors: SceneColors;
  position: [number, number, number];
}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(1.5, 1.5, 1.5, 5, 0.2), []);
  const box = useRef<Mesh>(null);
  const value = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (box.current) box.current.rotation.set(0.35 + Math.sin(t * 0.4) * 0.1, t * 0.25, 0);
    if (value.current) value.current.position.y = Math.sin(t * 2) * 0.22;
  });
  return (
    <group position={position}>
      <mesh ref={box} geometry={geometry}>
        <meshPhysicalMaterial
          color={colors.accent2}
          transparent
          opacity={0.32}
          roughness={0.08}
          metalness={0}
          clearcoat={1}
          transmission={0}
          depthWrite={false}
        />
      </mesh>
      <group ref={value}>
        <mesh>
          <icosahedronGeometry args={[0.32, 2]} />
          <meshStandardMaterial
            color={colors.xp}
            emissive={colors.xp}
            emissiveIntensity={0.6}
            roughness={0.3}
          />
        </mesh>
        <Glow color={colors.xp} scale={1.4} opacity={0.6} />
      </group>
    </group>
  );
}

/** A decision: the diamond tips to one side, and that branch lights up. */
function IfDiamond({
  colors,
  position,
}: {
  colors: SceneColors;
  position: [number, number, number];
}) {
  const diamond = useRef<Mesh>(null);
  const left = useRef<MeshPhysicalMaterial>(null);
  const right = useRef<MeshPhysicalMaterial>(null);
  useFrame(({ clock }) => {
    const s = Math.sin(clock.elapsedTime * 1.2);
    if (diamond.current) {
      diamond.current.rotation.y = clock.elapsedTime * 0.6;
      diamond.current.rotation.z = s * 0.35;
    }
    if (left.current) left.current.emissiveIntensity = s > 0 ? 1.2 : 0.05;
    if (right.current) right.current.emissiveIntensity = s > 0 ? 0.05 : 1.2;
  });
  return (
    <group position={position}>
      <mesh ref={diamond}>
        <octahedronGeometry args={[0.75, 0]} />
        <meshPhysicalMaterial
          color={colors.accent}
          roughness={0.2}
          clearcoat={1}
          flatShading
          emissive={colors.accent}
          emissiveIntensity={0.2}
        />
      </mesh>
      {[-1.25, 1.25].map((x, i) => (
        <mesh key={x} position={[x, -0.55, 0]}>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshPhysicalMaterial
            ref={i === 0 ? left : right}
            color={colors.success}
            emissive={colors.success}
          />
        </mesh>
      ))}
    </group>
  );
}

/** The program counter: a light travelling the path between the ideas. */
function ProgramPath({ colors }: { colors: SceneColors }) {
  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          new Vector3(-4.2, 1.6, -1),
          new Vector3(-2.5, 0.35, 0),
          new Vector3(-0.8, -1.2, 0.6),
          new Vector3(0.4, -1.7, 0.8),
          new Vector3(1.6, -0.4, 0.2),
          new Vector3(2.4, 0.9, -0.6),
          new Vector3(4.2, 2.2, -1.2),
        ],
        false,
        'catmullrom',
        0.5,
      ),
    [],
  );
  const runner = useRef<Sprite>(null);
  useFrame(({ clock }) => {
    if (runner.current)
      runner.current.position.copy(curve.getPointAt((clock.elapsedTime * 0.12) % 1));
  });
  const map = useMemo(() => glowTexture(), []);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 160, 0.022, 8, false]} />
        <meshBasicMaterial color={colors.accent} transparent opacity={colors.dark ? 0.55 : 0.35} />
      </mesh>
      <sprite ref={runner} scale={[0.8, 0.8, 1]}>
        <spriteMaterial
          map={map}
          color={colors.accent2}
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </sprite>
    </group>
  );
}

/** Slow particles for depth. */
function Dust({ colors, count }: { colors: SceneColors; count: number }) {
  const points = useRef<Group>(null);
  const geometry = useMemo(() => {
    const positions: number[] = [];
    // Deterministic, so the scene looks the same on every load.
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < count; i++) positions.push(random() * 9, random() * 5, random() * 4 - 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return g;
  }, [count]);
  const map = useMemo(() => glowTexture(), []);
  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.02;
  });
  return (
    <group ref={points}>
      <points geometry={geometry}>
        <pointsMaterial
          map={map}
          size={0.09}
          color={colors.accent}
          transparent
          opacity={colors.dark ? 0.7 : 0.45}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
