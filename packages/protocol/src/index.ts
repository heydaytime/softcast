import { z } from "zod";

const lightingModeValues = ["studio", "ambient", "creative", "dynamic", "scenes"] as const;
const renderEngineValues = ["solid", "gradient", "radial", "edge", "flow", "sweep", "pulse", "flicker", "fire", "particles"] as const;
const rgbDirectionValues = ["right", "left", "down", "up"] as const;
const paletteNameValues = ["custom", "warm", "cool", "rainbow", "candy", "pastel", "gold", "rose", "mono", "ember", "sky", "aurora"] as const;
const lightingControlValues = ["speed", "intensity", "spread", "softness", "temperature", "palette", "colors", "direction", "colorCount"] as const;
const lightingPresetValues = [
  "softbox", "beauty", "desk-fill", "product-light",
  "paper-lantern", "moonlight", "neon-edge", "aurora",
  "solid", "two-tone", "gradient", "vignette",
  "flow", "sweep", "breathe",
  "candle", "fireplace", "stars"
] as const;

export const LightingModeSchema = z.enum(lightingModeValues);
export const RenderEngineSchema = z.enum(renderEngineValues);
export const RgbDirectionSchema = z.enum(rgbDirectionValues);
export const PaletteNameSchema = z.enum(paletteNameValues);
export const LightingControlSchema = z.enum(lightingControlValues);
export const LightingPresetSchema = z.enum(lightingPresetValues);
export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export type LightingMode = z.infer<typeof LightingModeSchema>;
export type RenderEngine = z.infer<typeof RenderEngineSchema>;
export type RgbDirection = z.infer<typeof RgbDirectionSchema>;
export type PaletteName = z.infer<typeof PaletteNameSchema>;
export type LightingControl = z.infer<typeof LightingControlSchema>;
export type LightingPreset = z.infer<typeof LightingPresetSchema>;

export const LightingStateSchema = z.object({
  mode: LightingModeSchema,
  preset: LightingPresetSchema,
  palette: PaletteNameSchema,
  colors: z.array(ColorSchema),
  brightness: z.number().finite().min(0).max(1),
  speed: z.number().finite().min(0).max(1),
  intensity: z.number().finite().min(0).max(1),
  spread: z.number().finite().min(0).max(1),
  softness: z.number().finite().min(0).max(1),
  temperature: z.number().finite().min(1800).max(10000),
  rgbDirection: RgbDirectionSchema,
  colorCount: z.number().int().min(1).max(6)
});

export type LightingState = z.infer<typeof LightingStateSchema>;

export type PresetMeta = {
  value: LightingPreset;
  label: string;
  mode: LightingMode;
  engine: RenderEngine;
  palette: PaletteName;
  colors: string[];
  controls: LightingControl[];
  colorSlots: number;
  description: string;
};

export type PaletteMeta = {
  value: PaletteName;
  label: string;
  colors: string[];
};

export type SessionTarget = {
  sessionId: string;
  subSessionId?: string;
};

export type RedeemedCode = SessionTarget & {
  sessionUrl: string;
  screenUrl?: string;
};

export type Sequenced = { seq: number };

export type StoredLightingState = {
  revision: number;
  state: LightingState;
};

export type ClientMessage =
  | { type: "subscribe"; target: SessionTarget }
  | { type: "admin:update"; target: SessionTarget; state: LightingState };

export type ServerMessage = Sequenced & (
  | { type: "state"; target: SessionTarget; revision: number; state: LightingState }
  | { type: "subsessions"; sessionId: string; subSessionIds: string[] }
  | { type: "error"; message: string }
);

type CssVars = {
  dim: () => string;
  speed: () => string;
  intensity: () => string;
  spread: () => string;
  soft: () => string;
  blur: () => string;
  temperature: () => string;
  angle: () => string;
  color: (index: number) => string;
  gradient: () => string;
};

type EngineDefinition = {
  controls: LightingControl[];
  colorSlots: number;
  css: (vars: CssVars) => string;
};

type TrackedCssVars = CssVars & { usedControls: Set<LightingControl> };

