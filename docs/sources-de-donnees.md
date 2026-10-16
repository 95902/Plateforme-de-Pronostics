# Sources de données réelles — étude

_Octobre 2026. Objectif : remplacer les données de démo aléatoires par un historique réel de
courses (partants, cotes, arrivées, rapports), pour que les pronostics et les backtests aient un sens._

## Ce dont la plateforme a besoin

| Donnée | Usage | Indispensable ? |
|---|---|---|
| Programme : réunions, courses, partants, jockeys, entraîneurs, distance, terrain | Afficher les courses, calculer les pronostics | Oui |
| Cotes (au moins finales ; idéalement l'évolution avant le départ) | Value bets, stratégies, backtest | Oui |
| Arrivées (ordre, non-partants, disqualifications) | Régler les paris, entraîner et évaluer le modèle | Oui |
| Rapports PMU (simple, couplé, trio, quarté+, quinté+) | Payer les combinés au vrai rapport au lieu de l'estimation Harville | Utile |
| Historique sur plusieurs années | Entraîner un modèle et le backtester honnêtement | Oui |

## Sources identifiées

### 1. Sources officielles : PMU, France Galop, LeTrot
- **Aucune API publique documentée.** Le site et les applications du PMU s'appuient sur une API JSON
  interne, non documentée, dont les adresses peuvent changer sans préavis
  ([Octoparse](https://www.octoparse.fr/blog/donnees-hippiques-ia-pmu-csv),
  [Apify — Horse Racing Pulse](https://apify.com/0xgollum/horse-racing-pulse)).
- **Les données sont protégées.** France Galop se déclare « propriétaire exclusif du droit
  d'exploitation des courses » qu'elle organise, y compris des **données** et images qui en sont
  issues ([Conditions générales France Galop](https://www.france-galop.com/sites/default/files/2023-03/cg-2023.03.01.pdf)).
  Plus largement, l'article L333-1 du Code du sport réserve aux organisateurs l'exploitation de leurs
  manifestations ([ANJ](https://www.anj.fr/sites/default/files/2020-02/2011-106.pdf)), et un
  amendement récent visait à étendre explicitement ce droit aux données des réunions hippiques
  ([amendement I-2995, PLF 2025](https://www.assemblee-nationale.fr/dyn/17/amendements/0324A/AN/2995)) —
  je n'ai pas pu vérifier s'il a été adopté.
- **Conséquence :** une utilisation commerciale ou publique suppose un **accord de licence** avec le
  PMU et/ou les sociétés-mères (France Galop pour le galop, LeTrot pour le trot). C'est la seule
  voie à la fois fiable et sûre juridiquement pour une mise en production.

### 2. Sources tierces non officielles
- **[Open PMU API](https://github.com/nanaelie/open-pmu-api)** : API gratuite (code MIT) avec les
  arrivées depuis 2004, les partants, les cotes, la musique et les jockeys/entraîneurs. Pas de rapports.
  Elle précise elle-même que sa licence « ne confère aucun droit particulier sur les données de
  courses » : la provenance et les droits sur les données ne sont pas établis.
- **Exports payants** comme [turf.bzh](https://www.turf.bzh/export-journee.php) (CSV de 58 colonnes
  par journée, avec rapports simple gagnant/placé), ou le scraping du site PMU
  ([Boturfers](https://www.boturfers.fr/blog/comment-recuperer-les-donnees-du-pmu)) : pratiques, mais
  les mêmes questions de droits sur les données se posent.
- **API de cotes multi-bookmakers** ([OddsPapi](https://oddspapi.io/sportsbooks/pmu),
  [odds-api.io](https://odds-api.io/sportsbooks/pmu)) : surtout orientées paris sportifs ; la
  couverture des courses PMU et de l'historique est à vérifier.

### 3. Alternatives sous licence claire, hors France
- **[Betfair Historical Data](https://github.com/betfair/historic-data-workbook)** (courses
  britanniques, irlandaises, australiennes…) : données de marché historiques vendues officiellement ;
  le niveau « Basic » est gratuit. C'est une base saine pour **développer et valider la méthode**
  (modèle, backtest), même si ce ne sont pas des courses françaises.
- **Jeux de données Kaggle sur Hong Kong** (par ex. [hkracing](https://baselight.app/u/kaggle/dataset/gdaley_hkracing)) :
  pratiques pour prototyper, mais la licence de chaque jeu est à vérifier.

## Recommandation

1. **Pour la mise en production avec des courses françaises : contacter le PMU** (service données
   et partenariats) et/ou France Galop / LeTrot pour une licence de données. C'est une décision de
   votre côté : coût, usage prévu (gratuit, payant, public, privé), volume.
2. **En attendant, ne pas dépendre d'une source précise.** La plateforme doit importer un **format
   d'échange neutre** (CSV/JSON documenté). N'importe quelle source, licenciée ou non, s'y branche
   ensuite par un petit adaptateur, sans toucher au reste.
3. **Pour mettre au point le modèle**, utiliser une source dont la licence est claire (Betfair
   Basic, ou un jeu de données sous licence ouverte), au même format neutre.
4. **Ne pas mettre en production de scraping du site PMU** ni de redistribution de données tierces
   dont les droits ne sont pas établis.

## Ce qui peut être construit dès maintenant (indépendant de la source)

1. **Format d'import neutre et importeur** (CSV/JSON) : réunions, courses, partants, cotes, arrivées,
   rapports ; import idempotent (ré-importer une journée met à jour sans dupliquer), avec un rapport
   d'erreurs ligne par ligne.
2. **Statistiques « à date »** : aujourd'hui le score d'un cheval utilise ses statistiques de carrière
   *actuelles*, ce qui fausse le backtest (biais d'anticipation). Il faut calculer, pour chaque
   course, la forme des chevaux, jockeys et entraîneurs **uniquement à partir des courses
   antérieures**.
3. **Rapports réels** : quand le fichier importé contient les rapports PMU, régler les combinés au
   vrai rapport plutôt qu'à l'estimation Harville.
4. **Évaluation du modèle** : comparer les pronostics à une référence simple, les cotes du marché
   (log-loss, calibration, ROI en backtest). Un modèle qui ne bat pas les cotes n'a pas de valeur
   pour parier.

## Décision (octobre 2026)

- Usage **privé**, pas de contact chez le PMU ni chez France Galop / LeTrot, priorité au **plat**.
- Source retenue pour commencer : **Open PMU API**, via un adaptateur
  (`backend/src/services/import/adapters/open-pmu.ts`) et la commande :

  ```bash
  cd backend
  npm run fetch:open-pmu -- --from 2025-01-01 --to 2025-03-31            # plat, importé
  npm run fetch:open-pmu -- --from 2025-01-01 --to 2025-01-07 --dry-run  # tester sans importer
  ```

  Options : `--discipline Plat|Trot|Obstacles|all`, `--save <dossier>` (garde les fichiers convertis),
  `--allow-incomplete`, `--delay-ms` (pause entre deux requêtes, 1,5 s par défaut), 366 jours maximum
  par lancement.
- Limites de cette source :
  - **courses terminées uniquement** : elle construit l'historique (modèle, backtest) mais ne fournit
    pas le programme des courses à venir ;
  - **pas de rapports PMU** ;
  - les courses dont tous les partants ne sont pas détaillés sont **ignorées par défaut** (elles
    fausseraient les probabilités) ; les ex æquo aussi pour l'instant ;
  - aucun engagement de disponibilité ; à utiliser avec modération et pour un usage privé.

## Pronostics de la presse : turfpronos.fr (octobre 2026)

Le site [turfpronos.fr](https://www.turfpronos.fr/) rassemble les pronostics de plusieurs journaux
(CanalTurf, Equidia, ZEturf…) et en calcule une **synthèse**. Ses pages sont rendues côté serveur :
un simple parseur HTML suffit (`backend/src/services/import/adapters/turfpronos.ts`).

```bash
cd backend
npm run fetch:turfpronos                              # courses Pick 5 du jour
npm run fetch:turfpronos -- --day tomorrow --bet all  # Pick 5 et Quinté+ de demain
npm run fetch:turfpronos -- --dry-run                 # lire sans rien enregistrer
```

- Parcours : page d'accueil → courses marquées « pronostic pick5 » (ou « quinte ») de la journée →
  page `course?id=N` → tableau des partants (onglet Tableau) et pronostics + synthèse (onglet Pronostics).
- Chaque course est importée **au statut prévu**, avec ses partants (poids, sexe, âge, jockey,
  entraîneur), sous le même identifiant que les arrivées Open PMU (`openpmu-AAAA-MM-JJ-RxCy`) : les
  résultats importés ensuite complètent la même course.
- Les pronostics sont enregistrés dans `race_tips` (un rang par journal, la synthèse marquée
  `is_consensus`) et affichés sur la page de la course. Relancer la commande les remplace.
- Limites : **pas de cotes** (les paris et les pronostics du modèle en ont besoin), pas d'arrivées,
  le pays de l'hippodrome n'est pas donné (France supposé), la corde n'est pas encore importée, et
  l'affichage des non-partants sur ce site n'a pas encore été observé. Scraping d'un site tiers :
  usage privé uniquement, une requête toutes les 1,5 s.

## Questions (posées avant la décision)

- Visez-vous un usage **privé** (outil personnel) ou **public** (site ouvert, payant ou non) ? Les
  contraintes de licence ne sont pas du tout les mêmes.
- Avez-vous déjà un contact au PMU ou chez France Galop / LeTrot, ou une source de données en tête ?
- Disciplines prioritaires : plat, trot, obstacles ?
