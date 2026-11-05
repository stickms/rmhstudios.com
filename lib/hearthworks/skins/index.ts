export * from './catalog';
export * from './looks';
export * from './figure-scale';
export * from './model-manifest';
export * from './figure-budget';
export * from './motion-estimator';
// animator, figure-registry and model-loader import three.js: import them by path, never through this barrel
// (the world and the net layer import the barrel, and must stay free of the renderer).