const controlDependencies: Record<LightingControl, LightingControl[]> = {
  speed: ["speed"],
  intensity: ["intensity"],
  spread: ["spread"],
  softness: ["softness"],
  temperature: ["temperature"],
  palette: ["colors"],
  colors: ["colors"],
  direction: ["direction"],
  colorCount: ["colorCount", "colors"]
};

export const palettes: PaletteMeta[] = [
  { value: "custom", label: "Custom", colors: ["#ffffff", "#ff7a18", "#7c3aed"] },
  { value: "warm", label: "Warm", colors: ["#fff0c2", "#ffb35c", "#ff6a2a"] },
  { value: "cool", label: "Cool", colors: ["#e9fbff", "#7dd3fc", "#2563eb"] },
  { value: "rainbow", label: "Spectrum", colors: ["#ff0040", "#ff9f00", "#fff200", "#00ff66", "#00b7ff", "#7c3aed"] },
  { value: "candy", label: "Candy", colors: ["#ff4ecd", "#7dd3fc", "#fef08a", "#ffffff"] },
  { value: "pastel", label: "Pastel", colors: ["#ffd6e7", "#d9f99d", "#bfdbfe", "#fde68a"] },
  { value: "gold", label: "Gold", colors: ["#fff7ad", "#fbbf24", "#92400e"] },
  { value: "rose", label: "Rose", colors: ["#fff1f2", "#fb7185", "#be123c"] },
  { value: "mono", label: "Mono", colors: ["#ffffff", "#8a8a8e", "#050505"] },
  { value: "ember", label: "Ember", colors: ["#160400", "#ff3008", "#ff9d2e", "#fff0b3"] },
  { value: "sky", label: "Sky", colors: ["#020617", "#93c5fd", "#ffffff"] },
  { value: "aurora", label: "Aurora", colors: ["#07111f", "#22c55e", "#06b6d4", "#a855f7"] }
];

const c = {
  white: ["#ffffff"],
  softbox: ["#fff4df"],
  beauty: ["#fff0e6", "#ffe3f0"],
  desk: ["#f8fbff", "#dbeafe"],
  product: ["#ffffff", "#eef2ff"],
  lantern: ["#ffeac7", "#ffb86b"],
  moon: ["#06111f", "#9cc9ff", "#f4f8ff"],
  neon: ["#050505", "#00e5ff", "#ff2bd6"],
  fire: ["#120000", "#ff2d00", "#ff8a00", "#fff1a8"],
  stars: ["#020617", "#ffffff", "#93c5fd"]
};

