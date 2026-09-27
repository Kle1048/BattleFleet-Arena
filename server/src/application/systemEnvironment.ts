import type { SimulationEnvironment } from "../simulation/SimulationEnvironment.js";

/** Production defaults stay at the application boundary; tests inject their own clock/RNG. */
export const systemEnvironment: SimulationEnvironment = {
  nowMs: () => Date.now(),
  random: () => Math.random(),
};
