import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { racesAPI, bankrollAPI } from '../lib/api';

export default function Dashboard({ user }: { user: any }) {
  const [upcomingRaces, setUpcomingRaces] = useState([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [racesRes, statsRes] = await Promise.all([
        racesAPI.getUpcoming(5),
        bankrollAPI.getStatistics(),
      ]);
      setUpcomingRaces(racesRes.data);
      setStatistics(statsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back, {user?.username}!</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Current Bankroll</div>
          <div className="text-2xl font-bold text-green-600 mt-2">
            {statistics?.current_bankroll?.toFixed(2) || '0.00'}€
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Bets</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">
            {statistics?.total_bets || 0}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Win Rate</div>
          <div className="text-2xl font-bold text-purple-600 mt-2">
            {statistics?.win_rate?.toFixed(1) || '0.0'}%
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Net Profit</div>
          <div className={`text-2xl font-bold mt-2 ${(statistics?.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(statistics?.net_profit || 0) >= 0 ? '+' : ''}{statistics?.net_profit?.toFixed(2) || '0.00'}€
          </div>
        </div>
      </div>

      {/* Upcoming Races */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">Upcoming Races</h2>
            <Link to="/races" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              View All →
            </Link>
          </div>
        </div>
        <div className="divide-y">
          {upcomingRaces.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No upcoming races</div>
          ) : (
            upcomingRaces.map((race: any) => (
              <Link
                key={race.id}
                to={`/races/${race.id}`}
                className="block p-6 hover:bg-gray-50 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{race.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {race.hippodrome_name} • {race.city}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>📅 {new Date(race.date).toLocaleDateString()}</span>
                      <span>⏰ {race.time}</span>
                      <span>📏 {race.distance}m</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    {race.race_type}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
