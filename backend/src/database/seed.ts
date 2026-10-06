import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

// Sum of implied probabilities (1/odds) of a race: 1.18 ≈ an 18% bookmaker margin, like PMU pools
const ODDS_OVERROUND = 1.18;

/** Random odds for a race (first 3 runners are favorites), scaled to a realistic margin */
function generateRaceOdds(numRunners: number): number[] {
  const rawOdds = Array.from({ length: numRunners }, (_, i) => {
    const baseOdds = 2 + Math.random() * 18;
    return i < 3 ? baseOdds * 0.5 : baseOdds; // Favorites have lower odds
  });
  const impliedTotal = rawOdds.reduce((sum, odds) => sum + 1 / odds, 0);
  return rawOdds.map((odds) => Math.max(1.05, Math.round(((odds * impliedTotal) / ODDS_OVERROUND) * 100) / 100));
}

function drawFinishOrder<T extends { odds: number }>(runners: T[]): T[] {
  const remaining = [...runners];
  const order: T[] = [];
  while (remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, runner) => sum + 1 / runner.odds, 0);
    let pick = Math.random() * totalWeight;
    let index = 0;
    while (index < remaining.length - 1 && pick >= 1 / remaining[index].odds) {
      pick -= 1 / remaining[index].odds;
      index++;
    }
    order.push(remaining.splice(index, 1)[0]);
  }
  return order;
}

