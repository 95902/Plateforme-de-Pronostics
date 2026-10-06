import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { racesAPI } from '../lib/api';
import type { RaceSummary } from '../lib/types';

export default function Races() {
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchRaces = useCallback(async () => {
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await racesAPI.getRaces(params);
      setRaces(response.data.data);
    } catch (error) {
      console.error('Error fetching races:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);

  const changeFilter = (newFilter: string) => {
    setLoading(true);
    setFilter(newFilter);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Races</h1>
        <div className="flex gap-2">
          <button
            onClick={() => changeFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border'
            }`}
          >
            All
          </button>
          <button
            onClick={() => changeFilter('scheduled')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'scheduled'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => changeFilter('finished')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'finished'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border'
            }`}
          >
            Finished
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading races...</div>
      ) : (
        <div className="grid gap-4">
          {races.map((race) => (
            <Link
              key={race.id}
              to={`/races/${race.id}`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg text-gray-900">{race.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      race.status === 'scheduled'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {race.status}
                    </span>
                  </div>
                  <p className="text-gray-600 mt-1">
                    {race.hippodrome_name} • {race.city}, {race.country}
                  </p>
                  <div className="flex items-center gap-6 mt-3 text-sm text-gray-500">
                    <span>📅 {new Date(race.date).toLocaleDateString()}</span>
                    <span>⏰ {race.time}</span>
                    <span>📏 {race.distance}m</span>
                    <span>🏁 Race #{race.race_number}</span>
                    {race.prize_money && <span>💰 {race.prize_money}€</span>}
                  </div>
                </div>
                <span className="px-4 py-2 bg-blue-50 text-blue-700 rounded-md text-sm font-medium">
                  {race.track_type}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
