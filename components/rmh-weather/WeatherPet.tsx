import React from 'react';

const petStates = {
  sunny: { mood: 'happy', emoji: '🐶😃' },
  rainy: { mood: 'grumpy', emoji: '🐶😒' },
  snowy: { mood: 'excited', emoji: '🐶😆' },
  cloudy: { mood: 'sleepy', emoji: '🐶😴' },
  stormy: { mood: 'scared', emoji: '🐶😱' },
  default: { mood: 'curious', emoji: '🐶🤔' },
};

export const WeatherPet = ({ condition }: { condition: string }) => {
  const pet = petStates[condition] || petStates.default;
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-green-400 mb-2">Virtual Pet Reacts to Weather</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex items-center">
        <span className="text-4xl mr-4">{pet.emoji}</span>
        <span className="text-lg">Pet is {pet.mood} today!</span>
      </div>
    </div>
  );
};
