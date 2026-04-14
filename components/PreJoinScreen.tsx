'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, ChevronDown } from 'lucide-react';
import { MutinyProtocol } from './MutinyProtocol';

const ANTI_JOIN_BTN =
  'mt-4 sm:mt-6 px-8 py-3.5 sm:py-4 bg-brand-500 hover:bg-brand-400 text-white font-bold text-base sm:text-lg rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] w-full max-w-md uppercase tracking-wide shrink-0';

interface PreJoinScreenProps {
  userName: string;
  /** Flux déjà autorisé par l’utilisateur — transmis à Daily pour éviter un 2ᵉ getUserMedia sans geste (iOS / Brave). */
  onJoin: (preAcquiredMedia: MediaStream | null) => void | Promise<void>;
  /** Médiateur (caméra/micro) — libellé du bouton final + sync live côté parent. */
  isMediator?: boolean;
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
  isMediator = false,
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

  const handleJoin = async () => {
    const acquired = streamRef.current ?? stream;
    cancelAnimationFrame(animFrameRef.current);
    try {
      /** Ne pas arrêter les pistes ici : Daily réutilise le même MediaStream (évite getUserMedia après await token). */
      await onJoin(acquired);
      mediaHandedOffRef.current = true;
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {
      void startPreviewRef.current();
    }
  };

  if (viewerMode) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center overflow-y-auto overscroll-contain bg-obsidian px-3 py-4 text-white sm:px-4">
        <h1 className="mb-4 shrink-0 text-2xl font-black uppercase tracking-wider sm:mb-6 sm:text-3xl">
          L'Antichambre
        </h1>
        <div className="flex w-full max-w-md flex-1 flex-col justify-center space-y-4 text-center sm:space-y-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-brand-600/20">
              <span className="text-5xl font-black text-white">{userName?.[0]?.toUpperCase() || '?'}</span>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Spectateur</h2>
            <p className="mt-2 text-sm text-white/45">
              Tu pourras regarder le beef, commenter, voter et envoyer des réactions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onJoin(null)}
            className={ANTI_JOIN_BTN}
          >
            ENTRER DANS L'ARÈNE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-stretch overflow-y-auto overscroll-contain bg-obsidian px-3 py-3 text-white sm:px-4 sm:py-4">
      <h1 className="mb-3 shrink-0 text-center text-2xl font-black uppercase tracking-wider sm:mb-4 sm:text-3xl">
        L'Antichambre
      </h1>
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-3 sm:gap-4">
        <div className="shrink-0 text-center">
          <p className="text-xs text-white/45 sm:text-sm">
            Teste ta caméra et ton micro avant d'entrer dans le beef
          </p>
        </div>

        {/* Camera preview — cadre glass (hauteur plafonnée sur desktop pour garder le CTA visible) */}
        <div className="min-h-0 shrink overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-3 shadow-[0_0_40px_rgba(0,0,0,0.8)] sm:p-4">
        <div className="relative mx-auto aspect-video w-full max-h-[min(38dvh,340px)] overflow-hidden rounded-xl bg-gray-900 sm:max-h-[min(42dvh,380px)]">
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

          {/* Name badge */}
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1">
            <span className="text-white text-sm font-semibold">{userName} (Vous)</span>
          </div>

          {/* Error */}
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center p-4">
                <VideoOff className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <p className="text-red-300 text-sm">{camError}</p>
                <button
                  onClick={() => startPreview()}
                  className="mt-3 text-orange-400 underline text-sm"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-3">
          {/* Cam toggle */}
          <button
            onClick={toggleCam}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              camEnabled
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'bg-red-500/20 text-red-400 border border-red-500/50'
            }`}
          >
            {camEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            {camEnabled ? 'Caméra ON' : 'Caméra OFF'}
          </button>

          {/* Mic toggle + level meter */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                micEnabled
                  ? 'bg-gray-800 text-white hover:bg-gray-700'
                  : 'bg-red-500/20 text-red-400 border border-red-500/50'
              }`}
            >
              {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micEnabled ? 'Micro ON' : 'Micro OFF'}
            </button>
            {/* Audio level bar */}
            {micEnabled && (
              <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-orange-500 rounded-full transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Device selectors */}
        {(devices.cameras.length > 1 || devices.mics.length > 1) && (
          <div className="flex gap-3">
            {devices.cameras.length > 1 && (
              <div className="flex-1 relative">
                <select
                  value={selectedCam}
                  onChange={e => { setSelectedCam(e.target.value); startPreview(e.target.value, selectedMic); }}
                  className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 appearance-none"
                >
                  {devices.cameras.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Caméra'}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            {devices.mics.length > 1 && (
              <div className="flex-1 relative">
                <select
                  value={selectedMic}
                  onChange={e => { setSelectedMic(e.target.value); startPreview(selectedCam, e.target.value); }}
                  className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 appearance-none"
                >
                  {devices.mics.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micro'}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Mutiny Protocol — challengers only, pre-live */}
        {mediatorName && currentUserSlot && onMutinyInitiate && onMutinyConfirm && onMutinyRefuse && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
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

        <div className="flex w-full shrink-0 justify-center pb-1 pt-1">
          <button type="button" onClick={() => void handleJoin()} className={ANTI_JOIN_BTN}>
            {isMediator ? '🔴 OUVRIR LA SÉANCE' : "ENTRER DANS L'ARÈNE"}
          </button>
        </div>
      </div>
    </div>
  );
}
