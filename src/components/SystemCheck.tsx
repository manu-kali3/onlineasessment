"use client";

import { useEffect, useState } from "react";

export type HardwareResult = {
  camera: boolean;
  microphone: boolean;
  downloadMbps: number;
  passed: boolean;
};

/**
 * Pre-flight gate. Camera and mic are requested through getUserMedia, and a
 * small timed fetch measures effective download speed against a hard threshold.
 */
export default function SystemCheck({
  onPass,
  disabled = false,
  extensionPct = 0,
}: {
  onPass: (result: HardwareResult) => void;
  disabled?: boolean;
  extensionPct?: number;
}) {
  const [camera, setCamera] = useState<boolean | null>(null);
  const [mic, setMic] = useState<boolean | null>(null);
  const [mbps, setMbps] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setComplete(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose camera/microphone access.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setCamera(stream.getVideoTracks().length > 0);
      setMic(stream.getAudioTracks().length > 0);
      stream.getTracks().forEach((t) => t.stop());

      // ~256KB payload; abort if the connection is too slow to even return it
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch("/api/system-check/payload", {
        signal: controller.signal,
        cache: "no-store",
      });
      const bytes = Number(res.headers.get("x-payload-bytes") ?? 262144);
      await res.arrayBuffer();
      clearTimeout(timer);
      const seconds = Math.max(0.001, (performance.now() - started) / 1000);
      setMbps(Math.round(((bytes * 8) / seconds / 1_000_000) * 10) / 10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hardware check failed");
    } finally {
      setRunning(false);
      setComplete(true);
    }
  }

  const passed = Boolean(camera && mic && (mbps ?? 0) >= 5);

  useEffect(() => {
    if (complete && passed && !disabled) {
      onPass({ camera: !!camera, microphone: !!mic, downloadMbps: mbps ?? 0, passed });
    }
  }, [complete, passed, camera, mic, mbps, disabled, onPass]);

  const verdict = (ok: boolean | null, label: string) =>
    ok === null ? (
      <span className="tag">— {label}</span>
    ) : ok ? (
      <span className="tag tag-good">✓ {label}</span>
    ) : (
      <span className="tag tag-bad">✕ {label}</span>
    );

  return (
    <div className="panel p-5">
      <h2 className="text-base font-semibold">System check</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Confirms your camera, microphone, and connection before the timer starts.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {verdict(camera, "Camera")}
        {verdict(mic, "Microphone")}
        {mbps === null ? (
          <span className="tag">— Connection</span>
        ) : mbps >= 5 ? (
          <span className="tag tag-good">✓ {mbps} Mbps</span>
        ) : (
          <span className="tag tag-bad">✕ {mbps} Mbps (need 5+)</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm tag tag-bad inline-block">
          {error}
        </p>
      )}

      {complete && !passed && !error && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Your setup does not meet the requirements yet. Fix the items marked
          above and run the check again.
        </p>
      )}

      <button className="btn btn-primary mt-4" onClick={run} disabled={running}>
        {running ? "Checking…" : complete ? "Run again" : "Run system check"}
      </button>

      {extensionPct > 0 && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          An approved time extension of {extensionPct}% will be applied when the
          assessment starts.
        </p>
      )}
    </div>
  );
}