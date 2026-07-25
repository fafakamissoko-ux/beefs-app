# CONTEXTE — Audit Technique « WebRTC Spectateur & Système Raise-Hand » (Phase G)

Tu reçois le fichier `rapport_audit_phase_g0.md`.
C'est un audit technique approfondi du flux spectateur (accès vidéo, tokens Daily.co, moteur WebRTC) et du système de participation (raise-hand, invitations Ref) — évalué contre les standards de sécurité, cohérence logique et robustesse attendus d'une plateforme live.

Il contient **2 anomalies** identifiées :

- 🔴 **1 critique** : `viewerMode` forcé à `false` dans `useDailyCall.ts` (L77→L82) — le moteur WebRTC crée un `CallObject` en mode participant au lieu du mode spectateur (`subscribeToTracksAutomatically: true`), ce qui peut provoquer un écran noir pour les spectateurs faute de souscription automatique aux flux vidéo/audio distants.

- 🔴 **1 critique (sécurité)** : L'endpoint `POST /api/beef/raise-hand` effectue un upsert direct dans `beef_participants` avec `invite_status: 'pending'` sans créer de ligne `beef_invitations` et sans vérifier qu'une invitation Ref existe. Tout spectateur authentifié peut déclencher la modale « Le Ref te convoque » côté client sans passer par la validation du médiateur.

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `hooks/useDailyCall.ts` | Façade arène — **force `viewerMode: false`** (L77→L82) |
| `hooks/useDailyMeetingEngine.ts` | Moteur WebRTC Daily — branche `subscribeToTracksAutomatically` conditionnée par `viewerMode` |
| `app/api/beef/access/route.ts` | Émission du jeton Daily selon le rôle (mediator, participant, spectator) |
| `app/api/beef/raise-hand/route.ts` | Upsert `beef_participants.pending` sans validation Ref ni `beef_invitations` |
| `components/TikTokStyleArena.tsx` | UI arène — auto-join, raise-hand handler, callbacks realtime, modale d'invitation Ref |

## Chaîne d'appel spectateur

```
GET /api/beef/access?beefId=…
  └─ role: 'spectator' → dailyToken (start_video_off, start_audio_off)
       └─ useDailyCall(roomUrl, userName, viewerMode=true, …)
            └─ useDailyMeetingEngine({ viewerMode: false })  ← FORCÉ L82
                 └─ DailyIframe.createCallObject(
                      viewerMode ? { subscribeToTracksAutomatically: true }  ← JAMAIS PRISE
                                 : { audioSource, videoSource }
                    )
```

## Chaîne raise-hand (faille bypass)

```
Spectateur clique « Lever la main »
  └─ handleRaiseHand → POST /api/beef/raise-hand
       └─ upsert beef_participants { invite_status: 'pending' }  ← sans beef_invitations
            └─ useEffect détecte pending → setRefInviteAlert(true)
                 └─ Modal « Le Ref te convoque » → accept → reload
```

**Écart vs flux légitime :** une invitation Ref devrait passer par `beef_invitations` et être validée par le médiateur avant que le spectateur ne voie la modale de convocation.

## Informations complémentaires

Le rapport inclut le **code source complet** des fichiers suivants pour permettre une analyse chirurgicale sans aveuglement :
- `hooks/useDailyMeetingEngine.ts` (591 lignes)
- `app/api/beef/access/route.ts` (route token)
- `app/api/beef/raise-hand/route.ts` (route raise-hand)
- Extraits ciblés de `TikTokStyleArena.tsx` (invite detection, auto-join, raise-hand handler, realtime callbacks)

## Ce qui est attendu de toi (Architecte)

1. **Analyser les 2 anomalies** et décider de l'approche corrective pour chacune.
2. **Évaluer le risque** de régression WebRTC si on corrige le `viewerMode` forcé (impact sur les spectateurs existants, compatibilité mobile).
3. **Décider de l'architecture cible** pour le flux raise-hand : faut-il créer systématiquement une ligne `beef_invitations` depuis l'API raise-hand, ou faut-il séparer les deux flux (raise-hand = demande, invitation Ref = convocation) ?
4. **Générer les ordres de frappe** avec les fichiers cibles, les lignes exactes, et les modifications précises à appliquer.
