import React from 'react';

const recipes = [
  'A great soup day! Try a hearty vegetable soup.',
  'Perfect for iced tea and salads.',
  'How about a warm chili for a rainy day?',
  'Sunny? Fire up the grill for BBQ!',
  'Cold? Bake some cookies and enjoy indoors.',
];

export const WeatherRecipeSuggestion = ({ condition }: { condition: string }) => {
  let suggestion = recipes[0];
  if (condition === 'sunny') suggestion = recipes[3];
  else if (condition === 'rainy') suggestion = recipes[2];
  else if (condition === 'cloudy') suggestion = recipes[1];
  else if (condition === 'snowy') suggestion = recipes[4];

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-orange-400 mb-2">Weather-Inspired Recipe Suggestion</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {suggestion}
      </div>
    </div>
  );
};
