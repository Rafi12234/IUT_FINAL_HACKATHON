import { Canvas } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import type { KeyConfig } from '../config/keyConfig';
import { useRobotStore } from '../state/robotStore';
import { coordToTuple, type Vec3Tuple } from './coordinates';
import { RobotModel } from './RobotModel';
import { KeyPanel } from './KeyPanel';
import { CameraRig } from './CameraRig';
import { PinPathOverlay, TcpMarker, TargetMarker } from './Markers';
import { FingerJointHandles } from '../finger/FingerJointHandles';

interface SceneRootProps {
  keyConfig: KeyConfig | null;
}

/**
 * Root R3F scene. The base frame is Z-up (matching the URDF and key config), so
 * the camera up vector is +Z and world coordinates equal base_link coordinates.
 *
 * Visual layer only — lighting, environment, grid, and framing. No robot,
 * runtime, FK/IK, or safety behaviour is affected here.
 */
export function SceneRoot({ keyConfig }: SceneRootProps) {
  const tcp = useRobotStore((s) => s.tcp);
  const targetKey = useRobotStore((s) => s.targetKey);

  let targetPosition: Vec3Tuple | null = null;
  if (keyConfig && targetKey && keyConfig.keys[targetKey]) {
    targetPosition = coordToTuple(keyConfig.keys[targetKey]);
  }

  return (
    <Canvas
      shadows={{ enabled: true, type: PCFShadowMap }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [1.15, -1.15, 1.0], up: [0, 0, 1], fov: 48, near: 0.01, far: 100 }}
    >
      <color attach="background" args={['#0b0e14']} />
      <fog attach="fog" args={['#0b0e14', 4.5, 11]} />

      {/* Multi-light rig: soft ambient sky/ground + key + fill + cool rim. */}
      <hemisphereLight args={['#aeb9cc', '#0a0d13', 0.55]} />
      <directionalLight
        position={[2.4, -2.2, 4]}
        intensity={2.1}
        color="#eef3ff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-camera-near={0.1}
        shadow-camera-far={12}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-3, 1.5, 2]} intensity={0.5} color="#8fb4ff" />
      <directionalLight position={[0, 3.5, 1.2]} intensity={0.4} color="#22d3ee" />

      {/* Ground plane (XY, normal +Z) receiving shadows */}
      <mesh position={[0, 0, -0.001]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#12161f" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Soft contact shadow under the arm for grounded realism */}
      <ContactShadows
        position={[0.35, 0, 0.001]}
        scale={2.6}
        resolution={512}
        blur={2.6}
        opacity={0.5}
        far={1.2}
        color="#000000"
      />

      {/* Radial grid in the XY plane (drei Grid is XZ by default; rotate onto XY) */}
      <Grid
        args={[12, 12]}
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={0.1}
        cellThickness={0.6}
        sectionSize={0.5}
        cellColor="#1c2430"
        sectionColor="#2b3a4f"
        infiniteGrid
        fadeDistance={7}
        fadeStrength={2}
        followCamera={false}
      />

      {/* Base-frame axes: X red, Y green, Z blue */}
      <axesHelper args={[0.25]} />

      <RobotModel />
      {keyConfig ? <KeyPanel config={keyConfig} /> : null}
      {tcp ? <TcpMarker position={tcp} /> : null}
      {targetPosition ? <TargetMarker position={targetPosition} /> : null}
      <PinPathOverlay />
      <FingerJointHandles />

      <CameraRig />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0.5, 0, 0.2]} />
    </Canvas>
  );
}