const engineSchemas = {
  solid: defineEngine({
    controls: ["colors", "temperature"],
    colorSlots: 1,
    css: (v) => `.sc-engine-solid{background:${v.color(0)}}.sc-temp.sc-engine-solid{background:${v.temperature()}}`
  }),
  gradient: defineEngine({
    controls: ["colors", "spread", "softness", "temperature"],
    colorSlots: 3,
    css: (v) => `.sc-engine-gradient{background:linear-gradient(135deg,${v.color(0)},${v.color(1)},${v.color(2)})}.sc-temp.sc-engine-gradient{background:linear-gradient(135deg,${v.temperature()},${v.color(1)},${v.color(2)})}.sc-engine-gradient .sc-a,.sc-engine-gradient .sc-b{opacity:.34;filter:blur(${v.blur()})}.sc-engine-gradient .sc-a{background:radial-gradient(circle at 34% 30%,${v.color(0)},transparent ${v.spread()})}.sc-engine-gradient .sc-b{background:radial-gradient(circle at 70% 64%,${v.color(1)},transparent ${v.soft()})}`
  }),
  radial: defineEngine({
    controls: ["colors", "spread", "softness", "temperature"],
    colorSlots: 2,
    css: (v) => `.sc-engine-radial{background:radial-gradient(circle at 50% 48%,${v.color(0)},${v.color(1)} ${v.spread()},#050505)}.sc-temp.sc-engine-radial{background:radial-gradient(circle at 50% 48%,${v.temperature()},${v.color(1)} ${v.spread()},#050505)}.sc-engine-radial .sc-a{opacity:.55;background:radial-gradient(circle at 34% 30%,${v.color(0)},transparent ${v.spread()});filter:blur(${v.blur()})}`
  }),
  edge: defineEngine({
    controls: ["colors", "softness", "temperature"],
    colorSlots: 2,
    css: (v) => `.sc-engine-edge{background:#050505}.sc-engine-edge .sc-a{opacity:1;inset:-25%;background:radial-gradient(circle at 50% 50%,transparent 0 38%,${v.color(1)} 66%,${v.color(0)} 100%);filter:blur(calc(${v.blur()}*.45))}.sc-temp.sc-engine-edge .sc-a{background:radial-gradient(circle at 50% 50%,transparent 0 38%,${v.color(1)} 66%,${v.temperature()} 100%)}`
  }),
  flow: defineEngine({
    controls: ["speed", "palette", "colors", "direction", "colorCount", "softness"],
    colorSlots: 6,
    css: (v) => `.sc-engine-flow{background:#02030a}.sc-engine-flow .sc-a{opacity:1;background:linear-gradient(${v.angle()},${v.gradient()});background-size:220% 220%;filter:blur(${v.blur()}) saturate(1.12);animation:sc-flow ${v.speed()} linear infinite}.sc-engine-flow.sc-dir-up .sc-a,.sc-engine-flow.sc-dir-down .sc-a{animation-name:sc-flow-y}`
  }),
  sweep: defineEngine({
    controls: ["speed", "colors", "direction", "softness"],
    colorSlots: 2,
    css: (v) => `.sc-engine-sweep{background:${v.color(0)}}.sc-engine-sweep .sc-a{opacity:.95;inset:-25%;background:linear-gradient(${v.angle()},transparent 0 34%,${v.color(1)} 50%,transparent 66% 100%);filter:blur(calc(${v.blur()}*.55));animation:sc-sweep-right ${v.speed()} linear infinite}.sc-engine-sweep.sc-dir-left .sc-a{animation-name:sc-sweep-left}.sc-engine-sweep.sc-dir-down .sc-a{animation-name:sc-sweep-down}.sc-engine-sweep.sc-dir-up .sc-a{animation-name:sc-sweep-up}`
  }),
  pulse: defineEngine({
    controls: ["speed", "colors"],
    colorSlots: 2,
    css: (v) => `.sc-engine-pulse{background:radial-gradient(circle at center,${v.color(0)},${v.color(1)},#030303)}.sc-engine-pulse .sc-a{opacity:.75;background:radial-gradient(circle at center,${v.color(1)},transparent 58%);animation:sc-pulse ${v.speed()} ease-in-out infinite}`
  }),
  flicker: defineEngine({
    controls: ["speed", "temperature"],
    colorSlots: 3,
    css: (v) => `.sc-engine-flicker{background:radial-gradient(circle at 50% 72%,${v.temperature()},${v.color(1)} 38%,#120400)}.sc-engine-flicker .sc-a{opacity:.72;background:radial-gradient(ellipse at 48% 76%,${v.color(2)},transparent 36%);filter:blur(28px);animation:sc-flicker ${v.speed()} steps(4,end) infinite}`
  }),
  fire: defineEngine({
    controls: ["speed", "intensity", "colors"],
    colorSlots: 4,
    css: (v) => `.sc-engine-fire{background:radial-gradient(circle at 50% 92%,${v.color(3)},${v.color(2)} 18%,${v.color(1)} 42%,${v.color(0)} 70%,#050000)}.sc-engine-fire .sc-a{opacity:calc(.28 + ${v.intensity()}*.58);background:radial-gradient(ellipse at 44% 72%,${v.color(2)},transparent 32%),radial-gradient(ellipse at 62% 82%,${v.color(1)},transparent 38%);filter:blur(22px);animation:sc-fire ${v.speed()} linear infinite}.sc-engine-fire .sc-b{opacity:calc(.18 + ${v.intensity()}*.55);background:radial-gradient(ellipse at 52% 92%,${v.color(3)},transparent 46%);filter:blur(36px);animation:sc-pulse calc(${v.speed()}*1.5) ease-in-out infinite}`
  }),
  particles: defineEngine({
    controls: [],
    colorSlots: 3,
    css: () => `.sc-engine-particles{background:radial-gradient(circle at 50% 60%,#081426,#020617 72%,#000)}.sc-stars{position:absolute;inset:0;z-index:12;overflow:hidden}.sc-star{position:absolute;border-radius:999px;background:#fff;box-shadow:0 0 10px #fff;animation:sc-twinkle ease-in-out infinite alternate}`
  })
} satisfies Record<RenderEngine, EngineDefinition>;

