/** Extracts t("...") keys from the app into locales/<lng>/<ns>.json. */
export default {
  locales: ["en", "zh", "ar"],
  defaultNamespace: "common",
  namespaceSeparator: ":",
  keySeparator: false,
  input: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  output: "locales/$LOCALE/$NAMESPACE.json",
  sort: true,
  keepRemoved: false,
  createOldCatalogs: false,
  // Do not overwrite existing translated values with the key/default.
  resetDefaultValueLocale: "en",
};
