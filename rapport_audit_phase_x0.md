# Rapport d'audit — Phase X.0 (Traque signOut global + broadcast suspects)

**Date d'extraction :** 2026-07-16  
**Commit de référence :** `fa4f3c4 fix(arena): restore .png.png gift paths, tune mobile chat and focus (Phase V.1)`  
**Contrainte :** Zéro modification du code source.

**Périmètre recherche :** `app/`, `components/`, `lib/`, `hooks/`, `contexts/` (+ complément repo entier pour `supabase.auth.signOut`)

---

## Synthèse diagnostic Phase X

### Résultat recherche `signOut`

| Fichier | Lignes | Nature |
|---------|--------|--------|
| `contexts/AuthContext.tsx` | 23, 214–218, 245 | Définition type + implémentation `supabase.auth.signOut()` + export contexte |
| `components/Header.tsx` | 156, 649, 812 | Appels UI explicites (bouton « Déconnexion » desktop + mobile) |
| `app/settings/page.tsx` | 59, 212 | Appel après suppression de compte API |
| `lib/` | **0** | Aucune occurrence |
| `hooks/` | **0** | Aucune occurrence |
| Autres `components/` | **0** | Aucune occurrence hors `Header.tsx` |

**Conclusion :** aucun handler WebSocket / Realtime / broadcast n'appelle `signOut()`.

### Résultat recherche broadcast / `beef_ended`

- **17 handlers** `.on('broadcast', …)` dans `hooks/useArenaRealtime.ts` (L.435–626)
- **`beef_ended`** (L.610–625) → délègue à `callbacksRef.current.onBeefEnded` uniquement
- **`TikTokStyleArena.onBeefEnded`** (L.2865–2896) → `leave()` Daily + `router.replace('/feed')` après 12 s — **pas de `signOut`**
- **`broadcastBeefEnded`** émetteur : `TikTokStyleArena.endBeef` (L.1134)

**Conclusion broadcast :** fin de beef = sortie room vidéo + redirection feed, pas invalidation session Supabase.

### Hypothèse bug multi-appareils

Si plusieurs clients utilisent **le même compte Supabase** (même session JWT partagée), un `supabase.auth.signOut()` sur un appareil invalide la session **sur tous les onglets/appareils** connectés à ce compte. Vérifier aussi `onAuthStateChange` (`AuthContext.tsx` L.67) : session `null` → UI « déconnectée » sans appel local à `signOut`.

---

## 1. Recherche globale — terme strict `signOut`

**Commande équivalente :** `rg -n -C 5 signOut --glob *.{ts,tsx} app components lib hooks contexts`

### `contexts/AuthContext.tsx`

```tsx
  20-  /** SMS — nécessite Phone activé dans Supabase + fournisseur (Twilio, etc.). */
  21-  sendPhoneOtp: (phoneE164: string) => Promise<{ error: unknown }>;
  22-  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<{ error: unknown }>;
  23:  signOut: () => Promise<void>;
  24-  resetPassword: (email: string) => Promise<{ error: unknown }>;
  25-}
  ...
  211-    }
  212-  };
  213-
  214:  const signOut = async () => {
  215:    await supabase.auth.signOut();
  216-    if (typeof window !== 'undefined') {
  217-      window.location.href = '/feed';
  218-    }
  219-  };
  ...
  242-      signInWithMagicLink,
  243-      sendPhoneOtp,
  244-      verifyPhoneOtp,
  245:      signOut,
  246-      resetPassword,
  247-    }),
```

### `app/settings/page.tsx`

```tsx
  56-
  57-export default function SettingsPage() {
  58-  const router = useRouter();
  59:  const { user, signOut, loading: authLoading } = useAuth();
  ...
  209-        const data = await res.json();
  210-        throw new Error(data.error || 'Erreur serveur');
  211-      }
  212:      await signOut();
  213-      router.push('/');
  214-    } catch (error: unknown) {
```

### `components/Header.tsx`

```tsx
  153-  >([]);
  154-  const pathname = usePathname();
  155-  const router = useRouter();
  156:  const { user, userRole, signOut } = useAuth();
  ...
  646-                          <DropdownMenu.Item asChild>
  647-                            <button
  648-                              onClick={async () => {
  649:                                await signOut();
  650-                                setUserMenuOpen(false);
  651-                              }}
  ...
  654-                              <LogOut className="w-4 h-4" />
  655-                              <span>Déconnexion</span>
  ...
  809-                          <span>{item.label}</span>
  810-                        </Link>
  811-                      ))}
  812:                      <button onClick={() => { signOut(); setMobileMenuOpen(false); }}
  813-                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/[0.08]">
  814-                        <LogOut className="w-5 h-5" />
  815-                        <span>Déconnexion</span>
```

### Complément — `supabase.auth.signOut` (repo entier)

**Occurrence unique :** `contexts/AuthContext.tsx` L.215 (voir bloc ci-dessus).

---

## 2. Recherche événements suspects — `.on('broadcast'` et `broadcastBeefEnded`

### 2a. Inventaire handlers `.on('broadcast'` — `hooks/useArenaRealtime.ts`

