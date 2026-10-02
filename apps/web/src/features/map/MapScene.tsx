'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type Group,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  QuadraticBezierCurve3,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useSceneColors, type SceneColors } from '@/shared/three/colors';
import { glowTexture } from '@/shared/three/glow';
import type { Tier } from '@/shared/three/quality';
import { useOnScreen } from '@/shared/three/useInView';
import type { MapLayout, Vec3 } from './layout';

export type NodeState = 'locked' | 'available' | 'learning' | 'mastered' | 'soon';

export interface MapSceneProps {
  layout: MapLayout;
  states: Record<string, NodeState>;
  /** Concept the camera should fly to (selected in the sheet, or with the keyboard). */
  focusId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Called every frame with each node's screen position, for the DOM label. */
  onProject?: (id: string, x: number, y: number) => void;
  tier: Exclude<Tier, 'lite'>;
}

/**
 * The learning path in 3D (ADR-0020). Stages are floating islands; concepts glow by status;
 * bridges light up as prerequisites are learned. Drag to look around, scroll or pinch to zoom;
 * selecting a concept flies the camera to it.
 */
export default function MapScene(props: MapSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(container);
  const colors = useSceneColors();
  return (
    <div ref={container} className="absolute inset-0">
      {colors && (
        <Canvas
          frameloop={visible ? 'always' : 'never'}
          dpr={props.tier === 'high' ? [1, 1.75] : 1}
          camera={{ position: [0, 9, 16], fov: 42 }}
          gl={{
            antialias: props.tier === 'high',
            alpha: true,
            powerPreference: 'high-performance',
          }}
          onPointerMissed={() => props.onHover(null)}
        >
          <ambientLight intensity={colors.dark ? 0.55 : 1} />
          <directionalLight position={[6, 12, 8]} intensity={1.8} />
          <hemisphereLight args={[colors.accent2, colors.accent, 0.35]} />
          <CameraRig layout={props.layout} focusId={props.focusId} />
          {props.layout.islands.map((island, i) => (
            <Island
              key={island.stageId}
              center={island.center}
              radius={island.radius}
              colors={colors}
              index={i}
            />
          ))}
          {props.layout.edges.map((edge) => (
            <Bridge
              key={`${edge.from}-${edge.to}`}
              layout={props.layout}
              {...edge}
              states={props.states}
              colors={colors}
            />
          ))}
          {props.layout.nodes.map((node) => (
            <ConceptNode
              key={node.id}
              id={node.id}
              position={node.position}
              state={props.states[node.id] ?? 'locked'}
              highlighted={props.hoverId === node.id || props.focusId === node.id}
              colors={colors}
              onHover={props.onHover}
              onSelect={props.onSelect}
              onProject={props.onProject}
            />
          ))}
        </Canvas>
      )}
    </div>
  );
}

/** Orbit controls within gentle limits, plus a smooth flight to the focused concept. */
function CameraRig({ layout, focusId }: { layout: MapLayout; focusId: string | null }) {
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const flight = useRef<{ target: Vector3; position: Vector3 } | null>(null);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = 1.25;
    c.minDistance = 5;
    c.maxDistance = 34;
    c.enablePan = false;
    c.target.set(0, 1, 0);
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl]);

  // Fit the whole path in view on first render and when the canvas changes shape.
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const width = layout.bounds.maxX - layout.bounds.minX + 4;
    const tan = Math.tan((perspective.fov * Math.PI) / 360);
    const distance = Math.min(34, Math.max(11, width / 2 / (tan * (size.width / size.height))));
    // Look at the middle of the path, from a little above.
    const midY =
      layout.islands.reduce((sum, i) => sum + i.center[1], 0) / Math.max(1, layout.islands.length);
    perspective.position.set(0, midY + distance * 0.45, distance * 0.9);
    perspective.updateProjectionMatrix();
    controls.current?.target.set(0, midY - 0.4, 0);
  }, [camera, layout, size]);

  useEffect(() => {
    const node = layout.nodes.find((n) => n.id === focusId);
    const c = controls.current;
    if (!node || !c) return;
    const target = new Vector3(...node.position);
    // Keep the current viewing direction, come in closer.
    const direction = camera.position.clone().sub(c.target).normalize();
    flight.current = { target, position: target.clone().add(direction.multiplyScalar(9)) };
  }, [focusId, layout, camera]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const f = flight.current;
    if (f) {
      const ease = 1 - Math.exp(-delta * 4);
      c.target.lerp(f.target, ease);
      camera.position.lerp(f.position, ease);
      if (camera.position.distanceTo(f.position) < 0.05) flight.current = null;
    }
    c.update();
  });
  return null;
}

