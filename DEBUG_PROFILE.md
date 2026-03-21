# GUIDE DE DEBUG - Profil qui tourne à l'infini

## ÉTAPE 1: Ouvre la Console du navigateur
- Appuie sur **F12**
- Va sur l'onglet **"Console"**

## ÉTAPE 2: Va sur /profile
- Va sur http://localhost:3001/profile
- Regarde dans la console

## ÉTAPE 3: Cherche ces messages:
```
✅ BON SIGNE:
- "User not found in users table, creating..."
- Puis le profil se charge

❌ ERREUR:
- Message rouge qui dit "Error loading profile"
- OU message "relation users does not exist"
- OU message "duplicate key value violates unique constraint"
```

## ÉTAPE 4: Envoie-moi le message exact

## SOLUTION TEMPORAIRE:
Si ça tourne toujours, **déconnecte-toi** puis **reconnecte-toi**:
1. Clique sur l'icône Logout dans le header
2. Re-clique sur "Connexion"
3. Reconnecte-toi
4. Reteste /profile
