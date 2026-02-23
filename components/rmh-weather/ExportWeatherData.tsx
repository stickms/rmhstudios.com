import React from 'react';

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
    <div className="my-8">
      <div className="text-lg font-semibold text-gray-400 mb-2">Export Weather Data</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex gap-4">
        <button className="px-4 py-2 rounded bg-blue-500 text-white" onClick={exportCSV}>Export CSV</button>
        <button className="px-4 py-2 rounded bg-green-500 text-white" onClick={exportJSON}>Export JSON</button>
      </div>
    </div>
  );
};
