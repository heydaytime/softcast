import { clampLightingState, defaultLightingState, hsvToCssColor, hsvToRgb, kelvinToCssColor, lightingCssColor, rendererHtml } from "./index";

const clamped = clampLightingState({ temperature: 12000, brightness: -1 });
if (clamped.temperature !== 10000) throw new Error("Temperature did not clamp to maximum");
if (clamped.brightness !== 0) throw new Error("Brightness did not clamp to minimum");
if (clamped.mode !== "cct") throw new Error("Mode did not default to cct");

const fallback = clampLightingState({});
if (fallback.temperature !== defaultLightingState.temperature) throw new Error("Temperature fallback failed");
if (fallback.brightness !== defaultLightingState.brightness) throw new Error("Brightness fallback failed");
if (fallback.hue !== defaultLightingState.hue || fallback.saturation !== defaultLightingState.saturation) throw new Error("Color fallback failed");

const color = clampLightingState({ mode: "color", hue: 540, saturation: 2, brightness: 0.5 });
if (color.mode !== "color") throw new Error("Color mode not preserved");
if (color.hue !== 360) throw new Error("Hue did not clamp to maximum");
if (color.saturation !== 1) throw new Error("Saturation did not clamp to maximum");

const red = hsvToRgb(0, 1, 1);
if (red.r !== 255 || red.g !== 0 || red.b !== 0) throw new Error("HSV red conversion failed");

if (!kelvinToCssColor(2500).startsWith("rgb(")) throw new Error("Kelvin color conversion failed");
if (!hsvToCssColor(120, 1).startsWith("rgb(")) throw new Error("HSV color conversion failed");
if (lightingCssColor({ mode: "color", temperature: 2500, hue: 0, saturation: 1, brightness: 1 }) !== "rgb(255, 0, 0)") throw new Error("lightingCssColor color path failed");
if (!rendererHtml(defaultLightingState).includes("softcast-light")) throw new Error("Renderer HTML was not generated");
if (!rendererHtml(defaultLightingState).includes("function hsv")) throw new Error("Renderer HTML missing color support");

console.log("Protocol smoke test passed");
