import enCommon from "@/locales/en/common.json";
import enNav from "@/locales/en/nav.json";
import zhCommon from "@/locales/zh/common.json";
import zhNav from "@/locales/zh/nav.json";
import arCommon from "@/locales/ar/common.json";
import arNav from "@/locales/ar/nav.json";

export const RESOURCES = {
  en: { common: enCommon, nav: enNav },
  zh: { common: zhCommon, nav: zhNav },
  ar: { common: arCommon, nav: arNav },
} as const;
