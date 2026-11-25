# Suivi privé des candidatures

Cette page statique est publiée à /candidatures/ sur GitHub Pages. Elle lit le Google Sheet directement depuis le navigateur, avec le scope OAuth Google Sheets en lecture seule. Elle ne modifie pas le document et ne publie aucune ligne dans le dépôt.

## Vues du site

- Vue d’ensemble : volume de cibles, pipeline actif, taux de réponse et relances à échéance sous 7 jours.
- Pistes positives : reprend le bloc Pistes positives du tableau Dashboard.
- Pipeline : sociétés, pays, priorité, score, statut, prochaine relance et fiabilité.
- Relances : actions dont l’échéance se situe dans les 30 prochains jours, avec les retards en premier.
- Offres : lignes de l’onglet Offres Détectées, triées par score.
- Candidatures : lignes de l’onglet Candidature automatique.

Le site interroge les onglets Suivi Candidatures, Offres Détectées, Candidature automatique et Dashboard par une lecture groupée toutes les 60 secondes. Les indicateurs sont calculés dans le navigateur à partir du pipeline.

## Première connexion

1. Dans Google Cloud Console, crée un identifiant OAuth 2.0 de type Application Web ou utilise un client Web autorisé.
2. Active Google Sheets API dans le projet Google Cloud.
3. Ajoute l’origine exacte du site dans les Origines JavaScript autorisées (sans chemin, par exemple https://adilchobti.github.io).
4. Ouvre le site, choisis Configurer, puis saisis l’identifiant OAuth et l’identifiant du tableur (entre /d/ et /edit dans son URL).
5. Connecte le compte qui a accès au tableur et accepte la demande de lecture seule.

L’identifiant OAuth public et l’identifiant du tableur sont conservés dans le stockage local du navigateur utilisé. Le jeton OAuth est conservé uniquement en mémoire. Les lignes lues restent en mémoire de la page. Le rafraîchissement est effectué toutes les 60 secondes tant que le jeton est valide. Si Google le révoque ou l’expire, reconnecte le compte.

## Plages lues

- Suivi Candidatures : A4:U, avec les cibles, scores, statuts, réponses, dates de contact/relance, notes et fiabilité.
- Offres Détectées : A1:J.
- Candidature automatique : A4:G (Poste, Entreprise, Début, Durée, Note/10, Statut Soumission et Détails / Réf ATS).
- Dashboard : A23:L28 pour les pistes positives.

Le dépôt GitHub Pages est public. Ne place jamais de CV, de données de candidature, de jeton, de secret client ou de fichier de clé Google dans ce répertoire.
