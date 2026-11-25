# Suivi privé des candidatures

Cette page statique est destinée à être publiée à /candidatures/ sur GitHub Pages. Elle lit l’onglet Candidature automatique du Google Sheet directement depuis le navigateur, avec le scope OAuth Google Sheets en lecture seule. Elle ne modifie pas le document et ne publie aucune ligne dans le dépôt.

## Première connexion

1. Dans Google Cloud Console, crée un identifiant OAuth 2.0 de type Application Web ou utilise un client Web autorisé.
2. Active Google Sheets API dans le projet Google Cloud.
3. Ajoute l’origine exacte du site dans les Origines JavaScript autorisées (sans chemin, par exemple https://adilchobti.github.io).
4. Ouvre le site, choisis Configurer, puis saisis l’identifiant OAuth et l’identifiant du tableur (entre /d/ et /edit dans son URL).
5. Connecte le compte qui a accès au tableur et accepte la demande de lecture seule.

L’identifiant OAuth public et l’identifiant du tableur sont conservés dans le stockage local du navigateur utilisé. Le jeton OAuth est conservé uniquement en mémoire. Les lignes lues restent en mémoire de la page. Le rafraîchissement est effectué toutes les 60 secondes tant que le jeton est valide. Si Google le révoque ou l’expire, reconnecte le compte.

## Colonnes lues

La page lit la plage A4:G de l’onglet Candidature automatique : Poste, Entreprise, Début, Durée, Note/10, Statut Soumission et Détails / Réf ATS.

Le dépôt GitHub Pages est public. Ne place jamais de CV, de données de candidature, de jeton, de secret client ou de fichier de clé Google dans ce répertoire.
