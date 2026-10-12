# Format d'import des données de courses

Format **neutre** (JSON) pour charger de vraies données dans la plateforme, quelle que soit la source :
un petit adaptateur convertit les données de la source dans ce format, puis :

```bash
cd backend
npm run import -- journee.json [autres fichiers...]   # en développement
npm run import -- journee.json --dry-run              # valider sans rien écrire
npm run import:prod -- journee.json                   # avec le build de production
```

Exemple complet : [`exemple-import.json`](./exemple-import.json) (une course terminée avec arrivée,
non-partant et rapports ; une course à venir).

## Structure

```jsonc
{
  "source": "nom de la source (facultatif)",
  "races": [ /* courses */ ]
}
```

### Course

| Champ | Obligatoire | Description |
|---|---|---|
| `external_id` | oui | Identifiant stable dans la source (ex. `2026-10-12-R1C3`). Réimporter le même identifiant **met à jour** la course au lieu d'en créer une autre |
| `date` | oui | `AAAA-MM-JJ` |
| `time` | oui | `HH:MM`, heure **locale de l'hippodrome** (voir `RACE_TIMEZONE`) |
| `racecourse` | oui | `{ name, country, city?, surface? }` — `surface` : `Gazon`, `Sable`, `Synthétique`. L'hippodrome est retrouvé par son nom, ou créé |
| `race_number` | oui | Numéro de la course dans la réunion |
| `name` | non | Nom du prix |
| `discipline` | oui | `Plat`, `Trot` ou `Obstacles` |
| `distance` | oui | En mètres |
| `prize_money` | non | Allocation, en euros |
| `track_condition` | non | `Bon`, `Souple` ou `Lourd` |
| `status` | oui | `scheduled`, `finished` ou `cancelled` |
| `runners` | oui | Partants (au moins un) |
| `dividends` | non | Rapports officiels |

### Partant

| Champ | Obligatoire | Description |
|---|---|---|
| `saddle_number` | oui | Numéro (unique dans la course) |
| `horse` | oui | `{ name, age?, sex? }` — `sex` : `M`, `F` ou `H`. Le cheval est retrouvé par son nom, ou créé |
| `jockey` | oui | `{ name }` — le driver pour le trot |
| `trainer` | oui | `{ name }` |
| `weight` | non | Poids porté, en kg |
| `morning_odds`, `final_odds` | non | Cotes décimales (> 1). Une cote absente n'efface pas celle déjà connue |
| `non_runner` | non | `true` si le cheval est non-partant : on ne peut plus le jouer, et les paris qui le contiennent sont remboursés |
| `finish_position` | si terminée | Place à l'arrivée (absente pour un cheval non classé) |
| `disqualified` | non | `true` si le cheval a été distancé |
| `finish_time` | non | Temps, en texte |

### Rapport

| Champ | Description |
|---|---|
| `bet_type` | `simple`, `couple`, `trio`, `quarte` ou `quinte` |
| `combination` | Numéros de la combinaison gagnante (autant que de places : 1 pour simple, 2 pour couplé...) |
| `payout_per_euro` | Montant payé pour 1 € misé |

Les rapports sont enregistrés (`race_dividends`) ; les paris restent payés à la cote fixée au moment
du pari.

## Règles d'import

- Chaque course est importée dans sa propre transaction : une course invalide est signalée (avec le
  chemin exact du champ en cause) et ignorée, les autres sont importées.
- Réimporter un fichier ne crée pas de doublons : courses (par `external_id`), partants (par numéro),
  chevaux, jockeys, entraîneurs et hippodromes (par nom) sont mis à jour.
- Le statut n'est jamais ramené en arrière. Une course passée à `finished` enregistre l'arrivée et
  **règle les paris** dans la même transaction ; `cancelled` rembourse les paris en attente.
- Une arrivée déjà enregistrée n'est jamais écrasée : si le fichier en donne une différente, l'import
  le signale comme conflit.
