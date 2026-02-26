import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ExportWeatherData = ({ data }: { data: any }) => {
  const exportCSV = () => {
    const rows = [Object.keys(data.current).join(','), Object.values(data.current).join(',')];
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weather.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weather.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">Export Weather Data</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex flex-col gap-3">
        <p className="text-xs text-weather-muted">Download current weather data for this location.</p>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex-1 px-4 py-2 rounded-xl bg-blue-500/80 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={exportJSON}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
          >
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
};
