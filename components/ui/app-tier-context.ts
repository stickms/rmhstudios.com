import { createContext, useContext } from 'react';

/**
 * Is the page on screen a full-screen game/app route (the `html.app-route` flag)? `Providers` provides the same flag
 * it stamps on `<html>`, so shared primitives can pick the app tier's look without reading the router. The games and
 * apps keep their own design scheme (e.g. `LiquidTabs` keeps its raised thumb there); the main site gets the flat
 * jelly-group look. Default `false`: outside `Providers` (tests, previews) a primitive renders as the main site does.
 */
export const AppTierContext = createContext(false);

export const useIsAppTier = (): boolean => useContext(AppTierContext);
