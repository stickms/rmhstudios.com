import React, { useState } from 'react';

export const ComplainOMeter = ({ temp, condition }: { temp: number; condition: string }) => {
  const [score, setScore] = useState(5);

  const getLabel = (score: number) => {
    if (score <= 2) return 'Not bad at all!';
    if (score <= 5) return 'Meh, could be better.';
    if (score <= 8) return 'Pretty annoying.';
    return 'Absolutely miserable!';
  };

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-pink-400 mb-2">Complain-o-meter</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="mb-2">Rate how bad today's weather is:</div>
        <input type="range" min={1} max={10} value={score} onChange={e => setScore(Number(e.target.value))} />
        <div className="mt-2 font-bold">{score}/10</div>
        <div className="mt-1 text-sm">{getLabel(score)}</div>
      </div>
    </div>
  );
};
