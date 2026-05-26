"use client";

import { useEffect, useState } from "react";
import { defaultLightingState, lightingModes, palettes, presetLibrary, stateFromPreset, type LightingState, type LightingPreset, type RgbDirection } from "@softcast/protocol";
import { createCode, createSession, createSubSession, deleteSession, deleteSubSession, updateState } from "@/lib/backend";
import { useSoftcast } from "@/lib/use-softcast";
import { ScreenRenderer } from "@/lib/ScreenRenderer";

type LocalScreen = { name: string; subSessionId: string; screenUrl: string };
type LocalSession = { name: string; sessionId: string; sessionUrl: string; screens: LocalScreen[] };
type Target = { session: LocalSession; screen?: LocalScreen };

export default function AdminPage() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSubSessionId, setActiveSubSessionId] = useState("");
  const [sessionName, setSessionName] = useState("studio");
  const [screenName, setScreenName] = useState("key light");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState<LightingState>(defaultLightingState);
  const [sessionMenuId, setSessionMenuId] = useState("");
  const [screenMenuId, setScreenMenuId] = useState("");
  const [showClientConfirm, setShowClientConfirm] = useState(false);
  const [crampedLayout, setCrampedLayout] = useState(false);

  useEffect(() => {
    if (!activeSessionId && sessions[0]) setActiveSessionId(sessions[0].sessionId);
  }, [activeSessionId, sessions]);

  const active = sessions.find((session) => session.sessionId === activeSessionId);
  const codeTargetScreen = active?.screens.find((screen) => screen.subSessionId === activeSubSessionId);
  const target: Target | null = active && codeTargetScreen ? { session: active, screen: codeTargetScreen } : null;
  const sessionSync = useSoftcast(active ? { sessionId: active.sessionId } : null);
  const screenSync = useSoftcast(active && codeTargetScreen ? { sessionId: active.sessionId, subSessionId: codeTargetScreen.subSessionId } : null);
  const syncStatus = codeTargetScreen ? screenSync.status : sessionSync.status;

  useEffect(() => {
    setState(screenSync.state);
  }, [screenSync.state]);

  useEffect(() => {
    function updateCrampedLayout() {
      setCrampedLayout(window.innerWidth < 1024 || window.innerHeight < 620);
    }

    updateCrampedLayout();
    window.addEventListener("resize", updateCrampedLayout);
    return () => window.removeEventListener("resize", updateCrampedLayout);
  }, []);

  async function addSession(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await createSession(sessionName);
      const next = upsertSession(sessions, { name: sessionName, ...created, screens: [] });
      setSessions(next);
      setActiveSessionId(created.sessionId);
      setActiveSubSessionId("");
      setCode("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create session");
    }
  }

  async function copySessionLink(session: LocalSession) {
    await navigator.clipboard.writeText(session.sessionUrl);
    setSessionMenuId("");
  }

  async function removeSession(session: LocalSession) {
    setError("");
    try {
      await deleteSession(session.sessionId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete session");
      return;
    }

    const next = sessions.filter((item) => item.sessionId !== session.sessionId);
    setSessions(next);
    setSessionMenuId("");
    setCode("");
    if (activeSessionId === session.sessionId) {
      setActiveSessionId(next[0]?.sessionId || "");
      setActiveSubSessionId("");
    }
  }

  async function addScreen(event: React.FormEvent) {
    event.preventDefault();
    if (!active) return;
    setError("");
    try {
      const created = await createSubSession(active.sessionId, screenName);
      const screen = { name: screenName, ...created };
      const next = sessions.map((session) => session.sessionId === active.sessionId ? { ...session, screens: upsertScreen(session.screens, screen) } : session);
      setSessions(next);
      setActiveSubSessionId(created.subSessionId);
      setCode("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create screen");
    }
  }

  async function generateCode() {
    if (!active) return;
    setCode("");
    setError("");
    try {
      const generated = await createCode({ sessionId: active.sessionId, subSessionId: codeTargetScreen?.subSessionId });
      setCode(generated.code);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate code");
    }
  }

  async function generateScreenCode(screen: LocalScreen) {
    if (!active) return;
    setActiveSubSessionId(screen.subSessionId);
    setCode("");
    setError("");
    try {
      const generated = await createCode({ sessionId: active.sessionId, subSessionId: screen.subSessionId });
      setCode(generated.code);
      setScreenMenuId("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate code");
    }
  }

  async function copyScreenLink(screen: LocalScreen) {
    await navigator.clipboard.writeText(screen.screenUrl);
    setScreenMenuId("");
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
  }

  async function removeScreen(screen: LocalScreen) {
    if (!active) return;
    setError("");
    try {
      await deleteSubSession(active.sessionId, screen.subSessionId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete screen");
      return;
    }

    const next = sessions.map((session) => session.sessionId === active.sessionId ? { ...session, screens: session.screens.filter((item) => item.subSessionId !== screen.subSessionId) } : session);
    setSessions(next);
    setScreenMenuId("");
    setCode("");
    if (activeSubSessionId === screen.subSessionId) setActiveSubSessionId("");
  }

  async function pushState(nextState: LightingState) {
    if (!target?.screen) return;
    if (screenSync.sendState(nextState)) return;

    try {
      const updated = await updateState(target.session.sessionId, nextState, target.screen.subSessionId);
      setState(updated.state);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update light state");
    }
  }

  return (
    <main className={`${crampedLayout ? "min-h-dvh overflow-y-auto" : "h-dvh overflow-hidden"} bg-black text-[#f5f5f7]`}>
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-black px-4">
        <button type="button" onClick={() => setShowClientConfirm(true)} className="flex items-center gap-3 rounded-full pr-3 transition hover:bg-white/[0.06]">
          <div className="h-3 w-3 rounded-full bg-white" />
          <h1 className="text-[14px] font-semibold tracking-[-0.02em]">Softcast</h1>
          <span className="hidden text-[12px] text-white/32 sm:inline">Admin</span>
        </button>
        <div className="flex items-center gap-3 text-[12px] text-white/45">
          <span className={statusPillClass(syncStatus)}>{syncStatus}</span>
        </div>
      </header>

      {crampedLayout ? <CrampedLayoutWarning /> : null}

      <div className={crampedLayout ? "grid min-h-[calc(100dvh-48px)] grid-cols-1 overflow-visible" : "grid h-[calc(100dvh-48px)] grid-cols-[280px_minmax(0,1fr)_360px] overflow-hidden"}>
        <aside className={`${crampedLayout ? "border-b" : "border-r overflow-hidden"} border-white/[0.08] bg-[#050505] p-3`}>
          <form onSubmit={addSession} className="mb-4 rounded-[18px] border border-white/[0.08] bg-[#0a0a0b] p-3">
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/34">Session</label>
            <input value={sessionName} onChange={(event) => setSessionName(event.target.value)} className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-black px-3 text-[13px] text-white outline-none focus:border-white/25" />
            <button className="mt-2 h-9 w-full rounded-full bg-white text-[13px] font-semibold text-black transition hover:bg-white/85">Create</button>
          </form>

          <div className="mb-4">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/34">Sessions</p>
            <div className="space-y-1">
              {sessions.map((session) => (
                <div key={session.sessionId} className="relative">
                <button onClick={() => { setActiveSessionId(session.sessionId); setActiveSubSessionId(""); setCode(""); setSessionMenuId(""); setScreenMenuId(""); }} className={`flex h-10 w-full items-center justify-between rounded-[10px] py-0 pl-3 pr-10 text-left text-[13px] transition ${session.sessionId === activeSessionId && !activeSubSessionId ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}>
                    <span className="truncate font-medium">{session.name}</span>
                    <span className="text-[11px] text-white/28">{session.screens.length}</span>
                  </button>
                <button type="button" aria-label={`Open ${session.name} menu`} onClick={(event) => { event.stopPropagation(); setScreenMenuId(""); setSessionMenuId(sessionMenuId === session.sessionId ? "" : session.sessionId); }} className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-[8px] text-[18px] leading-none ${session.sessionId === activeSessionId && !activeSubSessionId ? "text-black/45 hover:bg-black/[0.08]" : "text-white/35 hover:bg-white/[0.08] hover:text-white"}`}>...</button>
                  {sessionMenuId === session.sessionId ? (
                    <div className="absolute right-1 top-10 z-20 w-40 overflow-hidden rounded-[12px] border border-white/[0.1] bg-[#151517] shadow-2xl">
                      <button type="button" onClick={() => copySessionLink(session)} className="block h-9 w-full px-3 text-left text-[13px] text-white/76 hover:bg-white/[0.08]">Copy link</button>
                      <button type="button" onClick={() => removeSession(session)} className="block h-9 w-full px-3 text-left text-[13px] text-[#ff6961] hover:bg-white/[0.08]">Delete session</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {active ? (
            <>
              <form onSubmit={addScreen} className="mb-4 rounded-[18px] border border-white/[0.08] bg-[#0a0a0b] p-3">
                <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/34">New screen</label>
                <input value={screenName} onChange={(event) => setScreenName(event.target.value)} className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-black px-3 text-[13px] text-white outline-none focus:border-white/25" />
                <button className="mt-2 h-9 w-full rounded-full border border-white/[0.12] text-[13px] font-medium text-white/82 transition hover:bg-white/[0.08]">Create</button>
              </form>

              <div>
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/34">Screens</p>
                <div className="space-y-1">
                  {active.screens.map((screen) => (
                    <div key={screen.subSessionId} className="relative">
                      <button onClick={() => { setActiveSubSessionId(screen.subSessionId); setCode(""); setSessionMenuId(""); setScreenMenuId(""); }} className={`w-full rounded-[12px] py-2 pl-3 pr-10 text-left transition ${screen.subSessionId === activeSubSessionId ? "bg-white text-black" : "text-white/58 hover:bg-white/[0.06] hover:text-white"}`}>
                        <span className="block truncate text-[13px] font-semibold">{screen.name}</span>
                        <span className={`block truncate text-[11px] ${screen.subSessionId === activeSubSessionId ? "text-black/55" : "text-white/28"}`}>Direct light screen</span>
                      </button>
                      <button type="button" aria-label={`Open ${screen.name} menu`} onClick={(event) => { event.stopPropagation(); setSessionMenuId(""); setScreenMenuId(screenMenuId === screen.subSessionId ? "" : screen.subSessionId); }} className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-[8px] text-[18px] leading-none ${screen.subSessionId === activeSubSessionId ? "text-black/45 hover:bg-black/[0.08]" : "text-white/35 hover:bg-white/[0.08] hover:text-white"}`}>...</button>
                      {screenMenuId === screen.subSessionId ? (
                        <div className="absolute right-1 top-10 z-20 w-44 overflow-hidden rounded-[12px] border border-white/[0.1] bg-[#151517] shadow-2xl">
                          <button type="button" onClick={() => copyScreenLink(screen)} className="block h-9 w-full px-3 text-left text-[13px] text-white/76 hover:bg-white/[0.08]">Copy link</button>
                          <button type="button" onClick={() => generateScreenCode(screen)} className="block h-9 w-full px-3 text-left text-[13px] text-white/76 hover:bg-white/[0.08]">Generate code</button>
                          <button type="button" onClick={() => removeScreen(screen)} className="block h-9 w-full px-3 text-left text-[13px] text-[#ff6961] hover:bg-white/[0.08]">Delete screen</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!active.screens.length ? <p className="px-1 py-2 text-[12px] leading-5 text-white/32">Create a screen to control lighting.</p> : null}
                </div>
              </div>
            </>
          ) : null}
        </aside>

        <section className={crampedLayout ? "hidden" : "flex min-w-0 flex-col bg-black p-4"}>
          <div className="mb-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[12px] text-white/36">{active ? active.name : "No session"}</p>
            <h2 className="truncate text-[24px] font-semibold tracking-[-0.04em]">{codeTargetScreen ? codeTargetScreen.name : active ? `${active.name} root` : "No session"}</h2>
          </div>
            <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[12px] text-white/42">{codeTargetScreen ? "Screen" : "Select screen"}</div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#050505]">
            {codeTargetScreen ? <Preview state={state} /> : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <p className="text-[28px] font-semibold tracking-[-0.04em] text-white">Root session selected</p>
                  <p className="mx-auto mt-2 max-w-[380px] text-[14px] leading-6 text-white/42">Use the inspector to generate a chooser code. Select a screen in the left rail to control lighting.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className={`${crampedLayout ? "min-h-[420px]" : "overflow-hidden border-l"} border-white/[0.08] bg-[#050505] p-3`}>
          {active ? (
            <div className="flex h-full flex-col gap-3">
              <section className="shrink-0 rounded-[18px] border border-white/[0.08] bg-[#0a0a0b] p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/34">Verification</p>
                <p className="mt-2 truncate text-[15px] font-semibold text-white">{codeTargetScreen ? codeTargetScreen.name : `${active.name} root`}</p>
                <p className="mt-1 truncate text-[12px] text-white/32">{codeTargetScreen?.screenUrl || active.sessionUrl}</p>
                <button onClick={generateCode} className="mt-3 h-9 w-full rounded-full bg-white text-[13px] font-semibold text-black transition hover:bg-white/85">Generate verification code</button>
                {code ? (
                  <div className="mt-3 rounded-[14px] bg-white p-2.5 text-black">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-black/45">Code</p>
                      <button type="button" onClick={copyCode} className="rounded-full bg-black px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-black/80">Copy</button>
                    </div>
                    <input readOnly value={code} onFocus={(event) => event.currentTarget.select()} className="mt-2 h-11 w-full select-all rounded-[10px] border border-black/10 bg-black/[0.04] px-3 text-center text-[28px] font-semibold tracking-[0.16em] text-black outline-none focus:border-black/30" />
                  </div>
                ) : null}
                {error ? <p className="mt-2 text-[12px] text-[#ff6961]">{error}</p> : null}
              </section>

              {codeTargetScreen ? <ControlPanel state={state} setState={pushState} /> : (
                <section className="rounded-[18px] border border-white/[0.08] bg-[#0a0a0b] p-3 text-[13px] leading-5 text-white/45">
                  Root session is selected. It can generate a chooser code, but it has no lighting controls. Select a screen to control lighting.
                </section>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[14px] text-white/42">Create or reopen a session.</div>
          )}
        </aside>
      </div>
      {showClientConfirm ? <ClientConfirmModal onCancel={() => setShowClientConfirm(false)} /> : null}
    </main>
  );
}

function ControlPanel({ state, setState }: { state: LightingState; setState: (state: LightingState) => void }) {
  const meta = presetLibrary.find((preset) => preset.value === state.preset) || presetLibrary[0];
  const controls = new Set(meta.controls);

  function selectPreset(value: LightingPreset) {
    const next = stateFromPreset(value);
    if (next) setState(next);
  }

  const directionOptions = [{ value: "right", label: "Left to right" }, { value: "left", label: "Right to left" }, { value: "down", label: "Top to bottom" }, { value: "up", label: "Bottom to top" }];

  function updateColor(index: number, color: string) {
    const colors = ensureColors(state.colors, meta.colorSlots);
    colors[index] = color;
    setState({ ...state, palette: "custom", colors });
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-white/[0.08] bg-[#0a0a0b] p-3">
      <GlobalBrightness value={state.brightness} onChange={(brightness) => setState({ ...state, brightness })} />

      <div className="space-y-3">
        {lightingModes.map((mode) => {
          const presets = presetLibrary.filter((preset) => preset.mode === mode.value);
          return (
            <section key={mode.value}>
              <div className="mb-1.5 px-1">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${state.mode === mode.value ? "text-white/72" : "text-white/34"}`}>{mode.label}</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((preset) => <PresetCard key={preset.value} active={state.preset === preset.value} preset={preset} onClick={() => selectPreset(preset.value)} />)}
              </div>
            </section>
          );
        })}
      </div>

      {controls.has("palette") ? (
        <div className="mt-3">
          <Field label="Palette">
            <select value={state.palette} onChange={(event) => { const palette = palettes.find((item) => item.value === event.target.value); if (palette) setState({ ...state, palette: palette.value, colors: palette.colors }); }} className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-black px-3 text-[13px] text-white outline-none focus:border-white/25">
              {palettes.map((palette) => <option key={palette.value} value={palette.value}>{palette.label}</option>)}
            </select>
          </Field>
          <div className="mt-2 flex h-6 overflow-hidden rounded-full border border-white/[0.08]">
            {(palettes.find((palette) => palette.value === state.palette)?.colors || state.colors).slice(0, 6).map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}
          </div>
        </div>
      ) : null}

      {controls.has("colors") ? (
        <div className="mt-3">
          <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/34">Custom colors</label>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {ensureColors(state.colors, controls.has("colorCount") ? state.colorCount : meta.colorSlots).map((color, index) => <Color key={index} value={color} onChange={(next) => updateColor(index, next)} />)}
          </div>
        </div>
      ) : null}

      {controls.has("direction") ? (
        <div className="mt-3">
          <Field label="Direction">
            <select value={state.rgbDirection} onChange={(event) => setState({ ...state, rgbDirection: event.target.value as RgbDirection })} className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-black px-3 text-[13px] text-white outline-none focus:border-white/25">
              {directionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </div>
      ) : null}

      {controls.size ? <div className="mt-2">
        {controls.has("speed") ? <Slider label="Motion" value={state.speed} onChange={(speed) => setState({ ...state, speed })} /> : null}
        {controls.has("colorCount") ? <ColorCount value={state.colorCount} onChange={(colorCount) => setState({ ...state, colorCount, colors: ensureColors(state.colors, colorCount) })} /> : null}
        {controls.has("intensity") ? <Slider label="Energy" value={state.intensity} onChange={(intensity) => setState({ ...state, intensity })} /> : null}
        {controls.has("spread") ? <Slider label="Size" value={state.spread} onChange={(spread) => setState({ ...state, spread })} /> : null}
        {controls.has("softness") ? <Slider label="Feather" value={state.softness} onChange={(softness) => setState({ ...state, softness })} /> : null}
        {controls.has("temperature") ? <Temperature value={state.temperature} onChange={(temperature) => setState({ ...state, temperature })} /> : null}
      </div> : null}
    </section>
  );
}

function PresetCard({ active, preset, onClick }: { active: boolean; preset: (typeof presetLibrary)[number]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-9 items-center justify-between rounded-[10px] border px-3 text-left text-[12px] font-semibold tracking-[-0.02em] transition ${active ? "border-white bg-white text-black" : "border-white/[0.08] bg-black text-white/62 hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"}`}>
      <span className="truncate">{preset.label}</span>
      {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/55" /> : null}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/34">{label}</span>{children}</label>;
}

function Color({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input aria-label="Custom color" type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-full rounded-[8px] border border-white/[0.08] bg-black" />;
}

function GlobalBrightness({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <section className="mb-3 rounded-[14px] border border-white/[0.12] bg-[#050505] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">Brightness</p>
        <p className="text-[18px] font-semibold tabular-nums tracking-[-0.04em] text-white">{Math.round(value * 100)}</p>
      </div>
      <div className="relative h-9 overflow-hidden rounded-[8px] border border-white/[0.12] bg-black">
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.18)_0_1px,transparent_1px_10%)]" />
        <input
          aria-label="Brightness"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </section>
  );
}

function ColorCount({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="mt-2 block text-[12px] font-medium text-white/52"><span className="flex justify-between"><span>Colors</span><span className="text-white/28">{value}</span></span><input type="range" min="2" max="6" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-white" /></label>;
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="mt-2 block text-[12px] font-medium text-white/52"><span className="flex justify-between"><span>{label}</span><span className="text-white/28">{Math.round(value * 100)}</span></span><input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-white" /></label>;
}

function Temperature({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="mt-2 block text-[12px] font-medium text-white/52"><span className="flex justify-between"><span>Temperature</span><span className="text-white/28">{Math.round(value)}K</span></span><input type="range" min="1800" max="10000" step="50" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-white" /></label>;
}

function ensureColors(colors: string[], count: number) {
  const fallback = ["#ff0000", "#00ff55", "#0066ff", "#ff00cc", "#fff200", "#00e5ff"];
  return Array.from({ length: count }, (_, index) => colors[index] || fallback[index] || "#ffffff");
}

function Preview({ state }: { state: LightingState }) {
  return <ScreenRenderer state={state} preview />;
}

function upsertSession(sessions: LocalSession[], next: LocalSession) {
  const existing = sessions.find((session) => session.sessionId === next.sessionId);
  if (!existing) return [next, ...sessions];
  return sessions.map((session) => session.sessionId === next.sessionId ? { ...next, screens: existing.screens } : session);
}

function upsertScreen(screens: LocalScreen[], next: LocalScreen) {
  return screens.some((screen) => screen.subSessionId === next.subSessionId) ? screens.map((screen) => screen.subSessionId === next.subSessionId ? next : screen) : [...screens, next];
}

function statusPillClass(status: string) {
  return status === "connected"
    ? "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-emerald-200"
    : "rounded-full border border-white/[0.08] px-2 py-1 text-white/45";
}

function ClientConfirmModal({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-md">
      <section className="w-full max-w-[360px] rounded-[24px] border border-white/[0.12] bg-[#0a0a0b]/95 p-5 text-center shadow-2xl">
        <div className="mx-auto h-3 w-3 rounded-full bg-white" />
        <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.04em] text-white">Go to client page?</h2>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-5 text-white/45">This leaves the admin console and returns to the verification code screen.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-full border border-white/[0.12] text-[13px] font-semibold text-white/72 transition hover:bg-white/[0.08] hover:text-white">Cancel</button>
          <button type="button" onClick={() => { window.location.href = "/"; }} className="h-10 rounded-full bg-white text-[13px] font-semibold text-black transition hover:bg-white/85">Go to client</button>
        </div>
      </section>
    </div>
  );
}

function CrampedLayoutWarning() {
  return (
    <div className="sticky top-0 z-30 border-b border-amber-300/15 bg-amber-300/10 px-4 py-2 text-center text-[12px] font-medium text-amber-100 backdrop-blur-md">
      Admin workspace is cramped. Reduce browser zoom or widen the window for the full three-panel layout.
    </div>
  );
}
