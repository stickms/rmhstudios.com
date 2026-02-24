import React from 'react';

const historyFacts = [
  'On this day in 1972, record snowfall hit New York.',
  'On this day in 2003, a heatwave swept across Europe.',
  'On this day in 1985, the coldest temperature ever recorded in Florida.',
  'On this day in 2010, heavy rains caused flooding in Australia.',
  'On this day in 1999, a tornado struck Oklahoma.',
];

export const WeatherHistoryFact = () => {
  const fact = historyFacts[Math.floor(Math.random() * historyFacts.length)];
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-indigo-400 mb-2">On This Day in Weather History</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {fact}
      </div>
    </div>
  );
};
