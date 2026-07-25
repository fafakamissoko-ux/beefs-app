# CONTEXTE — Audit Architectural « Démantèlement Monolithe ArenaView » (Phase F2 suite)

Tu reçois ce rapport de contexte pour produire des **ORDRES DE FRAPPE** destinés à l'IA d'exécution locale (Cursor Composer).

## Rôle attendu

Tu es l'Architecte. Tu ne génères **PAS** un audit. Tu génères des **ORDRES DE FRAPPE** chirurgicaux, numérotés, avec les fichiers cibles, les actions exactes, et l'ordre d'exécution.

---

## Situation actuelle

Le monolithe `TikTokStyleArena.tsx` a déjà subi une première vague d'extraction (Phase F2.1 + F2.2 partiel) :
- **Avant :** 4316 lignes
- **Après Phase F2.1/F2.2 :** 3338 lignes (-23%)
- **13 hooks** déjà extraits dans `hooks/`
- **3 modales Verre Lourd** déjà extraites dans `components/Arena/`
- **CSS migré** vers `globals.css` et `tailwind.config.ts`

**Mais le fichier reste un monolithe** avec 51 `useState`, 39 `useRef`, 52 `useEffect`, 33 `useCallback`, et ~3100 lignes de logique + JSX.

---

## Inventaire des candidats d'extraction restants

### A. Composants JSX à extraire (UI — Verre Léger)

| Candidat | Lignes source | Taille | Priorité | Description |
|----------|--------------|--------|----------|-------------|
| `ArenaGiftPicker` | L2988–L3133 | ~145 lignes | **P0** | Sélection destinataire + catalogue cadeaux + envoi API. Logique asynchrone lourde |
| `ArenaMenuPanel` | L2639–L2692 (desktop) + L3219–L3277 (mobile) | ~140 lignes combinées | **P0** | **Duplication desktop/mobile** — même contenu, deux blocs JSX |
| `ArenaBeefEndSummary` | L2502–L2608 | ~106 lignes | **P0** | Stats de résonance + CTAs de fin de beef, bloc autonome |
| `ArenaChatDock` | L2697–L2725 (desktop) + L2836–L2864 (mobile) | ~60 lignes combinées | **P1** | Input chat + boutons réactions/cadeaux, dupliqué |
| `ArenaReactionsPicker` | L2946–L2987 | ~40 lignes | **P1** | Grille emoji `PICKER_REACTIONS` |
| `ArenaDockPickersPortal` | L2940–L3137 | ~197 lignes | **P1** | Portail `createPortal` contenant reactions + gifts pickers |
| `ArenaDesktopChatAside` | L2624–L2728 | ~104 lignes | **P1** | Aside chat desktop complet |
| `ArenaMobileChatOverlay` | L2830–L2866 | ~36 lignes | **P2** | Overlay mobile messages + dock |
| `ArenaAnnouncementTicker` | L2445–L2460 + L2734–L2745 | ~30 lignes | **P2** | Duplication banner desktop/mobile |
| `ArenaFlyingReactions` | L3314–L3338 | 25 lignes | **P2** | Déjà séparé en export, juste à déplacer dans un fichier |

### B. Hooks à extraire (Logique — Noyau Dur)

