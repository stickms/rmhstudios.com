import React, { useState } from 'react';
import { useTranslation } from "react-i18next";

export const ModelDataToggle = () => {
  const { t } = useTranslation("c-rmh-weather");
  const [model, setModel] = useState('GFS');
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-gray-400 mb-2">{t("model-data-toggle", { defaultValue: "Model Data Toggle" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex gap-4">
        <button className={`px-4 py-2 rounded ${model==='GFS'?'bg-blue-500 text-white':'bg-white text-blue-500'}`} onClick={()=>setModel('GFS')}>GFS</button>
        <button className={`px-4 py-2 rounded ${model==='ECMWF'?'bg-green-500 text-white':'bg-white text-green-500'}`} onClick={()=>setModel('ECMWF')}>ECMWF</button>
        <button className={`px-4 py-2 rounded ${model==='NAM'?'bg-purple-500 text-white':'bg-white text-purple-500'}`} onClick={()=>setModel('NAM')}>NAM</button>
      </div>
      <div className="mt-4 text-xs text-gray-500">{t("model-data-toggle-demo", { defaultValue: "Demo: Toggle between weather models (mock data)." })}</div>
    </div>
  );
};
