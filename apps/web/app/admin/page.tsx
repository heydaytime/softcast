"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { defaultLightingState, hsvToCssColor, initialDisplayState, kelvinToCssColor, lightingCssColor, maxTemperature, minTemperature, type LightingMode, type LightingState, type ScreenSummary, type SessionSummary } from "@softcast/protocol";
import { createCode, createScreen, createSession, deleteScreen, deleteSession, getAdminWorkspace, isBackendUnavailableMessage, updateState } from "@/lib/backend";
import { useAuth } from "@clerk/nextjs";
import { useSoftcast } from "@/lib/use-softcast";
import { ScreenRenderer } from "@/lib/ScreenRenderer";
import { Slider } from "@/lib/Slider";
import { ColorWheel } from "@/lib/ColorWheel";
import { getCctRecents, getColorRecents, pushCctRecent, pushColorRecent, type ColorRecent } from "@/lib/recents";
import { BackendUnavailableModal } from "@/lib/BackendUnavailableModal";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { AuthControls, FieldInput, Kicker, PrimaryButton, SecondaryButton, SoftcastHeader } from "@/lib/ui";

// Ordered cool→warm (high→low Kelvin) so the chips read top-to-bottom in the same
// direction as the vertical CCT gradient bar (blue/cool at top, orange/warm at bottom).
const cctPresets = [6500, 5600, 4300, 3200, 2700];

// Below the desktop breakpoint the console collapses to one pane at a time, navigated
// by a top tab strip. Above it, the full three-region layout renders unchanged.
type TabKey = "library" | "control" | "preview";

