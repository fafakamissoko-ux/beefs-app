'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, ChevronDown } from 'lucide-react';
import { MutinyProtocol } from './MutinyProtocol';

interface PreJoinScreenProps {
  userName: string;
  /** Flux déjà autorisé par l’utilisateur — transmis à Daily pour éviter un 2ᵉ getUserMedia sans geste (iOS / Brave). */
  onJoin: (preAcquiredMedia: MediaStream | null) => void;
  viewerMode?: boolean;
  mediatorName?: string;
  currentUserSlot?: 'A' | 'B';
  otherPartyInitiatedMutiny?: boolean;
  onMutinyInitiate?: () => void;
  onMutinyConfirm?: () => void;
  onMutinyRefuse?: () => void;
}

export function PreJoinScreen({
  userName,
  onJoin,
  viewerMode = false,
  mediatorName,
  currentUserSlot,
  otherPartyInitiatedMutiny,
  onMutinyInitiate,
  onMutinyConfirm,
  onMutinyRefuse,
}: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** True si le MediaStream a été passé à Daily — ne pas stopper les pistes au démontage. */
  const mediaHandedOffRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const startPreview = useCallback(async (camId?: string, micId?: string) => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCamError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: camEnabled ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: micId ? { deviceId: { exact: micId } } : true,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      streamRef.current = s;

      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }

      // Audio level meter
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(100, avg * 2));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Enumerate devices after getting permission
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        cameras: allDevices.filter(d => d.kind === 'videoinput'),
        mics: allDevices.filter(d => d.kind === 'audioinput'),
      });
    } catch (err: any) {
      setCamError('Caméra/micro non disponible. Vérifie les permissions du navigateur.');
      console.error('Camera error:', err);
    }
  }, [camEnabled]);

  const startPreviewRef = useRef(startPreview);
  startPreviewRef.current = startPreview;

  useEffect(() => {
    if (!viewerMode) {
      void startPreviewRef.current();
    }
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (!mediaHandedOffRef.current) {
        streamRef.current?.getTracks().forEach(t => t.stop());
      }
    };
  }, [viewerMode]);

  const toggleCam = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !camEnabled;
        setCamEnabled(!camEnabled);
      }
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  const handleJoin = () => {
    mediaHandedOffRef.current = true;
    const acquired = streamRef.current ?? stream;
    cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current) videoRef.current.srcObject = null;
    /** Ne pas arrêter les pistes ici : Daily réutilise le même MediaStream (évite getUserMedia après await token). */
    onJoin(acquired);
  };

  const ambientLayer = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-[20%] -top-[25%] h-[min(70vh,32rem)] w-[min(85vw,36rem)] rounded-full bg-violet-600/[0.22] blur-[100px] sm:blur-[120px]" />
      <div className="absolute -right-[18%] -bottom-[20%] h-[min(65vh,30rem)] w-[min(80vw,34rem)] rounded-full bg-emerald-500/[0.16] blur-[95px] sm:blur-[115px]" />
      <div className="absolute right-0 top-1/3 h-40 w-40 -translate-y-1/2 translate-x-1/4 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/4 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
    </div>
  );

  if (viewerMode) {
    return (
      <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-hidden bg-obsidian p-4">
        {ambientLayer}
        <div className="relative z-10 w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-emerald-500/20 ring-1 ring-white/10">
            <span className="text-5xl font-black text-white">{userName?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Rejoindre en tant que spectateur</h2>
            <p className="mt-2 text-sm text-white/50">Tu pourras regarder le beef, commenter, voter et envoyer des reactions</p>
          </div>
          <button
            type="button"
            onClick={() => onJoin(null)}
            className="w-full touch-manipulation rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 py-4 text-lg font-black text-white shadow-[0_0_42px_-6px_rgba(147,51,234,0.45),0_18px_48px_-8px_rgba(5,150,105,0.35)] transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
          >
            👁️ Regarder le Beef
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-hidden bg-obsidian p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {ambientLayer}
      <div className="relative z-10 w-full max-w-2xl space-y-4">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-tight text-white">Prêt à rejoindre ?</h2>
          <p className="mt-1 text-sm text-white/50">Teste ta caméra et ton micro avant d'entrer dans le beef</p>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-white/[0.06] bg-obsidian-900/80 shadow-2xl shadow-black/40">
          {camEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-3xl font-bold text-white">
                    {userName ? userName[0].toUpperCase() : '?'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">Caméra désactivée</p>
              </div>
            </div>
          )}

          {/* Name badge — ne pas intercepter les taps (contrôles sous-jacents si besoin) */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1 backdrop-blur-sm">
            <span className="text-white text-sm font-semibold">{userName} (Vous)</span>
          </div>

          {/* Error */}
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center p-4">
                <VideoOff className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <p className="text-red-300 text-sm">{camError}</p>
                <button
                  type="button"
                  onClick={() => startPreview()}
                  className="mt-3 touch-manipulation text-sm text-orange-400 underline"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls — cartes glass */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur-xl">
            <p className="mb-2.5 text-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
              Caméra
            </p>
            <button
              type="button"
              onClick={toggleCam}
              className={`flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                camEnabled
                  ? 'bg-white/[0.06] text-white ring-1 ring-violet-500/25 hover:bg-white/[0.1]'
                  : 'border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
              }`}
            >
              {camEnabled ? <Video className="h-4 w-4 shrink-0" /> : <VideoOff className="h-4 w-4 shrink-0" />}
              {camEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur-xl">
            <p className="mb-2.5 text-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
              Micro
            </p>
            <button
              type="button"
              onClick={toggleMic}
              className={`mb-3 flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                micEnabled
                  ? 'bg-white/[0.06] text-white ring-1 ring-emerald-500/25 hover:bg-white/[0.1]'
                  : 'border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
              }`}
            >
              {micEnabled ? <Mic className="h-4 w-4 shrink-0" /> : <MicOff className="h-4 w-4 shrink-0" />}
              {micEnabled ? 'ON' : 'OFF'}
            </button>
            {micEnabled && (
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Device selectors */}
        {(devices.cameras.length > 1 || devices.mics.length > 1) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            {devices.cameras.length > 1 && (
              <div className="relative flex-1 rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-1 backdrop-blur-xl">
                <select
                  value={selectedCam}
                  onChange={e => { setSelectedCam(e.target.value); startPreview(e.target.value, selectedMic); }}
                  className="w-full cursor-pointer appearance-none rounded-[1.75rem] bg-white/[0.04] px-4 py-3 pr-10 text-sm text-white ring-0 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                >
                  {devices.cameras.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Caméra'}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              </div>
            )}
            {devices.mics.length > 1 && (
              <div className="relative flex-1 rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-1 backdrop-blur-xl">
                <select
                  value={selectedMic}
                  onChange={e => { setSelectedMic(e.target.value); startPreview(selectedCam, e.target.value); }}
                  className="w-full cursor-pointer appearance-none rounded-[1.75rem] bg-white/[0.04] px-4 py-3 pr-10 text-sm text-white ring-0 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {devices.mics.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micro'}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              </div>
            )}
          </div>
        )}

        {/* Mutiny Protocol — challengers only, pre-live */}
        {mediatorName && currentUserSlot && onMutinyInitiate && onMutinyConfirm && onMutinyRefuse && (
          <div className="flex items-center justify-between gap-3 rounded-[2rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
            <div className="flex-1 min-w-0">
              <p className="font-sans text-xs text-white/40">
                Médiateur : <span className="font-bold text-white/60">{mediatorName}</span>
              </p>
            </div>
            <MutinyProtocol
              mediatorName={mediatorName}
              currentUserSlot={currentUserSlot}
              otherPartyInitiated={otherPartyInitiatedMutiny}
              onInitiate={onMutinyInitiate}
              onConfirm={onMutinyConfirm}
              onRefuse={onMutinyRefuse}
            />
          </div>
        )}

        {/* Join */}
        <button
          type="button"
          onClick={handleJoin}
          className="w-full touch-manipulation rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 py-5 text-base font-black tracking-wide text-white shadow-[0_0_48px_-8px_rgba(124,58,237,0.5),0_24px_56px_-12px_rgba(5,150,105,0.4)] transition-[transform,filter,box-shadow] duration-200 hover:brightness-110 hover:shadow-[0_0_56px_-6px_rgba(124,58,237,0.55),0_28px_64px_-10px_rgba(5,150,105,0.45)] active:scale-[0.96] sm:py-6 sm:text-lg"
        >
          Entrer dans l&apos;Arène
        </button>
      </div>
    </div>
  );
}
