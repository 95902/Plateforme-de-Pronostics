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

### Frontend
- **React** with **TypeScript**
- **Vite** for build tooling
- **React Router** for navigation
- **Axios** for API calls
- **Tailwind CSS** for styling
- **Recharts** for data visualization

### Infrastructure
- **Docker** & **Docker Compose** for database
- **Redis** for caching (optional)

## 📦 Project Structure

```
Plateforme-de-Pronostics/
├── backend/
│   ├── src/
│   │   ├── config/          # Database & app configuration
│   │   ├── controllers/     # Route controllers
│   │   ├── database/        # Migrations & seeders
│   │   ├── middleware/      # Auth & other middleware
│   │   ├── models/          # (Future) ORM models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── types/           # TypeScript interfaces
│   │   ├── utils/           # Utility functions
│   │   └── server.ts        # Main server file
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── lib/             # API client & utilities
│   │   ├── pages/           # Page components
│   │   ├── App.tsx          # Main app component
│   │   └── main.tsx         # Entry point
│   ├── .env.example
│   └── package.json
├── docker-compose.yml       # Docker services
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
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

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
- **Password**: `Admin123!`

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
- Value bet detection (Expected Value > 0)
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
- **CUSTOM**: Custom strategy rules

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
- **~500 historical races** (6 months of data)
- **~50 upcoming races** (next 7 days)
- **1 demo user** with initial bankroll
- **1 admin user**
- **2 demo strategies** (Favorite & Value Betting)

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected API routes
- Input validation on all endpoints
- SQL injection prevention (parameterized queries)
- CORS configuration
- Rate limiting ready (implementation pending)

## 🚧 Future Enhancements

### Backend
- [ ] Strategy execution engine (auto-betting)
- [ ] Simulation/backtesting service
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
- [ ] Simulation interface
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
npm test
```

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
npm start
```

Frontend:
```bash
cd frontend
npm run build
# Serve the 'dist' folder with your preferred static server
```

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
  docker compose up -d
  npm run migrate
  npm run seed
  ```

## 📄 License

This project is created for educational and demonstration purposes.

## 👨‍💻 Author

Created as a comprehensive full-stack horse racing prediction platform demonstration.

---

**Note**: This is a simulation platform for educational purposes. No real money betting is involved.
