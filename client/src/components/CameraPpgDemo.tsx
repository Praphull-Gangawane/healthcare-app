import { useEffect, useRef, useState } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

const DURATION_MS = 20_000;

/** Estimates beats per minute from a red-channel brightness series using simple peak detection. */
export function estimateBpm(samples: { t: number; v: number }[]): number | null {
  if (samples.length < 60) return null;
  const win = 5;
  const smooth = samples.map((s, i) => {
    const part = samples.slice(Math.max(0, i - win), i + win + 1);
    return { t: s.t, v: part.reduce((a, b) => a + b.v, 0) / part.length };
  });
  const mean = smooth.reduce((a, b) => a + b.v, 0) / smooth.length;
  const peaks: number[] = [];
  for (let i = 1; i < smooth.length - 1; i += 1) {
    const cur = smooth[i];
    const prev = smooth[i - 1];
    const next = smooth[i + 1];
    if (!cur || !prev || !next) continue;
    if (cur.v > mean && cur.v > prev.v && cur.v >= next.v && (!peaks.length || cur.t - (peaks[peaks.length - 1] ?? 0) > 300)) peaks.push(cur.t);
  }
  if (peaks.length < 4) return null;
  const intervals = peaks.slice(1).map((p, i) => p - (peaks[i] ?? p));
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60_000 / avg);
  return bpm >= 40 && bpm <= 200 ? bpm : null;
}

/**
 * Camera photoplethysmography proof-of-concept. DEMO / WELLNESS ESTIMATE ONLY — not a validated
 * measurement and never treated as clinical data by the server.
 */
export function CameraPpgDemo({ onResult }: { onResult: (bpm: number) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'measuring' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  async function start() {
    setMessage(null);
    setBpm(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      return setMessage('This browser cannot access a camera.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        await track?.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      } catch {
        /* torch not supported */
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      video.srcObject = stream;
      await video.play();
      setState('measuring');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const samples: { t: number; v: number }[] = [];
      const t0 = performance.now();
      const tick = () => {
        const now = performance.now();
        if (ctx && video.videoWidth) {
          ctx.drawImage(video, 0, 0, 40, 30);
          const px = ctx.getImageData(0, 0, 40, 30).data;
          let red = 0;
          for (let i = 0; i < px.length; i += 4) red += px[i] ?? 0;
          samples.push({ t: now - t0, v: red / (px.length / 4) });
        }
        setProgress(Math.min(100, Math.round(((now - t0) / DURATION_MS) * 100)));
        if (now - t0 < DURATION_MS && streamRef.current) requestAnimationFrame(tick);
        else {
          stop();
          const est = estimateBpm(samples);
          if (est === null) {
            setState('error');
            setMessage('We could not get a steady reading. Cover the camera (and flash) fully with a fingertip and keep still.');
          } else {
            setBpm(est);
            setState('done');
          }
        }
      };
      requestAnimationFrame(tick);
    } catch {
      stop();
      setState('error');
      setMessage('Camera permission was denied or no camera is available. You can allow camera access in your browser settings.');
    }
  }

  return (
    <section className="card stack-sm" aria-labelledby="ppg-h">
      <h2 id="ppg-h">Camera heart-rate estimate</h2>
      <Alert tone="warning" title="DEMO / WELLNESS ESTIMATE" live={false}>
        This experimental feature is not a medical measurement and must not be used to make health decisions. Results are stored as a wellness estimate and are never added to your clinical record.
      </Alert>
      <p className="small">Place a fingertip gently over the rear camera (and flash, if present), then keep still for 20 seconds.</p>
      <video ref={videoRef} className="camera-preview" muted playsInline aria-hidden="true" />
      <canvas ref={canvasRef} width={40} height={30} hidden />
      {state === 'measuring' ? (
        <p role="status">
          Measuring… {progress}%
        </p>
      ) : null}
      {message ? <Alert tone="error">{message}</Alert> : null}
      {state === 'done' && bpm ? (
        <div className="stack-sm">
          <p className="reading-value">
            ≈ {bpm} bpm <span className="small muted">(wellness estimate)</span>
          </p>
          <div className="button-row">
            <Button variant="secondary" onClick={() => void onResult(bpm)}>
              Save as wellness estimate
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button variant="ghost" icon="camera" disabled={state === 'measuring'} onClick={() => void start()}>
          {state === 'idle' ? 'Start camera estimate' : 'Measure again'}
        </Button>
      </div>
    </section>
  );
}
