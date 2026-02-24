import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';

const moodMap = {
  sunny: '😎',
  cloudy: '😐',
  rainy: '🌧️',
  snowy: '☃️',
  stormy: '😱',
  default: '🌤️',
};

export const WeatherMoodEmoji = ({ condition }: { condition: string }) => {
  const emoji = moodMap[condition as keyof typeof moodMap] || moodMap.default;
  return (
    <div className="my-8 flex items-center">
      <span className="text-5xl mr-4">{emoji}</span>
      <span className="text-lg font-semibold">Today's Weather Mood</span>
    </div>
  );
};