type RawPreset = Omit<PresetMeta, "colorSlots"> & { controls?: LightingControl[] };

const rawPresetLibrary = [
  p("softbox", "Softbox", "studio", "solid", "warm", c.softbox, ["temperature"], "Clean key light with adjustable warmth."),
  p("beauty", "Beauty", "studio", "radial", "rose", c.beauty, ["temperature", "softness", "spread"], "Soft face light with gentle falloff."),
  p("desk-fill", "Desk", "studio", "gradient", "cool", c.desk, ["temperature", "softness"], "Neutral fill for calls, monitors, and workspaces."),
  p("product-light", "Product", "studio", "edge", "mono", c.product, ["temperature", "softness"], "Crisp tabletop light for objects and detail."),

  p("paper-lantern", "Paper Lantern", "ambient", "radial", "warm", c.lantern, ["softness", "spread"], "Warm paper glow for a room."),
  p("moonlight", "Moonlight", "ambient", "gradient", "cool", c.moon, [], "Dim blue-white atmosphere."),
  p("neon-edge", "Neon", "ambient", "edge", "candy", c.neon, ["colors", "softness"], "Hard color rim with dark center."),
  p("aurora", "Aurora", "ambient", "flow", "aurora", paletteColors("aurora"), ["speed", "palette", "direction", "softness"], "Slow atmospheric color bands."),

  p("solid", "Solid", "creative", "solid", "custom", c.white, ["colors"], "One pure color field."),
  p("two-tone", "Two Tone", "creative", "gradient", "custom", ["#ff7a18", "#7c3aed"], ["colors"], "Two-color blend."),
  p("gradient", "Gradient", "creative", "gradient", "custom", ["#00d4ff", "#7c3aed", "#ff2bd6"], ["colors", "spread", "softness"], "Static multi-color wash."),
  p("vignette", "Vignette", "creative", "edge", "custom", ["#ffffff", "#111827"], ["colors"], "Edge-driven color source."),

  p("breathe", "Breathe", "dynamic", "pulse", "rose", ["#ff2d55", "#ffffff"], ["speed", "colors"], "Slow pulsing glow."),
  p("flow", "Flow", "dynamic", "flow", "rainbow", paletteColors("rainbow"), ["speed", "palette", "colors", "direction", "colorCount", "softness"], "Moving color bands."),
  p("sweep", "Sweep", "dynamic", "sweep", "custom", ["#050505", "#ffffff"], ["speed", "colors", "direction", "softness"], "A clean pass of light across the screen."),

  p("candle", "Candle", "scenes", "flicker", "warm", ["#2a0800", "#ffb86b", "#fff1c7"], ["speed", "temperature"], "Small warm flicker."),
  p("fireplace", "Fireplace", "scenes", "fire", "ember", c.fire, ["speed", "intensity", "colors"], "Deep flame and ember movement."),
  p("stars", "Stars", "scenes", "particles", "sky", c.stars, [], "A quiet field of twinkling stars.")
] satisfies RawPreset[];

export const presetLibrary: PresetMeta[] = rawPresetLibrary.map((preset) => ({
  ...preset,
  colors: normalizeColors(preset.colors, engineSchemas[preset.engine].colorSlots),
  controls: preset.controls || engineSchemas[preset.engine].controls,
  colorSlots: engineSchemas[preset.engine].colorSlots
}));

export const lightingModes: { value: LightingMode; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "ambient", label: "Ambient" },
  { value: "creative", label: "Creative" },
  { value: "dynamic", label: "Dynamic" },
  { value: "scenes", label: "Scenes" }
];

validateProtocolSchema();

export const defaultLightingState: LightingState = stateFromPreset("softbox")!;

