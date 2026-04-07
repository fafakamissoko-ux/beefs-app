'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, ChevronDown } from 'lucide-react';

interface PreJoinScreenProps {
  userName: string;
  /** Flux déjà autorisé par l’utilisateur — transmis à Daily pour éviter un 2ᵉ getUserMedia sans geste (iOS / Brave). */
  onJoin: (preAcquiredMedia: MediaStream | null) => void;
  viewerMode?: boolean;
}

export function PreJoinScreen({ userName, onJoin, viewerMode = false }: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Start camera preview
  const startPreview = async (camId?: string, micId?: string) => {
    // Stop existing stream
    stream?.getTracks().forEach(t => t.stop());
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
  };

  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!viewerMode) {
      startPreview();
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

  if (viewerMode) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-950 p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-brand-500/30 to-brand-600/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-5xl font-black text-white">{userName?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Rejoindre en tant que spectateur</h2>
            <p className="text-gray-400 text-sm mt-2">Tu pourras regarder le beef, commenter, voter et envoyer des reactions</p>
          </div>
          <button
            type="button"
            onClick={() => onJoin(null)}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-lg rounded-2xl transition-all shadow-lg shadow-orange-500/30 active:scale-95"
          >
            👁️ Regarder le Beef
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-2xl space-y-4">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-white">Prêt à rejoindre ?</h2>
          <p className="text-gray-400 text-sm mt-1">Teste ta caméra et ton micro avant d'entrer dans le beef</p>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video bg-gray-900 rounded-2xl overflow-hidden">
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

        {/* Join button */}
        <button
          onClick={handleJoin}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-lg rounded-2xl transition-all shadow-lg shadow-orange-500/30 active:scale-95"
        >
          🔥 Rejoindre le Beef
        </button>
      </div>
    </div>
  );
}
