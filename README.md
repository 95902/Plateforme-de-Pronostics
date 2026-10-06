# 🏇 Horse Racing Prediction & Betting Platform

A comprehensive full-stack platform for horse racing predictions and betting strategy simulation with AI-powered analysis.

## 📋 Overview

This platform provides:
- **AI Predictions**: Multi-criteria algorithm analyzing horse performance, jockey stats, and race conditions
- **Betting Strategies**: Multiple strategy types (Favorite, Value Betting, Kelly Criterion, Martingale, etc.)
- **Bankroll Management**: Complete transaction tracking and statistics
- **Strategy Simulation**: Backtest strategies on historical data
- **Real-time Analytics**: Comprehensive dashboards with performance metrics

## 🛠️ Tech Stack

### Backend
- **Node.js** with **TypeScript**
- **Express** for API server
- **PostgreSQL** for database
- **JWT** for authentication
- **bcryptjs** for password hashing
- **helmet** (security headers) & **express-rate-limit** (login/register throttling)
- **node:test** for unit and integration tests

### Frontend
- **React** with **TypeScript**
- **Vite** for build tooling
- **React Router** for navigation
- **Axios** for API calls
- **Tailwind CSS** for styling
- **Recharts** for data visualization

### Infrastructure
- **Docker** & **Docker Compose** (PostgreSQL for development, or the full stack)
- **GitHub Actions** CI

## 📦 Project Structure

```
Plateforme-de-Pronostics/
├── backend/
│   ├── src/
│   │   ├── config/          # Database & app configuration
│   │   ├── controllers/     # Route controllers
│   │   ├── database/        # Migrations & seeders
│   │   ├── middleware/      # Auth & other middleware
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (bets, settlement, strategies, predictions)
│   │   ├── types/           # TypeScript interfaces
│   │   ├── utils/           # Validation & HTTP error helpers
│   │   ├── app.ts           # Express app (routes & middleware)
│   │   └── server.ts        # Starts the server and background jobs
│   ├── test/                # Integration tests (need PostgreSQL)
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── lib/             # API client & utilities
│   │   ├── pages/           # Page components
│   │   ├── App.tsx          # Main app component
│   │   └── main.tsx         # Entry point
│   ├── Dockerfile           # Static build served by nginx
│   ├── .env.example
│   └── package.json
├── .github/workflows/ci.yml # CI: typecheck, lint, tests, build, Docker images
├── docker-compose.yml       # PostgreSQL, backend, frontend
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **Docker** and **Docker Compose**
- **Git**

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Plateforme-de-Pronostics
```

### 2. Start the Database

```bash
docker compose up -d postgres
```

This starts PostgreSQL on port 5432.

### 3. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run database migrations
npm run migrate

# Seed database with demo data
npm run seed