| Hook proposé | States / Refs / Effects / Callbacks | Taille estimée | Priorité | Risque |
|--------------|--------------------------------------|----------------|----------|--------|
| `useBeefTimer` | States L583–L588 ; Refs L584–L615 ; Effects L632–L659, L947–L954 ; Callbacks L746–L828 | ~150 lignes | **P0** | **Élevé** — `beefTimeRemainingRef` alimente les intervalles, risque stale closures |
| `useSpeakingTurn` | States L320–L344 ; Refs L322–L330, L1865 ; Effects L1861–L1944 ; Callbacks L1669–L1859 | ~250 lignes | **P0** | **Élevé** — Tours de parole liés au chrono et au broadcast |
| `useAuraSystem` | States L273–L281, L666–L675 ; Refs L371–L373, L663–L669 ; Effects L375–L377, L717–L733, L972–L1005 ; Callbacks L498–L559, L680–L715 | ~200 lignes | **P1** | **Moyen** — Decay, fever, pulse broadcast autonomes |
| `useBeefLifecycle` | States L287–L305 ; Refs L302–L313, L608–L611 ; Callbacks L830–L928 | ~150 lignes | **P1** | **Élevé** — Fin de beef, summary, grace médiateur |
| `useDockPickers` | States L245, L363–L366 ; Ref L368 ; Effects L379–L443 | ~70 lignes | **P2** | Faible — Position portail, fermeture Escape |
| `useArenaRealtimeHandlers` | Objet callbacks L2101–L2281 + assign L2288–L2306 | ~180 lignes | **P1** | **Moyen** — Handlers broadcast, dépend de `arenaOutboundRef` |
| `useCinematicMode` | State L250 ; handlers L2391–L2401, L2462–L2477 | ~40 lignes | **P2** | Faible |
| `useArenaPresence` | Memos L2320–L2331 ; Effects L2334–L2347 | ~30 lignes | **P2** | Faible |

### C. Code mort à purger (pré-requis)

| Élément | Lignes | Nature |
|---------|--------|--------|
| Import `ChatPanel` | L27 | Non utilisé |
| Import `FeatureGuide` | L32 | Non utilisé |
| Import `ProfileUserLink` | L34 | Non utilisé |
| Import `MediatorSupportHalo` | L91 | Non utilisé |
| `TOP_10_REACTIONS` | L144–L146 | Constante non utilisée dans le JSX |
| `globalHeatGlow`, `sponsorGlow` | L1010–L1021 | Variables CSS dynamiques définies mais non branchées |
| `leftAura`, `leftColor`, `rightColor`, `gloryIntenseA/B` | L1344–L1507 | Calculs visuels non utilisés |
| `leftRemoteAudioMuted`, `rightRemoteAudioMuted` | L1366–L1372 | Non utilisés |
| `featureGuideSuppress` | L1152–L1154 | Non utilisé |
| `callError` | L1059 | Non utilisé |
| Interface `UserProfile` | L178–L193 | Remplacée par `ArenaUserProfile` |

---

## Contraintes techniques

1. **Synchronisation WebRTC** : Le bus `arenaOutboundRef` (type `RefObject<Partial<UseArenaRealtimeResult>>`) est le point de coordination entre la logique et le broadcast. Tout hook extrait doit le recevoir en paramètre.
2. **Stale closures** : Les `setInterval` dans les hooks timer/speaking doivent utiliser des refs pour les valeurs courantes, jamais des closures sur des states.
3. **Ordre d'appel** : Les hooks extraits doivent être appelés dans un ordre déterministe conforme aux règles React.
4. **Design System** : Les composants extraits doivent utiliser les classes Premium Glass :
   - Modales/Tiroirs : `bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl`
   - HUD/Boutons : `bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg`

---

## Décisions attendues de l'Architecte

1. **Ordre de bataille** : Dans quel ordre exécuter les extractions ? (Purge code mort → Hooks P0 → Composants P0 → etc.)
2. **ArenaMenuPanel** : Fusionner desktop/mobile en un seul composant avec prop `variant` ou garder séparés ?
3. **ArenaGiftPicker** : La logique d'envoi de cadeau (fetch API, wallet store) doit-elle migrer dans un hook `useGiftSend` ou rester dans le composant ?
4. **useArenaRealtimeHandlers** : Extraire en hook ou en objet de configuration passé à `useArenaRealtime` ?
5. **Réassemblage final** : Renommer `TikTokStyleArena.tsx` → `ArenaView.tsx` à la fin ou maintenir le nom actuel ?
6. **Découpage en phases** : Scinder l'exécution en sous-phases (ex: F2.3 purge + hooks P0, F2.4 composants P0, F2.5 composants P1) ?

---

## Livrable attendu

Des **ORDRES DE FRAPPE** numérotés avec :
- Fichier(s) cible(s)
- Action exacte (supprimer, extraire, créer, modifier)
- Ordre d'exécution strict
- Contraintes de typage et de synchronisation

**Ne génère PAS un rapport d'audit. Génère des ordres de frappe.**
