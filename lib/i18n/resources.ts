import enCommon from "@/locales/en/common.json";
import enNav from "@/locales/en/nav.json";
import enAdmin from "@/locales/en/admin.json";
import enBuilds from "@/locales/en/builds.json";
import enClans from "@/locales/en/clans.json";
import enFeed from "@/locales/en/feed.json";
import enGroups from "@/locales/en/groups.json";
import enLibrary from "@/locales/en/library.json";
import enResearch from "@/locales/en/research.json";
import enRideshare from "@/locales/en/rideshare.json";
import enShared from "@/locales/en/shared.json";
import enSite from "@/locales/en/site.json";
import enUserBuilds from "@/locales/en/user-builds.json";
import enV from "@/locales/en/v.json";
import zhCommon from "@/locales/zh/common.json";
import zhNav from "@/locales/zh/nav.json";
import zhAdmin from "@/locales/zh/admin.json";
import zhBuilds from "@/locales/zh/builds.json";
import zhClans from "@/locales/zh/clans.json";
import zhFeed from "@/locales/zh/feed.json";
import zhGroups from "@/locales/zh/groups.json";
import zhLibrary from "@/locales/zh/library.json";
import zhResearch from "@/locales/zh/research.json";
import zhRideshare from "@/locales/zh/rideshare.json";
import zhShared from "@/locales/zh/shared.json";
import zhSite from "@/locales/zh/site.json";
import zhUserBuilds from "@/locales/zh/user-builds.json";
import zhV from "@/locales/zh/v.json";
import arCommon from "@/locales/ar/common.json";
import arNav from "@/locales/ar/nav.json";
import arAdmin from "@/locales/ar/admin.json";
import arBuilds from "@/locales/ar/builds.json";
import arClans from "@/locales/ar/clans.json";
import arFeed from "@/locales/ar/feed.json";
import arGroups from "@/locales/ar/groups.json";
import arLibrary from "@/locales/ar/library.json";
import arResearch from "@/locales/ar/research.json";
import arRideshare from "@/locales/ar/rideshare.json";
import arShared from "@/locales/ar/shared.json";
import arSite from "@/locales/ar/site.json";
import arUserBuilds from "@/locales/ar/user-builds.json";
import arV from "@/locales/ar/v.json";

export const RESOURCES = {
  en: { "common": enCommon, "nav": enNav, "admin": enAdmin, "builds": enBuilds, "clans": enClans, "feed": enFeed, "groups": enGroups, "library": enLibrary, "research": enResearch, "rideshare": enRideshare, "shared": enShared, "site": enSite, "user-builds": enUserBuilds, "v": enV },
  zh: { "common": zhCommon, "nav": zhNav, "admin": zhAdmin, "builds": zhBuilds, "clans": zhClans, "feed": zhFeed, "groups": zhGroups, "library": zhLibrary, "research": zhResearch, "rideshare": zhRideshare, "shared": zhShared, "site": zhSite, "user-builds": zhUserBuilds, "v": zhV },
  ar: { "common": arCommon, "nav": arNav, "admin": arAdmin, "builds": arBuilds, "clans": arClans, "feed": arFeed, "groups": arGroups, "library": arLibrary, "research": arResearch, "rideshare": arRideshare, "shared": arShared, "site": arSite, "user-builds": arUserBuilds, "v": arV },
} as const;
