import { z } from "zod";

export const minTemperature = 1800;
export const maxTemperature = 10000;

export type LightingMode = "cct" | "color";

export const LightingStateSchema = z.object({
  mode: z.enum(["cct", "color"]),
  temperature: z.number().finite().min(minTemperature).max(maxTemperature),
  hue: z.number().finite().min(0).max(360),
  saturation: z.number().finite().min(0).max(1),
  brightness: z.number().finite().min(0).max(1)
});

export type LightingState = z.infer<typeof LightingStateSchema>;

export type SessionTarget = {
  sessionId: string;
  screenId?: string;
};

export type ScreenSummary = {
  screenId: string;
  name: string;
  screenUrl: string;
  createdAt: number;
};

export type SessionSummary = {
  sessionId: string;
  name: string;
  sessionUrl: string;
  createdAt: number;
  screens: ScreenSummary[];
};

export type AdminWorkspace = {
  sessions: SessionSummary[];
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

export type ClientMessage = { type: "subscribe"; target: SessionTarget };

export type ServerMessage = Sequenced & (
  | { type: "state"; target: SessionTarget; revision: number; state: LightingState }
  | { type: "screens"; sessionId: string; screens: ScreenSummary[] }
  | { type: "error"; message: string }
);

export const defaultLightingState: LightingState = {
  mode: "cct",
  temperature: 2500,
  hue: 0,
  saturation: 0,
  brightness: 1
};

/** Pre-connection UI placeholder: white CCT at 0% brightness (renders black). */
export const initialDisplayState: LightingState = {
  mode: "cct",
  temperature: 6500,
  hue: 0,
  saturation: 0,
  brightness: 0
};

export function clampLightingState(input: Partial<LightingState> | LightingState | null | undefined): LightingState {
  return LightingStateSchema.parse({
    mode: input?.mode === "color" ? "color" : "cct",
    temperature: clampNumber(input?.temperature, minTemperature, maxTemperature, defaultLightingState.temperature),
    hue: clampNumber(input?.hue, 0, 360, defaultLightingState.hue),
    saturation: clampNumber(input?.saturation, 0, 1, defaultLightingState.saturation),
    brightness: clampNumber(input?.brightness, 0, 1, defaultLightingState.brightness)
  });
}

export function kelvinToCssColor(temperature: number) {
  const { r, g, b } = kelvinToRgb(temperature);
  return `rgb(${r}, ${g}, ${b})`;
}

export function hsvToRgb(hue: number, saturation: number, value: number) {
  const h = (((hue % 360) + 360) % 360);
  const s = clampNumber(saturation, 0, 1, 0);
  const v = clampNumber(value, 0, 1, 1);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function hsvToCssColor(hue: number, saturation: number, value = 1) {
  const { r, g, b } = hsvToRgb(hue, saturation, value);
  return `rgb(${r}, ${g}, ${b})`;
}

export function lightingCssColor(state: LightingState) {
  return state.mode === "color" ? hsvToCssColor(state.hue, state.saturation, 1) : kelvinToCssColor(state.temperature);
}

export function rendererHtml(state: LightingState) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>${rendererCss()}</style></head><body><div id="root"></div><script>var state=${JSON.stringify(clampLightingState(state))};function clamp(v,min,max,d){return typeof v==='number'&&isFinite(v)?Math.min(max,Math.max(min,v)):d}function clean(raw){return{mode:raw&&raw.mode==='color'?'color':'cct',temperature:clamp(raw&&raw.temperature,${minTemperature},${maxTemperature},${defaultLightingState.temperature}),hue:clamp(raw&&raw.hue,0,360,${defaultLightingState.hue}),saturation:clamp(raw&&raw.saturation,0,1,${defaultLightingState.saturation}),brightness:clamp(raw&&raw.brightness,0,1,${defaultLightingState.brightness})}}function rgb(k){k=clamp(k,${minTemperature},${maxTemperature},${defaultLightingState.temperature})/100;var r,g,b;if(k<=66){r=255;g=99.4708025861*Math.log(k)-161.1195681661;b=k<=19?0:138.5177312231*Math.log(k-10)-305.0447927307}else{r=329.698727446*Math.pow(k-60,-0.1332047592);g=288.1221695283*Math.pow(k-60,-0.0755148492);b=255}return[Math.round(clamp(r,0,255,255)),Math.round(clamp(g,0,255,255)),Math.round(clamp(b,0,255,255))]}function hsv(h,s,v){h=((h%360)+360)%360;var c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return[Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)]}function base(s){return s.mode==='color'?hsv(s.hue,s.saturation,1):rgb(s.temperature)}function render(){state=clean(state);var c=base(state).join(',');document.getElementById('root').innerHTML='<div class="softcast-light" style="background:rgb('+c+')"><div class="softcast-dimmer" style="opacity:'+(1-state.brightness)+'"></div></div>'}window.addEventListener('message',function(event){if(event.source!==window.parent)return;try{state=clean(JSON.parse(event.data));render()}catch(e){}});render();</script></body></html>`;
}

function rendererCss() {
  return "html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#000}.softcast-light{position:relative;width:100%;height:100%;overflow:hidden}.softcast-dimmer{position:absolute;inset:0;background:#000;pointer-events:none}";
}

function kelvinToRgb(temperature: number) {
  const kelvin = clampNumber(temperature, minTemperature, maxTemperature, defaultLightingState.temperature) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (kelvin <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(kelvin) - 161.1195681661;
    b = kelvin <= 19 ? 0 : 138.5177312231 * Math.log(kelvin - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(kelvin - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(kelvin - 60, -0.0755148492);
    b = 255;
  }

  return {
    r: Math.round(clampNumber(r, 0, 255, 255)),
    g: Math.round(clampNumber(g, 0, 255, 255)),
    b: Math.round(clampNumber(b, 0, 255, 255))
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
