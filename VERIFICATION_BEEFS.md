# 🔍 **VÉRIFICATION BEEFS - INSTRUCTIONS**

## **ÉTAPE 1: Vérifier les beefs existants**

1. Va sur [Supabase Table Editor](https://hffhucapmkjsgmrdgelq.supabase.co/project/hffhucapmkjsgmrdgelq/editor)
2. Clique sur la table **`beefs`**
3. **Regarde s'il y a des lignes**

**Si OUI (des beefs existent):**
- Note l'`id` d'un beef (ex: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- On va l'utiliser pour tester

**Si NON (aucun beef):**
- On va en créer un manuellement pour tester

---

## **ÉTAPE 2A: Si des beefs existent**

**Copie l'ID d'un beef** (exemple: `123e4567-e89b-12d3-a456-426614174000`)

Ensuite, dans ton navigateur, va sur:
```
http://localhost:3000/arena/[COLLE_ICI_L_ID_DU_BEEF]
```

Par exemple:
```
http://localhost:3000/arena/123e4567-e89b-12d3-a456-426614174000
```

---

## **ÉTAPE 2B: Si aucun beef n'existe**

**On va en créer un manuellement dans Supabase:**

1. Va sur [Supabase Table Editor - beefs](https://hffhucapmkjsgmrdgelq.supabase.co/project/hffhucapmkjsgmrdgelq/editor)
2. Clique sur **"Insert" → "Insert row"**
3. Remplis:
   - `title`: "Test Beef pour Chat"
   - `subject`: "Test"
   - `mediator_id`: [Ton user ID - va le chercher dans la table `users`]
   - `status`: "live"
   - `price`: 0
   - Laisse le reste vide ou avec valeurs par défaut
4. Clique **"Save"**
5. **Note l'`id` qui a été généré** (un UUID)

---

## **ÉTAPE 3: Tester avec le vrai UUID**

1. Va sur `http://localhost:3000/arena/[UUID_DU_BEEF]`
2. **Écris un message** dans le chat
3. Cette fois, ça devrait fonctionner! ✅

---

**Dis-moi:**
- Y a-t-il des beefs dans la table `beefs`?
- Si oui, donne-moi un ID
- Si non, crée-en un et donne-moi l'ID généré