async function seed() {
  // The seed wipes every table: never run it by accident against a production database
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    console.error('❌ Refusing to seed in production: this deletes all data. Set ALLOW_DESTRUCTIVE_SEED=true to confirm.');
    process.exit(1);
  }

  console.log('🌱 Seeding database...');

  try {
    // Clear existing data
    await pool.query('TRUNCATE users, horses, jockeys, trainers, hippodromes, races, runners, results, strategies, bets, transactions, simulations CASCADE');

    // 1. Seed Demo User
    const hashedPassword = await bcrypt.hash('Demo123!', 10);
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password, role, bankroll)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['demo@hippodrome.com', 'demo', hashedPassword, 'user', 1000]
    );
    const userId = userResult.rows[0].id;
    console.log('✅ Demo user created (email: demo@hippodrome.com, password: Demo123!)');

    // Initial bankroll transaction
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'DEPOSIT', 1000, 0, 1000, 'Initial deposit']
    );

    // Admin user (can record race results and cancel races)
    const adminPassword = await bcrypt.hash('Admin123!', 10);
    await pool.query(
      `INSERT INTO users (email, username, password, role, bankroll)
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin@hippodrome.com', 'admin', adminPassword, 'admin', 0]
    );
    console.log('✅ Admin user created (email: admin@hippodrome.com, password: Admin123!)');

    // 2. Seed Hippodromes
    const hippodromes = [
      ['Vincennes', 'Paris', 'France', 'Trot', 'Sable', 'Main gauche', 50000],
      ['Longchamp', 'Paris', 'France', 'Plat', 'Gazon', 'Main droite', 60000],
      ['Auteuil', 'Paris', 'France', 'Obstacles', 'Gazon', 'Main droite', 40000],
      ['Chantilly', 'Chantilly', 'France', 'Plat', 'Gazon', 'Main droite', 35000],
      ['Deauville', 'Deauville', 'France', 'Plat', 'Gazon', 'Main droite', 45000],
      ['Lyon-Parilly', 'Lyon', 'France', 'Plat', 'Gazon', 'Main gauche', 30000],
      ['Marseille-Borély', 'Marseille', 'France', 'Plat', 'Gazon', 'Main gauche', 25000],
      ['Saint-Cloud', 'Saint-Cloud', 'France', 'Plat', 'Gazon', 'Main droite', 35000],
      ['Maisons-Laffitte', 'Maisons-Laffitte', 'France', 'Plat', 'Gazon', 'Main droite', 32000],
      ['Cagnes-sur-Mer', 'Cagnes-sur-Mer', 'France', 'Plat', 'Synthétique', 'Main gauche', 28000]
    ];

    for (const h of hippodromes) {
      await pool.query(
        `INSERT INTO hippodromes (name, city, country, track_type, surface, configuration, capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        h
      );
    }
    console.log('✅ Hippodromes seeded');

    // 3. Seed Horses
    const horsePrefixes = ['Éclair', 'Diamant', 'Espoir', 'Victoire', 'Royal', 'Noble', 'Brave', 'Champion', 'Étoile', 'Tonnerre'];
    const horseSuffixes = ['Noir', 'Blanc', 'Rouge', 'Doré', 'des Prés', 'du Roi', 'de France', 'Impérial', 'Sauvage', 'Magnifique'];
    const sexes = ['M', 'F', 'H'];
    const colors = ['Bai', 'Alezan', 'Gris', 'Noir', 'Rouan'];

    for (let i = 0; i < 100; i++) {
      const age = 3 + Math.floor(Math.random() * 7);
      const totalRaces = 10 + Math.floor(Math.random() * 50);
      const wins = Math.floor(totalRaces * (0.05 + Math.random() * 0.25));
      const places = wins + Math.floor(totalRaces * 0.15);

      await pool.query(
        `INSERT INTO horses (name, age, sex, breed, color, country, career_total_races, career_wins, career_places, career_earnings, optimal_distance, optimal_terrain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          `${horsePrefixes[i % horsePrefixes.length]} ${horseSuffixes[Math.floor(Math.random() * horseSuffixes.length)]}`,
          age,
          sexes[Math.floor(Math.random() * sexes.length)],
          'Pur-sang',
          colors[Math.floor(Math.random() * colors.length)],
          'France',
          totalRaces,
          wins,
          places,
          wins * 10000 + Math.floor(Math.random() * 50000),
          [1400, 1600, 2000, 2400, 3000][Math.floor(Math.random() * 5)],
          ['Bon', 'Souple'][Math.floor(Math.random() * 2)]
        ]
      );
    }
    console.log('✅ Horses seeded');

    // 4. Seed Jockeys
    const firstNames = ['Jean', 'Pierre', 'Michel', 'Olivier', 'Christophe', 'Mickaël', 'Thierry', 'Maxime', 'Antoine', 'Alexandre'];
    const lastNames = ['Dupont', 'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy'];

    for (let i = 0; i < 50; i++) {
      const totalRaces = 100 + Math.floor(Math.random() * 500);
      const wins = Math.floor(totalRaces * (0.1 + Math.random() * 0.15));

      await pool.query(
        `INSERT INTO jockeys (name, weight, nationality, license_number, career_total_races, career_wins, career_win_rate, career_earnings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
          50 + Math.random() * 15,
          'France',
          `FR${String(i).padStart(5, '0')}`,
          totalRaces,
          wins,
          wins / totalRaces,
          wins * 5000 + Math.floor(Math.random() * 100000)
        ]
      );
    }
    console.log('✅ Jockeys seeded');

    // 5. Seed Trainers
    for (let i = 0; i < 30; i++) {
      const totalHorses = 10 + Math.floor(Math.random() * 40);
      const wins = Math.floor(totalHorses * 20 * (0.1 + Math.random() * 0.15));

      await pool.query(
        `INSERT INTO trainers (name, stable_name, nationality, license_number, career_horses_trained, career_wins, career_win_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `${firstNames[i % firstNames.length]} ${lastNames[(i + 5) % lastNames.length]}`,
          `Écurie ${lastNames[(i + 5) % lastNames.length]}`,
          'France',
          `TR${String(i).padStart(5, '0')}`,
          totalHorses,
          wins,
          wins / (totalHorses * 20)
        ]
      );
    }
    console.log('✅ Trainers seeded');

    // 6. Seed Historical Races (last 6 months)
    const horses = await pool.query('SELECT id FROM horses ORDER BY id');
    const jockeys = await pool.query('SELECT id FROM jockeys ORDER BY id');
    const trainers = await pool.query('SELECT id FROM trainers ORDER BY id');
    const hippodromeIds = await pool.query('SELECT id FROM hippodromes ORDER BY id');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);

    let raceCount = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip some days (30% probability)
      if (Math.random() < 0.3) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // 3-8 races per day
      const racesPerDay = 3 + Math.floor(Math.random() * 6);

      for (let raceNum = 1; raceNum <= racesPerDay; raceNum++) {
        const hippodrome = hippodromeIds.rows[Math.floor(Math.random() * hippodromeIds.rows.length)];
        const distance = [1400, 1600, 2000, 2400, 3000][Math.floor(Math.random() * 5)];
        const weathers = ['Ensoleillé', 'Nuageux', 'Pluie'];
        const conditions = ['Bon', 'Souple', 'Lourd'];

        const raceResult = await pool.query(
          `INSERT INTO races (hippodrome_id, race_number, date, time, name, race_type, distance, prize_money, weather, track_condition, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            hippodrome.id,
            raceNum,
            currentDate.toISOString().split('T')[0],
            `${13 + raceNum}:00`,
            `Prix de ${['Paris', 'la République', 'la Ville', 'l\'Avenir', 'l\'Espoir'][Math.floor(Math.random() * 5)]}`,
            ['Plat', 'Trot', 'Obstacles'][Math.floor(Math.random() * 3)],
            distance,
            20000 + Math.floor(Math.random() * 80000),
            weathers[Math.floor(Math.random() * weathers.length)],
            conditions[Math.floor(Math.random() * conditions.length)],
            'finished'
          ]
        );
        const raceId = raceResult.rows[0].id;

        // 8-16 runners per race
        const numRunners = 8 + Math.floor(Math.random() * 9);
        const selectedHorses = [...horses.rows].sort(() => Math.random() - 0.5).slice(0, numRunners);

        const raceRunners: { id: number; odds: number }[] = [];

        const raceOdds = generateRaceOdds(selectedHorses.length);

        for (let i = 0; i < selectedHorses.length; i++) {
          const horse = selectedHorses[i];
          const jockey = jockeys.rows[Math.floor(Math.random() * jockeys.rows.length)];
          const trainer = trainers.rows[Math.floor(Math.random() * trainers.rows.length)];

          const odds = raceOdds[i];

          const runnerResult = await pool.query(
            `INSERT INTO runners (race_id, horse_id, jockey_id, trainer_id, saddle_number, weight_carried, morning_odds, final_odds, prediction_score, confidence_level)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [
              raceId,
              horse.id,
              jockey.id,
              trainer.id,
              i + 1,
              54 + Math.random() * 6,
              odds,
              odds * (0.9 + Math.random() * 0.2),
              50 + Math.random() * 40,
              ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)]
            ]
          );
          raceRunners.push({ id: runnerResult.rows[0].id, odds });
        }

        // Draw the finishing order: each place is won with a probability proportional
        // to 1/odds among the remaining runners, so favorites win more often but not always
        const finishOrder = drawFinishOrder(raceRunners);

        for (let i = 0; i < finishOrder.length; i++) {
          const { id: runnerId, odds } = finishOrder[i];
          const position = i + 1;
          await pool.query(
            `INSERT INTO results (race_id, runner_id, finish_position, finish_time, lengths_behind, payout_win, payout_place)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              raceId,
              runnerId,
              position,
              `${Math.floor(distance / 400)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}.${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
              position === 1 ? 0 : Math.random() * (position - 1) * 2,
              position === 1 ? odds * (0.9 + Math.random() * 0.2) : 0,
              position <= 3 ? odds * 0.2 : 0
            ]
          );
        }

        raceCount++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
    console.log(`✅ ${raceCount} historical races seeded`);

    // 7. Seed upcoming races (next 7 days)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const futureEndDate = new Date();
    futureEndDate.setDate(futureEndDate.getDate() + 7);

    let upcomingCount = 0;
    while (futureDate <= futureEndDate) {
      const racesPerDay = 3 + Math.floor(Math.random() * 6);

      for (let raceNum = 1; raceNum <= racesPerDay; raceNum++) {
        const hippodrome = hippodromeIds.rows[Math.floor(Math.random() * hippodromeIds.rows.length)];
        const distance = [1400, 1600, 2000, 2400, 3000][Math.floor(Math.random() * 5)];

        const raceResult = await pool.query(
          `INSERT INTO races (hippodrome_id, race_number, date, time, name, race_type, distance, prize_money, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            hippodrome.id,
            raceNum,
            futureDate.toISOString().split('T')[0],
            `${13 + raceNum}:00`,
            `Prix de ${['Paris', 'la République', 'la Ville', 'l\'Avenir', 'l\'Espoir'][Math.floor(Math.random() * 5)]}`,
            ['Plat', 'Trot', 'Obstacles'][Math.floor(Math.random() * 3)],
            distance,
            20000 + Math.floor(Math.random() * 80000),
            'scheduled'
          ]
        );
        const raceId = raceResult.rows[0].id;

        // Runners for upcoming races
        const numRunners = 8 + Math.floor(Math.random() * 9);
        const selectedHorses = [...horses.rows].sort(() => Math.random() - 0.5).slice(0, numRunners);

        const raceOdds = generateRaceOdds(selectedHorses.length);

        for (let i = 0; i < selectedHorses.length; i++) {
          const horse = selectedHorses[i];
          const jockey = jockeys.rows[Math.floor(Math.random() * jockeys.rows.length)];
          const trainer = trainers.rows[Math.floor(Math.random() * trainers.rows.length)];

          const odds = raceOdds[i];

          await pool.query(
            `INSERT INTO runners (race_id, horse_id, jockey_id, trainer_id, saddle_number, weight_carried, morning_odds, final_odds, prediction_score, confidence_level)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              raceId,
              horse.id,
              jockey.id,
              trainer.id,
              i + 1,
              54 + Math.random() * 6,
              odds,
              odds * (0.9 + Math.random() * 0.2),
              50 + Math.random() * 40,
              ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)]
            ]
          );
        }

        upcomingCount++;
      }

      futureDate.setDate(futureDate.getDate() + 1);
    }
    console.log(`✅ ${upcomingCount} upcoming races seeded`);

    // 8. Seed demo strategies
    await pool.query(
      `INSERT INTO strategies (user_id, name, type, description, parameters, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        'Favorite Safe',
        'FAVORITE',
        'Paris sur favoris avec cotes < 4',
        JSON.stringify({ baseStake: 20, maxOdds: 4, stopLossStreak: 3 }),
        true
      ]
    );

    await pool.query(
      `INSERT INTO strategies (user_id, name, type, description, parameters, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        'Value Hunter',
        'VALUE_BETTING',
        'Recherche de value bets avec EV > 5%',
        JSON.stringify({ minEV: 5, percentageBankroll: 2, minOdds: 3, maxOdds: 15 }),
        true
      ]
    );

    console.log('✅ Demo strategies seeded');

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📝 Demo Credentials:');
    console.log('   Email: demo@hippodrome.com');
    console.log('   Password: Demo123!');
    console.log('   Initial Bankroll: 1000€');
    console.log('   Admin: admin@hippodrome.com / Admin123!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