| Ligne | Event broadcast | Callback délégué | signOut ? |
|-------|-----------------|------------------|-----------|
| 435 | `sfx` | `onSfxPlayed` | Non |
| 440 | `reaction` | `onReactionReceived` + aura | Non |
| 457 | `aura_batch` | `onAuraBatchDeltas` | Non |
| 465 | `aura_master_sync` | `onAuraMasterSync` | Non |
| 471 | `message` | `onMessageReceived` | Non |
| 484 | `delete_message` | `onMessageDeleted` | Non |
| 490 | `arena_big_gift` | `onArenaBigGift` | Non |
| 506 | `pulse_voice` | `onPulseVoice` | Non |
| 512 | `announcement_banner` | `onAnnouncementBanner` | Non |
| 525 | `beef_global_timer` | `onGlobalTimerSync` | Non |
| 539 | `speaking_turn` | `onSpeakingTurn` | Non |
| 567 | `mediator_floor` | `onMediatorFloor` | Non |
| 571 | `mediation_toss` | `onMediationToss` | Non |
| 577 | `structured_debate` | `onStructuredDebate` | Non |
| 592 | `mediator_mute_challenger` | `onMediatorMuteChallenger` | Non |
| 600 | `beef_verdict` | `onBeefVerdict` | Non |
| 610 | **`beef_ended`** | **`onBeefEnded`** | **Non** |

**Extrait brut — chaîne d'abonnement (L.430–626) :**

```tsx
      ch = supabase.channel(`live_${roomId}`, {
        config: { broadcast: { self: false } },
      });

      ch
        .on('broadcast', { event: 'sfx' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const id = o?.id;
          if (typeof id === 'string' && id) callbacksRef.current.onSfxPlayed?.(id);
        })
        .on('broadcast', { event: 'reaction' }, ({ payload }: { payload?: unknown }) => {
          // ... onReactionReceived / onReactionAurasFromBroadcast
        })
        // ... (aura_batch, aura_master_sync, message, delete_message, arena_big_gift,
        //      pulse_voice, announcement_banner, beef_global_timer, speaking_turn,
        //      mediator_floor, mediation_toss, structured_debate, mediator_mute_challenger,
        //      beef_verdict)
        .on('broadcast', { event: 'beef_ended' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const reason = typeof o?.reason === 'string' ? o.reason : undefined;
          const summaryRaw = o?.summary;
          const summary =
            summaryRaw !== null &&
            summaryRaw !== undefined &&
            typeof summaryRaw === 'object' &&
            !Array.isArray(summaryRaw)
              ? (summaryRaw as Record<string, unknown>)
              : undefined;

          callbacksRef.current.onBeefEnded?.({
            summary,
            reason,
          });
        })
        .subscribe((status: string) => {
          // ...
        });
```

**Recherche `signOut` dans `hooks/useArenaRealtime.ts` :** 0 occurrence.

### 2b. Émetteur `broadcastBeefEnded` — `components/TikTokStyleArena.tsx`

```tsx
  1133-    // Broadcast end to all viewers (with stats so they see accurate summary)
  1134:    arenaOutboundRef.current.broadcastBeefEnded?.({
  1135-      reason,
  1136-      summary,
  1137-    });
  1138-
  1139-    // Stop camera/mic
  1140-    await leaveRef.current();
  1141-
  1142-    // Auto-redirect after 12 seconds
  1143-    endSummaryTimerRef.current = setTimeout(() => {
  1144-      router.replace('/feed');
  1145-    }, 12000);
```

**Définition broadcast — `hooks/useArenaRealtime.ts` L.333–336 :**

```tsx
  const broadcastBeefEnded = useCallback(
    (p: BeefEndedBroadcastPayload & { summary?: Record<string, unknown> }) => safeBroadcast('beef_ended', { ...p }),
    [safeBroadcast],
  );
```

### 2c. Récepteur `onBeefEnded` — `components/TikTokStyleArena.tsx`

```tsx
    onBeefEnded: (payload) => {
      if (beefEndedRef.current) return;
      beefEndedRef.current = true;
      const summaryRaw = payload?.summary;
      if (summaryRaw && typeof summaryRaw === 'object' && !Array.isArray(summaryRaw)) {
        const o = summaryRaw as Record<string, unknown>;
        setEndSummary({
          duration: String(o.duration ?? ''),
          viewers: Number(o.viewers) || 0,
          resonanceA: Number(o.resonanceA) || 0,
          resonanceB: Number(o.resonanceB) || 0,
          resonanceC: Number(o.resonanceC) || 0,
          resonanceD: Number(o.resonanceD) || 0,
          resonanceE: Number(o.resonanceE) || 0,
          resonanceF: Number(o.resonanceF) || 0,
          resonanceM: Number(o.resonanceM) || 0,
          messages: Number(o.messages) || 0,
          endReason: String(o.endReason ?? 'Fin du beef'),
        });
      } else {
        setEndSummary(null);
      }
      setBeefEnded(true);
      if (endSummaryTimerRef.current) {
        clearTimeout(endSummaryTimerRef.current);
        endSummaryTimerRef.current = null;
      }
      void leaveRef.current().then(() => {
        endSummaryTimerRef.current = setTimeout(() => {
          router.replace('/feed');
        }, 12000);
      });
    },
```

**Recherche `signOut` dans le bloc `arenaRealtimeCallbacks` de `TikTokStyleArena.tsx` :** 0 occurrence.

### 2d. Comparaison `handleLeave` vs `signOut`

`handleLeave` (`TikTokStyleArena.tsx` L.2660–2687) appelle `leave()` / `endBeef()` + `router.replace('/feed')` — **≠ déconnexion auth**.

---

## 3. Fichiers d'authentification impliqués (référence croisée Phase W)

| Fichier | Rôle logout |
|---------|-------------|
| `contexts/AuthContext.tsx` | Source unique `supabase.auth.signOut()` |
| `components/Header.tsx` | UI « Déconnexion » |
| `app/settings/page.tsx` | Logout post-suppression compte |

Aucun autre fichier dans `app/`, `components/`, `lib/`, `hooks/`, `contexts/` ne référence `signOut`.
