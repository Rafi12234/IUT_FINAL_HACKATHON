import { useEffect, useState } from 'react';
import { loadKeyConfig, type KeyConfig } from './config/keyConfig';
import { useRobotStore } from './state/robotStore';
import { useUiStore } from './state/uiStore';
import { SceneRoot } from './scene/SceneRoot';
import { TelemetryPanel } from './ui/TelemetryPanel';
import { FkDiagnosticsPanel } from './ui/FkDiagnosticsPanel';
import { RuntimePanel } from './ui/RuntimePanel';
import { JointControlPanel } from './manual/JointControlPanel';
import { ManualControlPanel } from './manual/ManualControlPanel';
import { IkPreflightPanel } from './ui/IkPreflightPanel';
import { StatusOverlay } from './ui/StatusOverlay';
import { PinPanel } from './ui/PinPanel';
import { HardwarePanel } from './ui/HardwarePanel';
import { VoiceControlPanel } from './ui/VoiceControlPanel';
import { TopBar } from './ui/TopBar';
import { CameraControls } from './ui/CameraControls';
import { DemoMode } from './ui/DemoMode';
import { FingerCameraControlPanel } from './finger/FingerCameraControlPanel';
import { FingerCursorOverlay } from './finger/FingerCursorOverlay';
import { FingerViewportHud } from './finger/FingerViewportHud';
import { EventTimeline } from './ui/EventTimeline';

const KEY_CONFIG_URL = '/config/key.config.json';

export function App() {
  const status = useRobotStore((s) => s.status);
  const error = useRobotStore((s) => s.error);
  const advanced = useUiStore((s) => s.advancedMode);

  const [keyConfig, setKeyConfig] = useState<KeyConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadKeyConfig(KEY_CONFIG_URL)
      .then((cfg) => {
        if (!cancelled) setKeyConfig(cfg);
      })
      .catch((err: unknown) => {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <TopBar />

      <div className="workspace">
        <aside className="rail rail-left" aria-label="Controls">
          <div className="rail-head">Controls</div>
          <RuntimePanel />
          <ManualControlPanel />
          <FingerCameraControlPanel />
          <VoiceControlPanel />
          <JointControlPanel />
          <PinPanel keyConfig={keyConfig} />
        </aside>

        <main className="stage">
          <div className="viewport">
            <SceneRoot keyConfig={keyConfig} />
            <FingerCursorOverlay />
            <FingerViewportHud />
            <CameraControls />
            <StatusOverlay status={status} error={error} configError={configError} />
            <DemoMode />
          </div>
        </main>

        <aside className="rail rail-right" aria-label="Telemetry">
          <div className="rail-head">Telemetry &amp; Diagnostics</div>
          <TelemetryPanel />
          <HardwarePanel />
          {advanced ? (
            <>
              <FkDiagnosticsPanel />
              <IkPreflightPanel keyConfig={keyConfig} />
            </>
          ) : (
            <p className="rail-hint">
              Enable <strong>Advanced</strong> in the top bar for FK verification and IK preflight
              diagnostics.
            </p>
          )}
        </aside>
      </div>

      <footer className="dock">
        <EventTimeline />
      </footer>
    </div>
  );
}