# Start development server
npm run dev
```

The backend will be running on **http://localhost:3333**

### 4. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

The frontend will be running on **http://localhost:5173**

### 5. Login to the Application

Open http://localhost:5173 in your browser and login with:

- **Email**: `demo@hippodrome.com`
- **Password**: `Demo123!`
- **Initial Bankroll**: 1000€

An admin account is also created (can record race results and cancel races):

- **Email**: `admin@hippodrome.com`
- **Password**: printed at the end of `npm run seed`. It is random unless you set `SEED_ADMIN_PASSWORD` (8+ characters), e.g. `SEED_ADMIN_PASSWORD='choose-one' npm run seed`

## 📊 Features

### 1. Authentication System
- Login and sign-up (new accounts start with 1000€)
- JWT-based authentication
- Secure password hashing with bcrypt
- Protected routes

### 2. Race Management & Betting
- View upcoming and past races
- Detailed race information with runners and the official result
- Filter by status and hippodrome
- Bet slip on the race page: pick the horses in the predictions table, choose the bet type and stake, see the estimated payout
- **My Bets** page: history with status filters, cancel pending bets until the race starts
- Admins can record the finishing order (or cancel the race) directly from the race page

### 3. AI Predictions
- **Multi-criteria scoring algorithm:**
  - Performance historique (40%)
  - Forme récente (25%)
  - Jockey/Entraîneur (15%)
  - Conditions course (10%)
  - Valeur cote (10%)
- Confidence levels (High/Medium/Low)
- Win probabilities: each runner's share of the race's total score
- Value bet detection: expected profit (probability × odds − 1) of at least 10%
- Top 5 recommendations per race

### 4. Betting Strategies

#### Available Strategy Types:
- **FAVORITE**: Bet on race favorites (lowest odds)
- **VALUE_BETTING**: Find undervalued horses with positive EV
- **KELLY_CRITERION**: Optimal stake calculation based on edge
- **MARTINGALE**: Progressive betting (double after loss)
- **FIBONACCI**: Fibonacci progression
- **DUTCHING**: Distribute stakes across multiple horses
- **FIXED_PERCENTAGE**: Fixed % of bankroll
- **CUSTOM**: Custom strategy rules (saved, not executed)

#### Backtesting
- Replay a strategy on finished races over a chosen period with a virtual bankroll (`POST /api/strategies/:id/backtest`)
- Reports bets, win rate, ROI, net profit, max drawdown, the bankroll curve and the last simulated bets; stops when the bankroll can no longer cover the stakes
- Runs are stored in the `simulations` table (`GET /api/strategies/:id/simulations`)
- Simplified model: win bets at fixed odds, predictions computed with today's horse statistics

#### Automatic execution
- Every minute, each **active** strategy places its win bets on scheduled races starting within the next hour, through the same validated path as manual bets
- At most one set of bets per strategy and race; progressions (Martingale, Fibonacci) resume from the strategy's settled bets

### 5. Bet Settlement
- Bets are settled when an admin records a race's results (`POST /api/races/:id/results`)
- A background job also settles, at startup and every minute, any finished race that still has pending bets (e.g. results imported directly into the database)
- Fixed odds: the odds are snapshotted when the bet is placed, and a winning bet pays `stake × odds` (`potential_payout`)
- **Simple** wins if the horse finishes 1st; **Couplé / Trio / Quarté / Quinté** win if the selections are exactly the first 2 / 3 / 4 / 5 finishers, in any order
- Disqualified runners are ignored when ranking
- Bets on a cancelled race are refunded
- Strategy statistics (bets, win rate, ROI, average odds) are recomputed from settled bets

### 6. Bankroll Management
- Real-time bankroll tracking
- Transaction history
- Deposit/Withdrawal system
- Comprehensive statistics:
  - Total bets & wins
  - Win rate & ROI
  - Net profit/loss
  - Exposure monitoring

### 7. Dashboard & Analytics
- Overview of key metrics
- Upcoming races recommendations
- Performance charts
- Strategy performance comparison

## 🗄️ Database Schema

### Core Tables
- **users**: User accounts and bankroll
- **horses**: Horse profiles and career stats
- **jockeys**: Jockey information and performance
- **trainers**: Trainer data and statistics
- **hippodromes**: Racetrack information
- **races**: Race details and conditions
- **runners**: Race participants (horses in races)
- **results**: Race results and payouts
- **strategies**: User betting strategies
- **bets**: User bet history
- **transactions**: Bankroll transaction log
- **simulations**: Strategy backtest results

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Races
- `GET /api/races` - List races (with filters)
- `GET /api/races/:id` - Get race details
- `GET /api/races/upcoming` - Get upcoming races
- `GET /api/races/today` - Get today's races
- `POST /api/races/:id/results` - *(admin)* Record the official result, mark the race finished and settle its bets
- `POST /api/races/:id/cancel` - *(admin)* Cancel a race and refund its pending bets

### Predictions
- `GET /api/predictions/race/:raceId` - Get race predictions
- `GET /api/predictions/race/:raceId/value-bets` - Get value bets

### Bankroll
- `GET /api/bankroll` - Get current bankroll
- `GET /api/bankroll/transactions` - Get transaction history
- `GET /api/bankroll/statistics` - Get bankroll statistics
- `POST /api/bankroll/deposit` - Deposit funds
- `POST /api/bankroll/withdraw` - Withdraw funds

### Strategies
- `GET /api/strategies` - List user strategies
- `GET /api/strategies/:id` - Get strategy details
- `POST /api/strategies` - Create strategy
- `PUT /api/strategies/:id` - Update strategy
- `DELETE /api/strategies/:id` - Delete strategy
- `POST /api/strategies/:id/backtest` - Backtest on past races (`{ from, to, initial_bankroll }`, all optional)
- `GET /api/strategies/:id/simulations` - Latest backtests of a strategy

### Bets
- `GET /api/bets` - List user bets
- `POST /api/bets` - Place bet
- `DELETE /api/bets/:id` - Cancel bet

### Horses
- `GET /api/horses` - List horses
- `GET /api/horses/:id` - Get horse details

## 🧪 Seed Data

The database seeder creates:
- **10 hippodromes** (French racetracks)
- **100 horses** with realistic stats
- **50 jockeys** with career records
- **30 trainers** with stable information
- **~600 historical races** (6 months of data): odds carry a realistic ~18% margin and the finishing order is drawn at random, weighted by the odds
- **~50 upcoming races** (next 7 days)
- **1 demo user** with initial bankroll
- **1 admin user**
- **2 demo strategies** (Favorite & Value Betting)

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected API routes
- Input validation on all write endpoints
- SQL injection prevention (parameterized queries)
- Row locks on bankroll operations (no double spending, no double refunds)
- CORS configuration
- Security headers (helmet) and 100 kB request body limit
- Rate limiting on login and registration (`AUTH_RATE_LIMIT_MAX` per IP per 15 minutes)
- In production the API refuses to start without a strong `JWT_SECRET` (32+ characters), and hides internal error messages
- The seed script refuses to run in production unless `ALLOW_DESTRUCTIVE_SEED=true` (it deletes all data)

## 🚧 Future Enhancements

### Backend
- [x] Strategy execution engine (auto-betting)
- [x] Simulation/backtesting service
- [ ] CSV import for race data
- [ ] Real-time odds updates
- [ ] WebSocket for live race updates
- [ ] Email notifications
- [ ] Advanced analytics & reporting
- [ ] Machine learning for predictions

### Frontend
- [ ] shadcn/ui component library integration
- [ ] Advanced charts with Recharts
- [ ] Real-time updates with WebSockets
- [ ] Mobile-responsive improvements
- [ ] Dark mode
- [ ] Strategy builder UI
- [x] Simulation interface
- [ ] Export data to CSV/PDF

### Features
- [ ] Multiple bet types (Couple, Trio, Quinté)
- [ ] Live race tracking
- [ ] Social features (share predictions)
- [ ] Leaderboard
- [ ] Premium subscription tiers
- [ ] External API integration (PMU, Equidia)

## 📝 Development Notes

### Running Migrations

```bash
cd backend
npm run migrate
```

### Running Tests

```bash
cd backend
npm run typecheck          # sources and tests
npm test                   # unit tests (no database needed)

