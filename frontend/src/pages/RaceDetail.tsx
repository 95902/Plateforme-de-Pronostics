import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { racesAPI, predictionsAPI } from '../lib/api';

export default function RaceDetail() {
  const { id } = useParams();
  const [race, setRace] = useState<any>(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRaceDetails();
  }, [id]);

  const fetchRaceDetails = async () => {
    try {
      const [raceRes, predRes] = await Promise.all([
        racesAPI.getRaceById(parseInt(id!)),
        predictionsAPI.getRacePredictions(parseInt(id!)),
      ]);
      setRace(raceRes.data);
      setPredictions(predRes.data.predictions || []);
    } catch (error) {
      console.error('Error fetching race details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading race details...</div>;
  }

  if (!race) {
    return <div className="text-center py-12">Race not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Race Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{race.name}</h1>
            <p className="text-gray-600 mt-2">
              {race.hippodrome_name} • {race.city}, {race.country}
            </p>
            <div className="flex items-center gap-6 mt-4 text-sm">
              <span className="flex items-center gap-2">
                📅 {new Date(race.date).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-2">
                ⏰ {race.time}
              </span>
              <span className="flex items-center gap-2">
                📏 {race.distance}m
              </span>
              <span className="flex items-center gap-2">
                💰 {race.prize_money?.toFixed(0)}€
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
              race.status === 'scheduled'
                ? 'bg-green-100 text-green-800'
                : race.status === 'finished'
                ? 'bg-gray-100 text-gray-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {race.status}
            </span>
            <div className="mt-2 text-sm text-gray-600">
              {race.track_type} • {race.surface}
            </div>
          </div>
        </div>
      </div>

      {/* Predictions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">AI Predictions</h2>
          <p className="text-sm text-gray-600 mt-1">
            Based on historical data, form, and conditions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Horse
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Odds
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.map((pred: any, index: number) => (
                <tr key={pred.runner_id} className={index < 3 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-bold ${index < 3 ? 'text-yellow-600' : 'text-gray-600'}`}>
                      #{index + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {pred.saddle_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{pred.horse_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pred.odds?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${pred.prediction_score}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {pred.prediction_score.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      pred.confidence_level === 'High'
                        ? 'bg-green-100 text-green-800'
                        : pred.confidence_level === 'Medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {pred.confidence_level}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {pred.is_value_bet ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        ✓ Value
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Runners List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">All Runners</h2>
        </div>
        <div className="divide-y">
          {race.runners?.map((runner: any) => (
            <div key={runner.id} className="p-6 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-700">
                      {runner.saddle_number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{runner.horse_name}</h3>
                      <p className="text-sm text-gray-600">
                        {runner.jockey_name} • {runner.trainer_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    <span>Age: {runner.horse_age}</span>
                    <span>Weight: {runner.weight_carried}kg</span>
                    {runner.final_odds && <span>Odds: {runner.final_odds.toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