export function stateFromPreset(preset: LightingPreset): LightingState | null {
  const meta = presetLibrary.find((item) => item.value === preset);
  if (!meta) return null;
  return LightingStateSchema.parse({
    mode: meta.mode,
    preset: meta.value,
    palette: meta.palette,
    colors: meta.colors,
    brightness: 1,
    speed: meta.engine === "flicker" || meta.engine === "fire" ? 0.35 : 0.5,
    intensity: meta.engine === "particles" ? 0.6 : 0.55,
    spread: meta.engine === "edge" ? 0.65 : 0.55,
    softness: meta.mode === "studio" || meta.mode === "ambient" ? 0.75 : 0.45,
    temperature: meta.value === "softbox" ? 4300 : meta.value === "candle" ? 2400 : meta.value === "paper-lantern" ? 3000 : meta.value === "moonlight" ? 6500 : 5600,
    rgbDirection: "right",
    colorCount: Math.min(6, Math.max(1, meta.colorSlots))
  });
}

export function clampLightingState(input: Partial<LightingState> | LightingState): LightingState {
  const preset = LightingPresetSchema.safeParse(input.preset).success ? input.preset as LightingPreset : defaultLightingState.preset;
  const meta = presetLibrary.find((item) => item.value === preset)!;
  const fallback = stateFromPreset(preset)!;
  const palette = meta.controls.includes("palette") && PaletteNameSchema.safeParse(input.palette).success ? input.palette as PaletteName : meta.palette;
  const paletteFallback = palettes.find((item) => item.value === palette)?.colors || meta.colors;
  const rawColors = Array.isArray(input.colors) && input.colors.length ? input.colors : paletteFallback;
  const colors = normalizeColors(rawColors.filter((color) => ColorSchema.safeParse(color).success), meta.colorSlots);
  return LightingStateSchema.parse({
    mode: meta.mode,
    preset,
    palette,
    colors,
    brightness: clamp01(input.brightness ?? fallback.brightness),
    speed: clamp01(input.speed ?? fallback.speed),
    intensity: clamp01(input.intensity ?? fallback.intensity),
    spread: clamp01(input.spread ?? fallback.spread),
    softness: clamp01(input.softness ?? fallback.softness),
    temperature: clampNumber(input.temperature ?? fallback.temperature, 1800, 10000),
    rgbDirection: RgbDirectionSchema.safeParse(input.rgbDirection).success ? input.rgbDirection : fallback.rgbDirection,
    colorCount: Math.round(clampNumber(input.colorCount ?? fallback.colorCount, 1, meta.colorSlots))
  });
}