# Integration tests run against a dedicated database (default: horse_racing_test,
# override with TEST_DB_DATABASE). They wipe it, and refuse any database whose name
# does not contain "test".
createdb -h localhost -U postgres horse_racing_test
npm run test:integration
```

Frontend: `cd frontend && npm run lint && npm run build`.

CI (`.github/workflows/ci.yml`) runs all of this on every pull request, plus the Docker image builds.

### Re-seeding Database

```bash
cd backend
npm run seed
```

### Building for Production

Backend:
```bash
cd backend
npm run build
NODE_ENV=production JWT_SECRET=<32+ random chars> npm run migrate:prod
NODE_ENV=production JWT_SECRET=<32+ random chars> npm start
```

Frontend:
```bash
cd frontend
VITE_API_URL=https://api.example.com/api npm run build
# Serve the 'dist' folder with your preferred static server (SPA fallback to index.html)
```

### Running the Full Stack with Docker

```bash
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d --build
# Optional demo data (deletes everything in the database):
docker compose exec -e ALLOW_DESTRUCTIVE_SEED=true backend node build/database/seed.js
```

- Frontend: http://localhost:8080 — API: http://localhost:3333
- The backend applies the migration at startup and refuses to start without `JWT_SECRET`
- `VITE_API_URL` (build argument) and `CORS_ORIGIN` must match the public URLs when deploying elsewhere
- Behind a reverse proxy, set `TRUST_PROXY=1` so rate limiting sees the real client IPs

## 🐛 Troubleshooting

### Database Connection Issues
- Ensure Docker is running
- Check PostgreSQL is accessible on port 5432
- Verify .env database credentials

### Frontend Can't Connect to Backend
- Check backend is running on port 3333
- Verify VITE_API_URL in frontend/.env
- Check CORS settings in backend

### Migration Errors
- Ensure database is running
- Check database connection in .env
- Try dropping and recreating the database:
  ```bash
  docker compose down -v
  docker compose up -d postgres
  npm run migrate
  npm run seed
  ```

## 📄 License

This project is created for educational and demonstration purposes.

## 👨‍💻 Author

Created as a comprehensive full-stack horse racing prediction platform demonstration.

---

**Note**: This is a simulation platform for educational purposes. No real money betting is involved.
