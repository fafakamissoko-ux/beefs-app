# Rapport d'audit — Phase L.0 (Chronos asymétriques & Pulse Coulisses)

- **Date :** 2026-07-22
- **Commit ref :** `ec8f0c2`
- **Contrainte :** zéro modification du dépôt — lecture seule
- **Objectif cible :** différencier visuellement les deux chronomètres (Global vs Hot Mic) selon une asymétrie Prestige / Tactique ; ajouter une alerte visuelle Pulse sur les requêtes spectateurs en attente (Coulisses) ; préparer l'injection de la nouvelle sémantique sur le titre « Ring ».

---

## Synthèse — points d'ancrage Phase L

| Zone | Fichier | Lignes | État actuel | Cible Phase L |
|------|---------|--------|-------------|---------------|
| Chronomètre global | `MediatorSidebar.tsx` | L.226–319 | Enveloppe identique à Hot Mic (`rounded-xl border border-white/10 bg-slate-950/50`) | **Prestige** — cadre plus imposant, typographie blanche/or, ombre glow |
| Hot Mic / tour de parole | `MediatorSidebar.tsx` | L.321–391 | Même shell CSS ; inputs en `text-cyan-400` | **Tactique** — cadre compact, accent cyan, contrôles opérationnels |
| Invités en attente | `MediatorSidebar.tsx` | L.596–653 | Cartes statiques, pas de pulse | Wrapper `animate-pulse` Premium Glass sur chaque `<li>` pending |
| Titre Ring | `MediatorSidebar.tsx` | L.512–518 | `Scène — Le Ring` (emerald) | Injection sémantique validée (Phase L) |

### Constante partagée (enveloppe section)

```tsx
const SECTION_SHELL =
  'rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[60px]';
```

**Ligne :** 74–75

### État local & dérivés liés aux chronos

```tsx
const [speakingTurnSec, setSpeakingTurnSec] = useState(60);
const [matchDurationMin, setMatchDurationMin] = useState(30);

// …

const globalChronoDisplay =
  beefTimeFormatted ||
  `${Math.floor(beefRemainingSec / 60)}:${(beefRemainingSec % 60).toString().padStart(2, '0')}`;
```

**Lignes :** 131–132, 152–154

### Usage `animate-pulse` déjà présent dans le même fichier

| Emplacement | Ligne | Contexte |
|-------------|-------|----------|
| Indicateur réseau hors ligne | L.197 | `animate-pulse bg-rose-500` sur le dot Live sync |
| Chrono global en pause | L.284 | `beefTimerPaused ? 'animate-pulse text-amber-400'` sur l'affichage numérique |

**Référence charte Premium Glass (pulse ping) :** `components/shared/PremiumNotificationBadge.tsx` — halo `animate-ping opacity-40` + `backdrop-blur-md` + bordure colorée glow.

---

# 1. Extraction — Télémétrie — Chronos

**Fichier :** `components/MediatorSidebar.tsx`  
**Lignes :** 220–392 (section complète `<section>` incluant les deux sous-blocs chrono)

