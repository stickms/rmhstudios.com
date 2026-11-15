// A bare metronome. Browsers throttle main-thread timers in a hidden tab to
// about 1 Hz, but not messages from a worker, so the host's simulation is driven
// by these ticks and keeps stepping (and feeding the guests) when its tab is in
// the background. The page, not the worker, owns all game state.
const ctx =
  self as unknown as {
    postMessage: (
      m: number,
    ) => void;
  };
setInterval(
  () =>
    ctx.postMessage(
      0,
    ),
  1000 /
    60,
);
