import React from 'react';

const fortunes = [
  'You will find sunshine in unexpected places.',
  'Rain brings renewal—embrace it!',
  'Windy days blow away worries.',
  'Clouds are just the sky’s way of hugging you.',
  'Snow means a fresh start is coming.',
];

export const WeatherFortuneCookie = () => {
  const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-yellow-400 mb-2">Weather Fortune Cookie</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {fortune}
      </div>
    </div>
  );
};