function Island({
  center,
  radius,
  colors,
  index,
}: {
  center: Vec3;
  radius: number;
  colors: SceneColors;
  index: number;
}) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (group.current)
      group.current.position.y = center[1] + Math.sin(clock.elapsedTime * 0.6 + index) * 0.12;
  });
  const top = colors.surface
    .clone()
    .lerp(index % 2 ? colors.accent2 : colors.accent, colors.dark ? 0.25 : 0.12);
  const rock = colors.accent.clone().lerp(colors.bg, colors.dark ? 0.55 : 0.35);
  return (
    <group ref={group} position={[center[0], center[1], center[2]]}>
      {/* grassy top */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[radius, radius * 0.92, 0.35, 10]} />
        <meshStandardMaterial color={top} flatShading roughness={0.85} />
      </mesh>
      {/* rocky underside */}
      <mesh position={[0, -0.75, 0]}>
        <coneGeometry args={[radius * 0.9, 1.6, 10]} />
        <meshStandardMaterial color={rock} flatShading roughness={0.95} />
      </mesh>
    </group>
  );
}

function Bridge({
  layout,
  from,
  to,
  states,
  colors,
}: {
  layout: MapLayout;
  from: string;
  to: string;
  states: Record<string, NodeState>;
  colors: SceneColors;
}) {
  const curve = useMemo(() => {
    const a = new Vector3(...layout.nodes.find((n) => n.id === from)!.position);
    const b = new Vector3(...layout.nodes.find((n) => n.id === to)!.position);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.6 + a.distanceTo(b) * 0.12;
    return new QuadraticBezierCurve3(a, mid, b);
  }, [layout, from, to]);
  const learned = states[from] === 'mastered' || states[from] === 'learning';
  return (
    <mesh>
      <tubeGeometry args={[curve, 40, learned ? 0.05 : 0.03, 6, false]} />
      <meshBasicMaterial
        color={learned ? colors.accent : colors.muted}
        transparent
        opacity={learned ? 0.85 : 0.35}
      />
    </mesh>
  );
}

const projected = new Vector3();

function ConceptNode({
  id,
  position,
  state,
  highlighted,
  colors,
  onHover,
  onSelect,
  onProject,
}: {
  id: string;
  position: Vec3;
  state: NodeState;
  highlighted: boolean;
  colors: SceneColors;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onProject?: (id: string, x: number, y: number) => void;
}) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const ring = useRef<Group>(null);
  const map = useMemo(() => glowTexture(), []);
  const color = {
    locked: colors.muted,
    soon: colors.muted,
    available: colors.accent,
    learning: colors.accent2,
    mastered: colors.xp,
  }[state];
  const lit = state === 'available' || state === 'learning' || state === 'mastered';

  useFrame(({ clock, camera, size }, delta) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    const targetScale = highlighted ? 1.35 : 1;
    g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * (1 - Math.exp(-delta * 10)));
    if (material.current && state === 'available')
      material.current.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.35;
    if (ring.current) ring.current.rotation.z = t * 0.8;
    if (onProject && highlighted) {
      g.getWorldPosition(projected).project(camera);
      onProject(id, ((projected.x + 1) / 2) * size.width, ((1 - projected.y) / 2) * size.height);
    }
  });

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = state === 'soon' ? 'default' : 'pointer';
      onHover(id);
    },
    onPointerOut: () => {
      document.body.style.cursor = '';
      onHover(null);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(id);
    },
  };

  return (
    <group ref={group} position={position}>
      <mesh {...handlers}>
        <icosahedronGeometry args={[state === 'soon' ? 0.32 : 0.5, 1]} />
        <meshStandardMaterial
          ref={material}
          color={color}
          emissive={color}
          emissiveIntensity={lit ? 0.7 : 0.05}
          flatShading
          roughness={0.35}
          transparent={state === 'soon'}
          opacity={state === 'soon' ? 0.45 : 1}
        />
      </mesh>
      {lit && (
        <sprite scale={[2.1, 2.1, 1]}>
          <spriteMaterial
            map={map}
            color={color}
            transparent
            opacity={highlighted ? 0.95 : 0.6}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      )}
      {state === 'mastered' && (
        <group ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.7, 0.035, 8, 48]} />
            <meshBasicMaterial color={colors.xp} />
          </mesh>
        </group>
      )}
    </group>
  );
}