```tsx
                    {/* BLOC 1 — TÉLÉMÉTRIE (CHRONOMÈTRES & PAROLE) */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Télémétrie — Chronos
                      </h3>

                      <div className="mb-6 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-blue-200/55">
                          <Timer className="h-4 w-4 text-sky-400" strokeWidth={1.5} />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                            Chronomètre global — beef
                          </span>
                        </div>
                        {!timerActive ? (
                          <>
                            <p className="mb-3 text-center text-[11px] text-blue-200/50">
                              Définissez la durée puis lancez le direct.
                            </p>
                            <div className="mb-4 flex justify-center gap-3">
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="4"
                                  value={Math.floor(matchDurationMin / 60)}
                                  onChange={(e) => {
                                    const h = Math.max(0, Math.min(4, Number(e.target.value) || 0));
                                    const m = matchDurationMin % 60;
                                    setMatchDurationMin(h * 60 + m);
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Heures</span>
                              </div>
                              <span className="self-start pt-2 text-xl font-black text-white/30">:</span>
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={matchDurationMin % 60}
                                  onChange={(e) => {
                                    const h = Math.floor(matchDurationMin / 60);
                                    const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                    setMatchDurationMin(Math.max(1, h * 60 + m));
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Minutes</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={startingBeef}
                              onClick={() => void onStartBeef(matchDurationMin * 60)}
                              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-xs font-black uppercase tracking-widest text-black shadow-[0_8px_32px_rgba(255,255,255,0.12),inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-md transition hover:bg-gray-200 active:scale-[0.99] disabled:opacity-45"
                            >
                              <Play className="h-4 w-4 fill-current" />
                              {startingBeef ? 'Ouverture…' : 'Démarrer le chrono LIVE'}
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className={`font-mono text-center text-[2.85rem] font-black tabular-nums leading-none tracking-tighter ${beefTimerPaused ? 'animate-pulse text-amber-400' : 'text-white'}`}
                            >
                              {globalChronoDisplay}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              {beefTimerPaused ? (
                                <button
                                  type="button"
                                  onClick={onResumeBeefTimer}
                                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 font-mono text-[10px] font-bold uppercase text-white hover:bg-white/15"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Reprendre
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPauseBeefTimer}
                                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/15 font-mono text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-600/25"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                  Pause
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={onResetBeefTimer}
                                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[10px] font-bold uppercase text-white/85 hover:bg-white/[0.1]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/50">
                          Durée allouée au tour / Hot mic
                        </p>
                        <div className="mx-auto mb-5 flex justify-center gap-3">
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={Math.floor(speakingTurnSec / 60)}
                              onChange={(e) => {
                                const m = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                                const s = speakingTurnSec % 60;
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Minutes</span>
                          </div>
                          <span className="self-start pt-2 text-xl font-black text-blue-200/30">:</span>
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="59"
                              step="15"
                              value={speakingTurnSec % 60}
                              onChange={(e) => {
                                const m = Math.floor(speakingTurnSec / 60);
                                const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Secondes</span>
                          </div>
                        </div>

                        {speakingTurnActive && (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={onStopSpeakingTurn}
                              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border-2 border-rose-500/60 bg-rose-600 font-mono text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition hover:bg-rose-500 active:scale-[0.99]"
                            >
                              Couper le tour de parole immédiatement
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] font-mono text-[10px] font-bold uppercase tracking-wide text-white/90 hover:bg-white/[0.12]"
                              >
                                {speakingTurnPaused ? 'Reprendre timer' : 'Pause timer'}
                              </button>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="flex min-h-[44px] items-center justify-center rounded-xl border border-sky-500/35 bg-sky-600/15 font-mono text-[10px] font-bold uppercase tracking-wide text-sky-200 hover:bg-sky-600/25"
                              >
                                Redémarrer le tour
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
```

## Analyse CSS — asymétrie actuelle vs cible

| Attribut | Chrono global (L.226–319) | Hot Mic (L.321–391) | Écart actuel |
|----------|---------------------------|---------------------|--------------|
| Enveloppe | `rounded-xl border border-white/10 bg-slate-950/50 p-4` | **Identique** | Aucune différenciation structurelle |
| Icône / label | `Timer` sky-400 + label inline flex | Label centré seul | Légère hiérarchie sur global |
| Couleur chiffres (idle) | `text-white` (inputs) | `text-cyan-400` (inputs) | Seul écart chromatique |
| Affichage LIVE | `text-[2.85rem]` blanc / amber pulse | Pas d'affichage temps réel dédié | Global = spectacle ; Hot Mic = preset only |
| CTA principal | Bouton blanc plein « Démarrer le chrono LIVE » | Bouton rose « Couper le tour… » (si actif) | Tonalités opposées mais shells identiques |
| Pulse existant | `animate-pulse` uniquement si `beefTimerPaused` | Aucun | Phase L peut étendre le vocabulaire pulse |

**Piste Architecte — Prestige vs Tactique :**

- **Global (Prestige) :** border `prestige-gold/20`, fond `bg-prestige-gold/5`, shadow glow doré, typo display plus grande, `mb-6` conservé pour l'emphase.
- **Hot Mic (Tactique) :** border `cyan-500/25`, fond plus sombre/compressé, padding réduit, badge « opérationnel », pas de glow doré.

---

# 2. Extraction — Coulisses — Invités en attente

**Fichier :** `components/MediatorSidebar.tsx`  
**Lignes :** 596–653 (section `<section>` complète + boucle `pendingInvites.map`)

```tsx
                    {/* BLOC 4 — LES COULISSES (FILE D'ATTENTE) */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/60">
                          Coulisses — Invités en attente
                        </span>
                        <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 font-mono text-[9px] text-blue-200/65">
                          {pendingInvites.length}
                        </span>
                      </div>
                      {onInviteParticipant && (
                        <MediatorInviteInline
                          excludeParticipantIds={inviteExcludeParticipantIds}
                          currentUserId={inviteCurrentUserId}
                          onInvite={onInviteParticipant}
                        />
                      )}
                      <ul className="mt-4 space-y-2">
                        {pendingInvites.length === 0 ? (
                          <li className="rounded-xl border border-dashed border-white/10 py-6 text-center font-mono text-[10px] text-blue-200/45">
                            Aucune invitation en attente
                          </li>
                        ) : (
                          pendingInvites.map((inv) => (
                            <li
                              key={inv.userId}
                              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3"
                            >
                              <span className="min-w-0 break-words text-sm font-medium text-white/90">
                                {inv.label}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRejectPendingInvite?.(inv.userId);
                                    onClose();
                                  }}
                                  className="flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center rounded-xl border border-rose-500/45 bg-rose-600/85 font-mono text-[10px] font-black uppercase tracking-wide text-white hover:bg-rose-500"
                                >
                                  Refuser
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAcceptPendingInvite?.(inv.userId);
                                    onClose();
                                  }}
                                  className="flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center rounded-xl bg-white font-mono text-[10px] font-black uppercase tracking-wide text-black hover:bg-gray-200"
                                >
                                  Accepter
                                </button>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </section>
```

