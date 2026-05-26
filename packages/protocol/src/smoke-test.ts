import { clampLightingState, presetLibrary, rendererHtml, stateFromPreset } from "./index";

for (const preset of presetLibrary) {
  const state = stateFromPreset(preset.value);
  if (!state) throw new Error(`Could not create state for ${preset.value}`);
  const clamped = clampLightingState(state);
  rendererHtml(clamped);
}

console.log("Protocol smoke test passed");
