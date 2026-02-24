import React from 'react';

const cities = [
  { name: 'Reykjavik', temp: -2 },
  { name: 'Dubai', temp: 38 },
  { name: 'London', temp: 8 },
  { name: 'Sydney', temp: 22 },
  { name: 'Moscow', temp: -10 },
];

export const ItCouldBeWorse = ({ currentTemp }: { currentTemp: number }) => {
  const worse = cities.find(c => c.temp < currentTemp) || cities.find(c => c.temp > currentTemp);
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-red-400 mb-2">It Could Be Worse</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {worse ? `At least it's not ${worse.temp}°C in ${worse.name}!` : 'You have the best weather today!'}
      </div>
    </div>
  );
};