## Point d'injection Pulse — cartes pending

**Cible recommandée :** le `<li>` L.620–622 (wrapper carte individuelle).

```tsx
<li
  key={inv.userId}
  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3"
>
```

**État actuel :** aucune classe `animate-pulse`, `animate-ping`, ni halo Premium Glass.

**Référence charte (PremiumNotificationBadge) :**

```tsx
<div className={`… rounded-full border backdrop-blur-md … ${colors[variant]}`}>
  <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${halos[variant]}`} aria-hidden />
  …
</div>
```

**Options Phase L :**

1. **Minimal :** ajouter `animate-pulse` + bordure amber/cyan sur le `<li>` quand `pendingInvites.length > 0`.
2. **Premium Glass :** wrapper `relative` autour du `<li>` avec couche `absolute inset-0 rounded-xl animate-ping opacity-20 bg-amber-500` (pattern badge).
3. **Section-level :** pulse sur le compteur badge L.602–604 plutôt que sur chaque carte (moins intrusif).

**Props/data disponibles :** `pendingInvites: Array<{ userId: string; label: string }>` — pas de timestamp ni priorité ; pulse sera binaire (≥1 invite = alerte).

**Callbacks :** `onAcceptPendingInvite`, `onRejectPendingInvite` — les deux ferment le deck via `onClose()` après action.

---

# 3. Extraction — Titre « Scène — Le Ring »

**Fichier :** `components/MediatorSidebar.tsx`  
**Lignes :** 510–518 (en-tête section Ring, Phase K)

```tsx
                    {/* BLOC 3 — GESTION DE LA SCÈNE (LE RING) */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400/80">
                          Scène — Le Ring
                        </h3>
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 font-mono text-[9px] text-blue-200/50">
                          {remoteRows.length} lien(s)
                        </span>
                      </div>
```

## Notes sémantiques pour injection Phase L

| Élément | Valeur actuelle | Remarque |
|---------|-----------------|----------|
| Tag JSX | `<h3>` | Cohérent avec autres sections sauf Coulisses (`<span>`) |
| Texte | `Scène — Le Ring` | Sémantique Phase K.2 |
| Couleur | `text-emerald-400/80` | Différencie visuellement du bleu Télémétrie et du rose Clôture |
| Compteur adjacent | `{remoteRows.length} lien(s)` | Badge passif, pas de pulse |

**Zone d'édition minimale :** contenu textuel L.514 uniquement (ou L.513–515 si changement de couleur associé à la nouvelle sémantique).

---

## Annexe — Props interface (Coulisses & Chronos)

```tsx
  timerActive: boolean;
  beefTimerPaused: boolean;
  onPauseBeefTimer: () => void;
  onResumeBeefTimer: () => void;
  onResetBeefTimer: () => void;
  startingBeef: boolean;
  onStartBeef: (durationSec: number) => void | Promise<void>;
  speakingTurnActive: boolean;
  speakingTurnPaused: boolean;
  hotMicSpeakerSlot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  onHotMic: (slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', durationSec: number, opts?: { force?: boolean }) => void;
  onStopSpeakingTurn: () => void;
  onPauseSpeakingTurn: () => void;
  onResumeSpeakingTurn: () => void;
  onRestartSpeakingTurn: () => void;
  beefTimeFormatted: string;
  beefRemainingSec: number;
  maxBeefDurationSec: number;
  parolePresetSec: number;
  onParolePresetSecChange: (sec: number) => void;
  pendingInvites: Array<{ userId: string; label: string }>;
  onAcceptPendingInvite?: (userId: string) => void;
  onRejectPendingInvite?: (userId: string) => void;
```

**Lignes :** 30–67

---

## Checklist implémentation Phase L (post-validation Architecte)

- [ ] Introduire constantes CSS `CHRONO_GLOBAL_SHELL` / `CHRONO_HOTMIC_SHELL` (ou classes Tailwind dédiées)
- [ ] Différencier enveloppes Prestige (global) vs Tactique (hot mic) sans casser l'alignement `SECTION_SHELL` parent
- [ ] Wrapper Pulse sur `<li>` pending (ou composant extrait) — respect `prefers-reduced-motion` (cf. `globals.css` L.300–305)
- [ ] Mettre à jour le libellé h3 Ring selon sémantique validée
- [ ] `npx tsc --noEmit` + test visuel Command Deck ouvert avec invites pending

---

*Fin du rapport — Phase L.0 — extraction seule, aucune modification appliquée au dépôt.*