export function rendererHtml(state: LightingState) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>${rendererCss()}</style></head><body><div id="root"></div><script>var PRESETS=${JSON.stringify(presetLibrary.map(({ value, engine, mode, palette, colors, controls, colorSlots }) => ({ value, engine, mode, palette, colors, controls, colorSlots })))};var state=${JSON.stringify(clampLightingState(state))};function meta(s){return PRESETS.find(function(p){return p.value===s.preset})||PRESETS[0]}function esc(v){return String(v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}function validColor(v){return typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)}function num(v,d,min,max){return typeof v==='number'&&isFinite(v)?Math.min(max,Math.max(min,v)):d}function fillColors(colors,count){var fallback=['#ffffff','#ff7a18','#7c3aed','#00ff66','#00b7ff','#fff200'];var out=[];for(var i=0;i<count;i++)out.push(colors[i]||fallback[i]||'#ffffff');return out}function clean(raw){var p=meta(raw||{});var colors=Array.isArray(raw.colors)?raw.colors.filter(validColor).slice(0,p.colorSlots):p.colors;return {mode:p.mode,preset:p.value,palette:p.palette,colors:fillColors(colors.length?colors:p.colors,p.colorSlots),brightness:num(raw.brightness,1,0,1),speed:num(raw.speed,.5,0,1),intensity:num(raw.intensity,.55,0,1),spread:num(raw.spread,.55,0,1),softness:num(raw.softness,.6,0,1),temperature:num(raw.temperature,5600,1800,10000),rgbDirection:['right','left','down','up'].includes(raw.rgbDirection)?raw.rgbDirection:'right',colorCount:Math.round(num(raw.colorCount,Math.max(2,p.colorSlots),2,p.colorSlots))}}function rand(seed,salt){var value=Math.sin(seed*999+salt*7919)*10000;return value-Math.floor(value)}function temp(k){return k<=2800?'#ffd6a0':k<=3600?'#ffe3bd':k<=4800?'#fff3df':k<=6000?'#f8fbff':'#e5f1ff'}function vars(s){var colors=fillColors(s.colors,s.colorCount);var speed=Math.max(.18,7.5-s.speed*7);var rgb=colors.slice(0,Math.max(2,Math.min(6,s.colorCount)));var doubled=rgb.concat(rgb,[rgb[0]]);var grad=doubled.map(function(c,i){return c+' '+i/(doubled.length-1)*100+'%'}).join(', ');var angle=s.rgbDirection==='left'?'270deg':s.rgbDirection==='down'?'180deg':s.rgbDirection==='up'?'0deg':'90deg';return '--sc-0:'+(colors[0]||'#fff')+';--sc-1:'+(colors[1]||colors[0]||'#fff')+';--sc-2:'+(colors[2]||colors[1]||colors[0]||'#fff')+';--sc-3:'+(colors[3]||colors[2]||colors[0]||'#fff')+';--sc-dim:'+(1-Math.max(0,Math.min(1,s.brightness)))+';--sc-speed:'+speed+'s;--sc-intensity:'+s.intensity+';--sc-spread:'+(20+s.spread*70)+'%;--sc-soft:'+(8+s.softness*44)+'%;--sc-blur:'+(8+s.softness*80)+'px;--sc-temp:'+temp(s.temperature)+';--sc-angle:'+angle+';--sc-gradient:'+grad+';'}function stars(s){if(meta(s).engine!=='particles')return '';var out='';for(var i=0;i<150;i++){var layer=rand(i,1);var size=layer<.33?.5+rand(i,2):layer<.66?1+rand(i,2)*1.5:2+rand(i,2)*2;var duration=layer<.33?20+rand(i,3)*15:layer<.66?12+rand(i,3)*8:6+rand(i,3)*5;var opacity=Math.min(1,.25+layer*.5);out+='<span class="sc-star" style="left:'+rand(i,5)*100+'%;top:'+rand(i,7)*100+'%;width:'+size+'px;height:'+size+'px;opacity:'+opacity+';animation-duration:'+duration+'s;animation-delay:'+rand(i,6)*-30+'s"></span>'}return '<div class="sc-stars">'+out+'</div>'}function render(){state=clean(state);var m=meta(state);var tempClass=m.controls.indexOf('temperature')>=0?' sc-temp':'';document.getElementById('root').innerHTML='<div class="softcast-render sc-engine-'+m.engine+tempClass+' sc-mode-'+esc(state.mode)+' sc-preset-'+esc(state.preset)+' sc-dir-'+esc(state.rgbDirection)+'" style="'+vars(state)+'"><div class="sc-layer sc-a"></div><div class="sc-layer sc-b"></div>'+stars(state)+'<div class="sc-layer sc-c"></div><div class="sc-dimmer"></div></div>'}window.addEventListener('message',function(event){if(event.source!==window.parent)return;try{state=clean(JSON.parse(event.data));render()}catch(e){}});render();</script></body></html>`;
}

function rendererCss() {
  return [
    `html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#000}.softcast-render{position:relative;width:100%;height:100%;overflow:hidden;background:var(--sc-0);isolation:isolate}.sc-dimmer{position:absolute;inset:0;z-index:50;background:#000;opacity:var(--sc-dim);pointer-events:none}.sc-layer{position:absolute;inset:-45%;opacity:0;pointer-events:none;transform-origin:center}.sc-a,.sc-b,.sc-c{background:transparent}@keyframes sc-flow{from{background-position:0% 50%}to{background-position:200% 50%}}@keyframes sc-flow-y{from{background-position:50% 0%}to{background-position:50% 200%}}@keyframes sc-sweep-right{from{transform:translateX(-70%)}to{transform:translateX(70%)}}@keyframes sc-sweep-left{from{transform:translateX(70%)}to{transform:translateX(-70%)}}@keyframes sc-sweep-down{from{transform:translateY(-70%)}to{transform:translateY(70%)}}@keyframes sc-sweep-up{from{transform:translateY(70%)}to{transform:translateY(-70%)}}@keyframes sc-pulse{0%,100%{transform:scale(.94);opacity:.28}50%{transform:scale(1.08);opacity:1}}@keyframes sc-flicker{0%,100%{transform:scale(1);opacity:.45}25%{transform:scale(1.04) translateX(-1%);opacity:.7}50%{transform:scale(.98) translateX(1%);opacity:.52}75%{transform:scale(1.06);opacity:.82}}@keyframes sc-fire{from{transform:translateY(8%) scale(1.02)}to{transform:translateY(-10%) scale(1.12)}}@keyframes sc-twinkle{from{transform:scale(.65);opacity:.25}to{transform:scale(1.25);opacity:1}}`,
    ...renderEngineValues.map((engine) => engineSchemas[engine].css(createCssVars().vars))
  ].join("");
}

