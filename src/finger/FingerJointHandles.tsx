import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useRobotStore } from '../state/robotStore';
import { useRuntimeStore } from '../state/runtimeStore';
import { useFingerStore } from './fingerStore';
import { computeForwardKinematics } from '../kinematics/forwardKinematics';
import type { FingerHandleProjection } from './fingerTypes';

const ACTIVE_JOINTS = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'] as const;
const UPDATE_INTERVAL_MS = 1000 / 25; // 25 Hz

const tmpVec = new Vector3();
const tmpAxis = new Vector3();

/**
 * R3F component rendered inside SceneRoot Canvas.
 * Runs FK, projects joint origins to screen, publishes FingerHandleProjection[]
 * to fingerStore so the control engine can use them for handle selection.
 */
export function FingerJointHandles() {
  const { camera, size } = useThree();
  const chain = useRobotStore(s => s.chain);
  const snapshot = useRuntimeStore(s => s.snapshot);
  const lastUpdate = useRef(0);

  useFrame(({ gl: _gl }) => {
    const now = performance.now();
    if (now - lastUpdate.current < UPDATE_INTERVAL_MS) return;
    lastUpdate.current = now;

    if (!chain || !snapshot) return;

    const jointValues = snapshot.jointValues;

    let fk;
    try {
      fk = computeForwardKinematics(chain, jointValues);
    } catch {
      return;
    }

    const projections: FingerHandleProjection[] = [];

    // Project joint origins
    for (const name of ACTIVE_JOINTS) {
      const origin = fk.jointOrigins[name];
      const axis = fk.jointAxes[name];
      if (!origin || !axis) continue;

      tmpVec.set(origin[0], origin[1], origin[2]);
      const proj = tmpVec.clone().project(camera);

      if (proj.z > 1) continue; // behind camera

      const sx = (proj.x * 0.5 + 0.5) * size.width;
      const sy = (-proj.y * 0.5 + 0.5) * size.height;

      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      // Compute screen-space tangent: cross(axis, toCamera), projected
      const toCamera = camera.position.clone().sub(tmpVec).normalize();
      tmpAxis.set(axis[0], axis[1], axis[2]);
      const tangentWorld = new Vector3().crossVectors(tmpAxis, toCamera).normalize();

      const tangentEnd = tmpVec.clone().add(tangentWorld.multiplyScalar(0.05));
      const tProj = tangentEnd.project(camera);
      const tsx = (tProj.x * 0.5 + 0.5) * size.width;
      const tsy = (-tProj.y * 0.5 + 0.5) * size.height;
      const raw = [tsx - sx, tsy - sy] as [number, number];
      const tlen = Math.hypot(raw[0], raw[1]);
      const screenTangent: [number, number] = tlen > 0 ? [raw[0] / tlen, raw[1] / tlen] : [1, 0];

      projections.push({
        id: `joint:${name}`,
        kind: 'joint',
        jointName: name,
        worldPosition: [origin[0], origin[1], origin[2]],
        screenPosition: [sx, sy],
        screenTangent,
        visible: true,
        distanceFromCamera: camera.position.distanceTo(tmpVec),
      });
    }

    // Project TCP
    const tcpPos = fk.tcp.position;
    tmpVec.set(tcpPos[0], tcpPos[1], tcpPos[2]);
    const tcpProj = tmpVec.clone().project(camera);
    if (tcpProj.z <= 1) {
      const tsx = (tcpProj.x * 0.5 + 0.5) * size.width;
      const tsy = (-tcpProj.y * 0.5 + 0.5) * size.height;
      if (Number.isFinite(tsx) && Number.isFinite(tsy)) {
        projections.push({
          id: 'tcp:stylus_tip',
          kind: 'tcp',
          worldPosition: [tcpPos[0], tcpPos[1], tcpPos[2]],
          screenPosition: [tsx, tsy],
          screenTangent: [1, 0],
          visible: true,
          distanceFromCamera: camera.position.distanceTo(tmpVec),
        });
      }
    }

    useFingerStore.getState().setHandleProjections(projections);
  });

  // Visual handles are rendered as HTML elements via portal — we don't need R3F meshes
  // because the cursor overlay is a DOM element. Just keep the FK projection running.
  return null;
}