export default function AdminPage() {
  const { getToken, isLoaded } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeScreenId, setActiveScreenId] = useState("");
  const [sessionName, setSessionName] = useState("studio");
  const [screenName, setScreenName] = useState("key light");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState<LightingState>(initialDisplayState);
  const [sessionMenuId, setSessionMenuId] = useState("");
  const [screenMenuId, setScreenMenuId] = useState("");
  const [showClientConfirm, setShowClientConfirm] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [cctRecents, setCctRecents] = useState<number[]>([]);
  const [colorRecents, setColorRecents] = useState<ColorRecent[]>([]);
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const [activeTab, setActiveTab] = useState<TabKey>("library");
  // Coalescing write pipeline: the local `state` is the instant source of truth while
  // dragging; outgoing PUTs are coalesced (one in flight, latest value always wins) and
  // server echoes are suppressed until our writes settle, so a laggy remote echo can never
  // yank a controlled slider/wheel mid-drag. See pushState / flushWrites / the echo effect.
  const pendingRef = useRef<LightingState | null>(null);
  const inFlightRef = useRef(false);
  const suppressEchoRef = useRef(false);
  const latestServerStateRef = useRef<LightingState>(defaultLightingState);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCctRecents(getCctRecents());
    setColorRecents(getColorRecents());
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    async function loadWorkspace() {
      setError("");
      try {
        const workspace = await getAdminWorkspace(await getToken());
        if (!cancelled) setSessions(workspace.sessions);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Could not load sessions");
      } finally {
        if (!cancelled) setWorkspaceLoaded(true);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, [getToken, isLoaded]);

  useEffect(() => {
    if (!activeSessionId && sessions[0]) setActiveSessionId(sessions[0].sessionId);
  }, [activeSessionId, sessions]);

  const active = sessions.find((session) => session.sessionId === activeSessionId);
  const screen = active?.screens.find((item) => item.screenId === activeScreenId);
  const sessionSync = useSoftcast(active ? { sessionId: active.sessionId } : null);
  const screenSync = useSoftcast(active && screen ? { sessionId: active.sessionId, screenId: screen.screenId } : null);
  const syncStatus = screen ? screenSync.status : sessionSync.status;
  const backendModalMessage = isBackendUnavailableMessage(error) ? error : isBackendUnavailableMessage(syncStatus) ? syncStatus : "";

  useEffect(() => {
    if (!activeSessionId || sessionSync.status !== "connected") return;
    setSessions((current) => current.map((session) => session.sessionId === activeSessionId ? { ...session, screens: sessionSync.screens } : session));
  }, [activeSessionId, sessionSync.screens, sessionSync.status]);

  useEffect(() => {
    if (active && activeScreenId && !active.screens.some((item) => item.screenId === activeScreenId)) {
      setActiveScreenId("");
      setCode("");
      if (!isDesktop) setActiveTab("library");
    }
  }, [active, activeScreenId, isDesktop]);

  useEffect(() => {
    latestServerStateRef.current = screenSync.state;
    // While our own writes are in flight, local state owns the dials; applying a lagging
    // echo here is exactly what made them stutter. We reconcile once the queue settles.
    if (suppressEchoRef.current) return;
    setState(screenSync.state);
  }, [screenSync.state]);

  // Reset the write pipeline whenever the selected screen changes so the controls hydrate
  // from the newly-selected screen's real state (and a trailing write can't leak across).
  useEffect(() => {
    pendingRef.current = null;
    suppressEchoRef.current = false;
    if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null; }
    if (activeScreenId) setState(initialDisplayState);
  }, [activeSessionId, activeScreenId]);

  useEffect(() => () => { if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current); }, []);

  function selectSession(session: SessionSummary) {
    setActiveSessionId(session.sessionId);
    setActiveScreenId("");
    setCode("");
    setSessionMenuId("");
    setScreenMenuId("");
    // Stay in the Library tab so the session's screens list is right there to pick from.
    if (!isDesktop) setActiveTab("library");
  }

  function selectScreen(item: ScreenSummary) {
    setActiveScreenId(item.screenId);
    setCode("");
    setSessionMenuId("");
    setScreenMenuId("");
    // Picking a screen means "control this light" — jump to the controls on small screens.
    if (!isDesktop) setActiveTab("control");
  }

  async function addSession(event: FormEvent) {
    event.preventDefault();
    if (!sessionName.trim()) return;
    setError("");
    try {
      const { session } = await createSession(sessionName, await getToken());
      setSessions(upsertSession(sessions, session));
      setActiveSessionId(session.sessionId);
      setActiveScreenId("");
      setCode("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create session");
    }
  }

  async function copySessionLink(session: SessionSummary) {
    await navigator.clipboard.writeText(session.sessionUrl);
    setSessionMenuId("");
  }

  async function removeSession(session: SessionSummary) {
    setError("");
    try {
      await deleteSession(session.sessionId, await getToken());
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
      setActiveScreenId("");
    }
  }

  async function addScreen(event: FormEvent) {
    event.preventDefault();
    if (!active || !screenName.trim()) return;
    setError("");
    try {
      const { screen: created } = await createScreen(active.sessionId, screenName, await getToken());
      setSessions(sessions.map((session) => session.sessionId === active.sessionId ? { ...session, screens: upsertScreen(session.screens, created) } : session));
      setActiveScreenId(created.screenId);
      setCode("");
      if (!isDesktop) setActiveTab("control");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create screen");
    }
  }

  async function generateCode() {
    if (!active) return;
    setCode("");
    setError("");
    try {
      const generated = await createCode({ sessionId: active.sessionId, screenId: screen?.screenId }, await getToken());
      setCode(generated.code);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate code");
    }
  }

  async function copyScreenLink(item: ScreenSummary) {
    await navigator.clipboard.writeText(item.screenUrl);
    setScreenMenuId("");
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
  }

  async function removeScreen(item: ScreenSummary) {
    if (!active) return;
    setError("");
    try {
      await deleteScreen(active.sessionId, item.screenId, await getToken());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete screen");
      return;
    }

    setSessions(sessions.map((session) => session.sessionId === active.sessionId ? { ...session, screens: session.screens.filter((s) => s.screenId !== item.screenId) } : session));
    setScreenMenuId("");
    setCode("");
    if (activeScreenId === item.screenId) setActiveScreenId("");
  }

  // Local-instant + enqueue. The dial updates immediately from local state (smooth); the
  // PUT is coalesced through flushWrites so we never flood a high-latency link.
  function pushState(nextState: LightingState) {
    if (!active || !screen) return;
    setState(nextState);
    suppressEchoRef.current = true;
    if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null; }
    pendingRef.current = nextState;
    flushWrites();
  }

  // One PUT in flight at a time; when it resolves, send the latest pending value (trailing).
  // This self-throttles to the round-trip cadence and always delivers the final value.
  function flushWrites() {
    if (inFlightRef.current) return;
    const next = pendingRef.current;
    if (!next) { scheduleEchoRelease(); return; }
    if (!active || !screen) { pendingRef.current = null; return; }
    pendingRef.current = null;
    inFlightRef.current = true;
    const sessionId = active.sessionId;
    const screenId = screen.screenId;
    void (async () => {
      try {
        await updateState(sessionId, screenId, next, await getToken());
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not update light state");
      } finally {
        inFlightRef.current = false;
        flushWrites();
      }
    })();
  }

  // Once the queue drains, wait a short grace (bridges the gaps between pointermoves and the
  // post-release settle) and then re-enable echo-apply, reconciling to the latest server
  // value — which by now equals our final committed value, so it's visually a no-op.
  function scheduleEchoRelease() {
    if (releaseTimerRef.current) return;
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      if (inFlightRef.current || pendingRef.current) return;
      suppressEchoRef.current = false;
      setState(latestServerStateRef.current);
    }, 250);
  }

  function setMode(mode: LightingMode) {
    pushState({ ...state, mode });
  }

  function applyCct(temperature: number) {
    pushState({ ...state, mode: "cct", temperature });
    setCctRecents(pushCctRecent(temperature));
  }

  function applyColor(hue: number, saturation: number) {
    pushState({ ...state, mode: "color", hue, saturation });
    setColorRecents(pushColorRecent(hue, saturation));
  }

  // Shared region builders, reused by both the desktop (three-pane) and compact (tabbed)
  // layouts so the two branches can never drift. Compact-only sizing is applied with
  // `max-xl:` utilities, which are inert at the desktop breakpoint.
  const libraryRail = (scroll: boolean) => (
    <>
      <RailSection
        scroll={scroll}
        title="Sessions"
        form={<RailCreate value={sessionName} onChange={setSessionName} onSubmit={addSession} placeholder="Session name" label="Add session" />}
      >
        {sessions.map((session) => (
          <RailRow
            key={session.sessionId}
            name={session.name}
            meta={`${session.screens.length}`}
            selected={session.sessionId === activeSessionId && !activeScreenId}
            menuOpen={sessionMenuId === session.sessionId}
            onSelect={() => selectSession(session)}
            onToggleMenu={() => { setScreenMenuId(""); setSessionMenuId(sessionMenuId === session.sessionId ? "" : session.sessionId); }}
            menu={(
              <>
                <MenuItem onClick={() => copySessionLink(session)}>Copy link</MenuItem>
                <MenuItem danger onClick={() => removeSession(session)}>Delete session</MenuItem>
              </>
            )}
          />
        ))}
        {!workspaceLoaded ? <EmptyText>Loading your sessions…</EmptyText> : null}
        {workspaceLoaded && !sessions.length ? <EmptyText>Create a session to begin.</EmptyText> : null}
      </RailSection>

      <div className="h-px shrink-0 bg-sc-border" />

      <RailSection
        scroll={scroll}
        title="Screens"
        form={<RailCreate value={screenName} onChange={setScreenName} onSubmit={addScreen} placeholder="Screen name" label="Add screen" disabled={!active} />}
      >
        {active?.screens.map((item) => (
          <RailRow
            key={item.screenId}
            name={item.name}
            dot
            selected={item.screenId === activeScreenId}
            menuOpen={screenMenuId === item.screenId}
            onSelect={() => selectScreen(item)}
            onToggleMenu={() => { setSessionMenuId(""); setScreenMenuId(screenMenuId === item.screenId ? "" : item.screenId); }}
            menu={(
              <>
                <MenuItem onClick={() => copyScreenLink(item)}>Copy link</MenuItem>
                <MenuItem danger onClick={() => removeScreen(item)}>Delete screen</MenuItem>
              </>
            )}
          />
        ))}
        {!active ? <EmptyText>Select a session first.</EmptyText> : null}
        {active && !active.screens.length ? <EmptyText>Create a screen to control lighting.</EmptyText> : null}
      </RailSection>
    </>
  );

  const sharePanelEl = screen ? (
    <SharePanel title={screen.name} code={code} error={error} onGenerate={generateCode} onCopyLink={() => copyScreenLink(screen)} onCopyCode={copyCode} />
  ) : active ? (
    <SharePanel title={`${active.name} root`} code={code} error={error} onGenerate={generateCode} onCopyLink={() => copySessionLink(active)} onCopyCode={copyCode} />
  ) : null;

  const lightingPanel = (
    <Panel className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <Kicker>Fill light</Kicker>
        <Segmented
          value={state.mode}
          onChange={setMode}
          options={[{ value: "cct", label: "White" }, { value: "color", label: "Color" }]}
        />
      </div>

      {state.mode === "cct" ? (
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[5rem_minmax(0,1fr)_5rem] gap-3 max-xl:h-[min(20rem,45dvh)] max-xl:flex-none">
          <FaderColumn label="CCT" value={`${Math.round(state.temperature)}K`}>
            <Slider
              orientation="vertical"
              value={state.temperature}
              min={minTemperature}
              max={maxTemperature}
              step={50}
              ariaLabel="Color temperature"
              trackStyle={{ background: "linear-gradient(to top, #ff8a3d 0%, #ffd6a0 24%, #f4f6ff 50%, #cfe5ff 74%, #8ec5ff 100%)" }}
              onChange={(temperature) => pushState({ ...state, temperature })}
              onCommit={(temperature) => setCctRecents(pushCctRecent(temperature))}
            />
          </FaderColumn>
          <div className="flex min-h-0 flex-col items-stretch justify-center gap-2">
            {cctPresets.map((preset) => (
              <PresetChip key={preset} color={kelvinToCssColor(preset)} label={`${preset}K`} active={state.temperature === preset} onClick={() => applyCct(preset)} />
            ))}
          </div>
          <FaderColumn label="Brightness" value={`${Math.round(state.brightness * 100)}%`}>
            <Slider
              orientation="vertical"
              value={state.brightness}
              min={0}
              max={1}
              step={0.01}
              ariaLabel="Brightness"
              trackStyle={{ background: "rgba(255,255,255,0.07)" }}
              fillStyle={{ background: lightingCssColor(state) }}
              onChange={(brightness) => pushState({ ...state, brightness })}
            />
          </FaderColumn>
        </div>
      ) : (
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_5rem] gap-4 max-xl:h-[min(20rem,45dvh)] max-xl:flex-none">
          <div className="flex min-h-0 items-center justify-center">
            <ColorWheel
              hue={state.hue}
              saturation={state.saturation}
              onChange={(hue, saturation) => pushState({ ...state, hue, saturation })}
              onCommit={(hue, saturation) => setColorRecents(pushColorRecent(hue, saturation))}
            />
          </div>
          <FaderColumn label="Brightness" value={`${Math.round(state.brightness * 100)}%`}>
            <Slider
              orientation="vertical"
              value={state.brightness}
              min={0}
              max={1}
              step={0.01}
              ariaLabel="Brightness"
              trackStyle={{ background: "rgba(255,255,255,0.07)" }}
              fillStyle={{ background: lightingCssColor(state) }}
              onChange={(brightness) => pushState({ ...state, brightness })}
            />
          </FaderColumn>
        </div>
      )}

      <RecentsRow mode={state.mode} cct={cctRecents} color={colorRecents} onPickCct={applyCct} onPickColor={applyColor} />
    </Panel>
  );

  const screensListPanel = (
    <Panel className="flex min-h-0 flex-col max-xl:h-[min(20rem,45dvh)]">
      <div className="flex items-center justify-between gap-3">
        <Kicker>Screens</Kicker>
        <span className="text-[12px] text-sc-faint tabular-nums">{active?.screens.length ?? 0}</span>
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {active?.screens.map((item) => (
          <button
            key={item.screenId}
            type="button"
            onClick={() => selectScreen(item)}
            className="flex h-12 w-full items-center justify-between rounded-sc-control border border-sc-border bg-sc-card px-4 text-left transition hover:border-sc-border-strong hover:bg-sc-elevated"
          >
            <span className="truncate text-[14px] font-medium text-sc-text">{item.name}</span>
            <span className="shrink-0 text-[12px] text-sc-faint">Open ›</span>
          </button>
        ))}
        {active && !active.screens.length ? <CenterNote title="No screens yet" body="Create a screen in the left rail to control lighting." /> : null}
      </div>
    </Panel>
  );

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-sc-bg text-sc-text">
      <SoftcastHeader action={<AuthControls />} onBrandClick={() => setShowClientConfirm(true)} />
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] border-t border-black">
          <aside className="flex min-h-0 flex-col border-r border-sc-border bg-sc-rail">
            {libraryRail(true)}
          </aside>

          <section className="flex min-h-0 flex-col">
            <ContextBar sessionName={active?.name} screenName={screen?.name} hasSession={Boolean(active)} />
            <div className="grid min-h-0 flex-1 grid-cols-[24rem_minmax(0,1fr)] gap-4 p-4">
              {!active ? (
                <>
                  <Panel><CenterNote title="No session selected" body="Create or pick a session in the left rail to begin." /></Panel>
                  <Panel><CenterNote title="Nothing to preview" body="A session groups screens. Select a screen to control a light." /></Panel>
                </>
              ) : screen ? (
                <>
                  <div className="flex min-h-0 flex-col gap-4">
                    {sharePanelEl}
                    {lightingPanel}
                  </div>
                  <div className="min-h-0 overflow-hidden rounded-sc-panel border border-sc-border bg-black">
                    <ScreenRenderer state={state} preview />
                  </div>
                </>
              ) : (
                <>
                  {sharePanelEl}
                  {screensListPanel}
                </>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-black">
          <ContextBar sessionName={active?.name} screenName={screen?.name} hasSession={Boolean(active)} />
          <TabBar
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { value: "library", label: "Library" },
              { value: "control", label: "Control", disabled: !active },
              { value: "preview", label: "Preview", disabled: !screen },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "library" ? (
              <div className="bg-sc-rail">{libraryRail(false)}</div>
            ) : activeTab === "control" ? (
              active ? (
                <div className="flex flex-col gap-4 p-4">
                  {sharePanelEl}
                  {screen ? lightingPanel : screensListPanel}
                </div>
              ) : (
                <div className="p-4"><Panel><CenterNote title="No session selected" body="Pick or create a session in the Library tab." /></Panel></div>
              )
            ) : screen ? (
              <div className="h-full p-4">
                <div className="h-full min-h-[260px] overflow-hidden rounded-sc-panel border border-sc-border bg-black">
                  <ScreenRenderer state={state} preview />
                </div>
              </div>
            ) : (
              <div className="p-4"><Panel><CenterNote title="Nothing to preview" body="Select a screen to control and preview a light." /></Panel></div>
            )}
          </div>
        </div>
      )}
      {showClientConfirm ? <ClientConfirmModal onCancel={() => setShowClientConfirm(false)} /> : null}
      {backendModalMessage ? <BackendUnavailableModal message={backendModalMessage} /> : null}
    </main>
  );
}