function defineEngine(definition: EngineDefinition) {
  const tracked = createCssVars();
  definition.css(tracked.vars);
  const used = tracked.usedControls;
  for (const control of definition.controls) {
    const dependencies = controlDependencies[control];
    if (!dependencies.some((dependency) => used.has(dependency))) {
      throw new Error(`Engine control "${control}" is declared but not consumed by CSS`);
    }
  }
  return definition;
}

function createCssVars(): { vars: CssVars; usedControls: Set<LightingControl> } {
  const usedControls = new Set<LightingControl>();
  const vars: CssVars = {
    dim: () => "var(--sc-dim)",
    speed: () => { usedControls.add("speed"); return "var(--sc-speed)"; },
    intensity: () => { usedControls.add("intensity"); return "var(--sc-intensity)"; },
    spread: () => { usedControls.add("spread"); return "var(--sc-spread)"; },
    soft: () => { usedControls.add("softness"); return "var(--sc-soft)"; },
    blur: () => { usedControls.add("softness"); return "var(--sc-blur)"; },
    temperature: () => { usedControls.add("temperature"); return "var(--sc-temp)"; },
    angle: () => { usedControls.add("direction"); return "var(--sc-angle)"; },
    color: (index) => { usedControls.add("colors"); return `var(--sc-${index})`; },
    gradient: () => { usedControls.add("colors"); usedControls.add("colorCount"); return "var(--sc-gradient)"; }
  };
  return { vars, usedControls };
}

function validateProtocolSchema() {
  const errors: string[] = [];
  for (const preset of presetLibrary) {
    const engine = engineSchemas[preset.engine];
    for (const control of preset.controls) {
      if (!engine.controls.includes(control)) errors.push(`${preset.value} declares unsupported ${control} control for ${preset.engine}`);
    }
    if (preset.controls.includes("colors") && preset.colors.length !== preset.colorSlots) {
      errors.push(`${preset.value} has ${preset.colors.length} colors but ${preset.engine} requires ${preset.colorSlots}`);
    }
    if (preset.controls.includes("palette") && !preset.controls.includes("colors") && !engine.controls.includes("colorCount")) {
      errors.push(`${preset.value} declares palette without color-driven rendering`);
    }
  }
  if (errors.length) throw new Error(`Invalid Softcast protocol schema:\n${errors.join("\n")}`);
}

function p(value: LightingPreset, label: string, mode: LightingMode, engine: RenderEngine, palette: PaletteName, colors: string[], controls: LightingControl[], description: string): RawPreset {
  return { value, label, mode, engine, palette, colors, controls, description };
}

function paletteColors(value: PaletteName) {
  return palettes.find((palette) => palette.value === value)?.colors || palettes[0].colors;
}

function normalizeColors(colors: string[], count: number) {
  const fallback = ["#ffffff", "#ff7a18", "#7c3aed", "#00ff66", "#00b7ff", "#fff200"];
  return Array.from({ length: count }, (_, index) => ColorSchema.safeParse(colors[index]).success ? colors[index]! : fallback[index] || "#ffffff");
}

function clamp01(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
