'use client';

import { useState } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { MutinyProtocol } from './MutinyProtocol';

interface PreJoinScreenProps {
  userName: string;
  beefId?: string | null;
  onJoin: (camEnabled: boolean, micEnabled: boolean) => void;
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
  beefId,
  onJoin,
  viewerMode = false,
  mediatorName,
  currentUserSlot,
  otherPartyInitiatedMutiny,
  onMutinyInitiate,
  onMutinyConfirm,
  onMutinyRefuse,
}: PreJoinScreenProps) {
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const handleJoin = () => {
    onJoin(camEnabled, micEnabled);
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
      <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-y-auto overflow-x-hidden bg-obsidian p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {ambientLayer}
        <div className="relative z-10 w-full max-w-md max-h-[90dvh] overflow-y-auto">
          <div className="relative rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-3xl sm:p-6">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/feed';
              }}
              className="absolute left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/10"
            >
              <span aria-hidden>←</span>
            </button>
            <div className="space-y-5 pt-10 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-emerald-500/20 ring-1 ring-white/10 sm:h-24 sm:w-24">
                <span className="text-4xl font-black text-white sm:text-5xl">{userName?.[0]?.toUpperCase() || '?'}</span>
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">Rejoindre en tant que spectateur</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-white/50">Tu pourras regarder le beef, commenter, voter et envoyer des reactions</p>
              </div>
              <button
                type="button"
                onClick={() => onJoin(false, false)}
                className="w-full touch-manipulation rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 py-3 text-sm font-black text-white shadow-[0_0_42px_-6px_rgba(147,51,234,0.45),0_18px_48px_-8px_rgba(5,150,105,0.35)] transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97] sm:py-3.5 sm:text-base"
              >
                👁️ Regarder le Beef
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-y-auto overflow-x-hidden bg-obsidian p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pl-4">
      {ambientLayer}
      <div className="relative z-10 w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
        <div className="relative space-y-3 rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-3 shadow-2xl backdrop-blur-3xl sm:space-y-4 sm:p-5 md:p-6">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/feed';
            }}
            className="absolute top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/10"
          >
            <span aria-hidden>←</span>
          </button>

          <div className="px-0.5 pt-8 text-center sm:pt-6">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">Prêt à rejoindre ?</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-white/50">Choisis tes réglages avant d&apos;entrer dans le beef</p>
          </div>

          <div className="relative flex max-h-[min(42vh,22rem)] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-obsidian-900/80 aspect-video sm:max-h-none sm:rounded-3xl">
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gray-700/90 sm:h-24 sm:w-24">
              <span className="text-3xl font-bold text-white sm:text-4xl">
                {userName ? userName[0].toUpperCase() : '?'}
              </span>
            </div>
            <p className="text-sm font-semibold text-white/70">
              {camEnabled ? "La caméra s'activera au moment de rejoindre" : 'Caméra désactivée'}
            </p>
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-sm sm:bottom-3 sm:left-3 sm:px-2.5 sm:py-1">
              <span className="text-xs font-semibold text-white sm:text-sm">{userName} (Vous)</span>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-row items-stretch justify-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-2 backdrop-blur-xl sm:rounded-[2rem] sm:p-3">
              <p className="mb-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 sm:mb-2 sm:text-[9px]">
                Caméra
              </p>
              <button
                type="button"
                onClick={() => setCamEnabled(!camEnabled)}
                className={`flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm ${
                  camEnabled
                    ? 'bg-white/[0.06] text-white ring-1 ring-violet-500/25 hover:bg-white/[0.1]'
                    : 'border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                }`}
              >
                {camEnabled ? <Video className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /> : <VideoOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />}
                {camEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-2 backdrop-blur-xl sm:rounded-[2rem] sm:p-3">
              <p className="mb-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 sm:mb-2 sm:text-[9px]">
                Micro
              </p>
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className={`flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm ${
                  micEnabled
                    ? 'bg-white/[0.06] text-white ring-1 ring-emerald-500/25 hover:bg-white/[0.1]'
                    : 'border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                }`}
              >
                {micEnabled ? <Mic className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /> : <MicOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />}
                {micEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {mediatorName && currentUserSlot && onMutinyInitiate && onMutinyConfirm && onMutinyRefuse && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
              <div className="min-w-0 flex-1">
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

          {beefId && (
            <p className="text-center font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-500/40">
              Caméra uniquement après « Entrer » — aucun pré-verrouillage
            </p>
          )}

          <button
            type="button"
            onClick={handleJoin}
            className="w-full touch-manipulation rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 py-3 text-sm font-black tracking-wide text-white shadow-[0_0_40px_-8px_rgba(124,58,237,0.45),0_18px_44px_-10px_rgba(5,150,105,0.35)] transition-[transform,filter,box-shadow] duration-200 hover:brightness-110 hover:shadow-[0_0_50px_-6px_rgba(124,58,237,0.5),0_22px_52px_-10px_rgba(5,150,105,0.4)] active:scale-[0.96] sm:py-3.5 sm:text-base md:py-4"
          >
            Entrer dans l&apos;Arène
          </button>
        </div>
      </div>
    </div>
  );
}