function ContextBar({ sessionName, screenName, hasSession }: { sessionName?: string; screenName?: string; hasSession: boolean }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sc-border px-5">
      <span className="truncate text-[13px] text-sc-muted">{sessionName || "No session"}</span>
      {hasSession ? (
        <>
          <span className="text-sc-faint">›</span>
          <span className="truncate text-[16px] font-semibold text-sc-text">{screenName || "root"}</span>
        </>
      ) : null}
    </div>
  );
}

// `scroll` (default true) is the desktop rail behavior: the section fills the rail and its
// list scrolls internally. In the compact Library tab the whole pane scrolls as one, so the
// sections flow naturally (scroll=false) and don't fight the outer scroll region.
function RailSection({ title, form, children, scroll = true }: { title: string; form: ReactNode; children: ReactNode; scroll?: boolean }) {
  return (
    <section className={`flex flex-col p-3 ${scroll ? "min-h-0 flex-1" : ""}`}>
      <Kicker>{title}</Kicker>
      <div className="mt-2 shrink-0">{form}</div>
      <div className={`mt-2 space-y-1 ${scroll ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>{children}</div>
    </section>
  );
}

function TabBar({ value, onChange, tabs }: { value: TabKey; onChange: (value: TabKey) => void; tabs: { value: TabKey; label: string; disabled?: boolean }[] }) {
  return (
    <div role="tablist" aria-label="Admin sections" className="flex shrink-0 gap-0.5 border-b border-sc-border bg-sc-rail p-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          disabled={tab.disabled}
          onClick={() => onChange(tab.value)}
          className={`h-9 flex-1 rounded-sc-control text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:text-sc-faint disabled:opacity-40 ${value === tab.value ? "bg-sc-elevated text-sc-text" : "text-sc-muted enabled:hover:text-sc-text"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RailCreate({ value, onChange, onSubmit, placeholder, label, disabled }: { value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; placeholder: string; label: string; disabled?: boolean }) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <FieldInput aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="flex-1" />
      <SecondaryButton type="submit" disabled={disabled} aria-label={label} className="shrink-0 px-3 text-[18px] leading-none">+</SecondaryButton>
    </form>
  );
}

function RailRow({ name, meta, dot, selected, menuOpen, onSelect, onToggleMenu, menu }: {
  name: string;
  meta?: string;
  dot?: boolean;
  selected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  menu: ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={`flex h-11 flex-1 items-center gap-2 rounded-sc-control border px-3 text-left transition ${selected ? "border-sc-border-strong bg-sc-elevated text-sc-text" : "border-transparent text-sc-muted hover:bg-sc-card hover:text-sc-text"}`}
      >
        {dot ? <span className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-sc-text" : "bg-sc-faint"}`} /> : null}
        <span className="flex-1 truncate text-[14px] font-medium">{name}</span>
        {meta ? <span className="shrink-0 text-[12px] text-sc-faint tabular-nums">{meta}</span> : null}
      </button>
      <button
        type="button"
        aria-label={`Open ${name} menu`}
        onClick={onToggleMenu}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sc-control text-[18px] leading-none transition ${menuOpen ? "bg-sc-card text-sc-text" : "text-sc-faint hover:bg-sc-card hover:text-sc-text"}`}
      >
        ⋯
      </button>
      {menuOpen ? <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-sc-card border border-sc-border bg-sc-elevated shadow-2xl">{menu}</div> : null}
    </div>
  );
}

function MenuItem({ children, danger = false, onClick }: { children: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`block h-9 w-full px-3 text-left text-[13px] transition hover:bg-white/[0.08] ${danger ? "text-sc-danger" : "text-sc-muted hover:text-sc-text"}`}>{children}</button>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-h-0 rounded-sc-panel border border-sc-border bg-sc-panel p-4 ${className}`}>{children}</section>;
}

function Segmented({ value, onChange, options }: { value: LightingMode; onChange: (value: LightingMode) => void; options: { value: LightingMode; label: string }[] }) {
  return (
    <div className="inline-flex rounded-sc-control border border-sc-border bg-sc-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-8 rounded-[4px] px-4 text-[13px] font-semibold transition ${value === option.value ? "bg-sc-elevated text-sc-text" : "text-sc-muted hover:text-sc-text"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FaderColumn({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col items-center rounded-sc-card border border-sc-border bg-black/40 px-2 py-3">
      <p className="text-[12px] font-semibold text-sc-muted">{label}</p>
      <p className="mt-1 truncate text-[19px] font-semibold leading-none tabular-nums text-sc-text">{value}</p>
      <div className="mt-3 flex min-h-0 w-full flex-1 justify-center">{children}</div>
    </div>
  );
}

function PresetChip({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-sc-control border px-3 text-left text-[13px] font-medium transition ${active ? "border-sc-border-strong bg-sc-elevated text-sc-text" : "border-sc-border bg-sc-card text-sc-muted hover:text-sc-text"}`}
    >
      <span className="h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
      <span className="truncate tabular-nums">{label}</span>
    </button>
  );
}

function RecentsRow({ mode, cct, color, onPickCct, onPickColor }: {
  mode: LightingMode;
  cct: number[];
  color: ColorRecent[];
  onPickCct: (temperature: number) => void;
  onPickColor: (hue: number, saturation: number) => void;
}) {
  const empty = mode === "cct" ? !cct.length : !color.length;
  return (
    <div className="mt-3 flex h-9 shrink-0 items-center gap-2">
      <span className="text-[11px] font-medium text-sc-faint">Recent</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {mode === "cct"
          ? cct.map((temperature) => <Swatch key={temperature} color={kelvinToCssColor(temperature)} title={`${temperature}K`} onClick={() => onPickCct(temperature)} />)
          : color.map((item, index) => <Swatch key={`${item.hue}-${item.saturation}-${index}`} color={hsvToCssColor(item.hue, item.saturation, 1)} title={`H${Math.round(item.hue)} S${Math.round(item.saturation * 100)}`} onClick={() => onPickColor(item.hue, item.saturation)} />)}
        {empty ? <span className="text-[12px] text-sc-faint">None yet</span> : null}
      </div>
    </div>
  );
}

function Swatch({ color, title, onClick }: { color: string; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="h-7 w-7 shrink-0 rounded-full border border-sc-border-strong" style={{ background: color }} />;
}

function SharePanel({ title, code, error, onGenerate, onCopyLink, onCopyCode }: {
  title: string;
  code: string;
  error: string;
  onGenerate: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
}) {
  return (
    <Panel className="shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Kicker>Verification</Kicker>
          <h2 className="mt-2 truncate text-[18px] font-semibold text-sc-text">{title}</h2>
        </div>
        <div className="flex shrink-0 gap-2">
          <SecondaryButton type="button" onClick={onCopyLink}>Copy link</SecondaryButton>
          <PrimaryButton type="button" onClick={onGenerate}>Generate</PrimaryButton>
        </div>
      </div>
      <div className="mt-4 rounded-sc-card border border-sc-border-strong bg-sc-primary p-3 text-sc-primary-fg">
        <div className="flex h-8 items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">Code</p>
          {code ? <button type="button" onClick={onCopyCode} className="h-8 rounded-sc-control bg-black px-3 text-[12px] font-semibold text-white transition hover:bg-black/80">Copy</button> : null}
        </div>
        <input readOnly value={code} placeholder="— — — — — —" onFocus={(event) => event.currentTarget.select()} className="mt-2 h-12 w-full select-all rounded-sc-control border border-black/10 bg-black/[0.04] px-3 text-center text-[30px] font-semibold tracking-[0.16em] text-black outline-none placeholder:text-black/25 focus:border-black/30" />
      </div>
      {error && !isBackendUnavailableMessage(error) ? <p className="mt-3 text-[13px] text-sc-danger">{error}</p> : null}
    </Panel>
  );
}

function CenterNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center">
      <p className="text-[15px] font-semibold text-sc-text">{title}</p>
      <p className="mt-1 max-w-[280px] text-[13px] leading-5 text-sc-muted">{body}</p>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="px-1 py-2 text-[12px] leading-5 text-sc-faint">{children}</p>;
}

function upsertSession(sessions: SessionSummary[], next: SessionSummary) {
  const existing = sessions.find((session) => session.sessionId === next.sessionId);
  if (!existing) return [next, ...sessions];
  return sessions.map((session) => session.sessionId === next.sessionId ? { ...next, screens: existing.screens } : session);
}

function upsertScreen(screens: ScreenSummary[], next: ScreenSummary) {
  return screens.some((screen) => screen.screenId === next.screenId) ? screens.map((screen) => screen.screenId === next.screenId ? next : screen) : [...screens, next];
}

function ClientConfirmModal({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-md">
      <section className="w-full max-w-[360px] rounded-sc-dialog border border-sc-border-strong bg-sc-panel p-5 text-center shadow-2xl">
        <div className="mx-auto h-3 w-3 rounded-full bg-sc-primary" />
        <h2 className="mt-4 text-[22px] font-semibold text-sc-text">Go to client page?</h2>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-5 text-sc-muted">This leaves the admin console and returns to the verification code screen.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={() => { window.location.href = "/"; }}>Go to client</PrimaryButton>
        </div>
      </section>
    </div>
  );
}
