'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ttsCues from '../../video-generation-flow/config/tts-cues.json';
import scenesConfig from '../../video-generation-flow/config/scenes.json';

/* ─── config ─── */
const SCENE_COLORS = ['#4338CA', '#16A34A', '#2563EB', '#D97706', '#7C3AED', '#A21CAF', '#5B52F0'];
const AUDIO_COLORS = ['#3730A3', '#1E40AF', '#0C4A6E', '#14532D', '#78350F', '#881337'];

type Word = { word: string; startMs: number; endMs: number };
type Cue = { file: string; ms: number; durationMs: number; text?: string; note?: string; words?: Word[] };
type Clip = { label: string; ms: number; dur: number; color: string; index: number };
type Cfg = { cues: Cue[]; clickCues: { ms: number }[]; clips: Clip[]; totalMs: number };

// Scene clips on the timeline — start = cumulative sum of durations.
function buildClips(scenes: { name: string; durationMs: number }[]): Clip[] {
  let acc = 0;
  return scenes.map((s, i) => {
    const ms = acc; acc += s.durationMs;
    return { label: s.name, ms, dur: s.durationMs, color: SCENE_COLORS[i % SCENE_COLORS.length], index: i };
  });
}
function buildCfg(cues: any, scenes: any): Cfg {
  return {
    cues: cues.ttsCues ?? [],
    clickCues: cues.clickCues ?? [],
    clips: buildClips(scenes.scenes ?? []),
    totalMs: cues.totalDurationMs ?? scenes.totalDurationMs ?? 50000,
  };
}

/* ─── helpers ─── */
function pct(ms: number, total: number) { return (ms / total) * 100; }
function fmt(ms: number) { const sec = (ms / 1000) % 60; return `0:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`; }

type Stale = { scenes: boolean[]; final: boolean; haveFinal: boolean };

/* ─── component ─── */
export default function Studio() {
  /* preview */
  const [videoVersion, setVer]  = useState(0);          // cache-bust: bump to reload the <video>
  const [videoErrored, setVideoErrored] = useState(false); // overlay shows only when the <video> truly fails to load
  const videoRef  = useRef<HTMLVideoElement>(null);

  /* projects (left sidebar) + active project's config */
  const [projects, setProjects] = useState<{ id: string; label: string; hasVideo?: boolean }[]>([]);
  const [activeProject, setActiveProject] = useState('superflow-demo');
  const [cfg, setCfg] = useState<Cfg>(() => buildCfg(ttsCues, scenesConfig));
  const isEditable = activeProject === 'superflow-demo';   // only the live superflow project can be re-recorded

  /* playback — currentMs is derived from the video's currentTime (single master clock) */
  const [playing, setPlaying]   = useState(false);
  const [currentMs, setCurrent] = useState(0);
  const currentMsRef = useRef(0);
  currentMsRef.current = currentMs;
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  /* pipeline */
  const [running, setRunning]   = useState<string | null>(null);
  const [logs, setLogs]         = useState<string[]>([]);
  const [qaText, setQaText]     = useState('');
  const [showPanel, setShowPanel] = useState<'logs' | 'qa' | 'translate' | null>(null);
  const [stale, setStale]       = useState<Stale>({ scenes: [], final: false, haveFinal: true });

  /* translate */
  const [langs, setLangs]     = useState<{ id: string; name: string }[]>([]);
  const [trLang, setTrLang]   = useState('tamil');
  const [trInput, setTrInput] = useState('');
  const [trOutput, setTrOutput] = useState('');
  const [trBusy, setTrBusy]   = useState(false);

  /* refs */
  const trackRef       = useRef<HTMLDivElement>(null);
  const logsEndRef     = useRef<HTMLDivElement>(null);
  const scriptItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ── master clock: read video.currentTime every frame while playing ── */
  useEffect(() => {
    if (!playing) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const v = videoRef.current;
      if (v && !isDraggingRef.current) setCurrent(v.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const activeClip     = cfg.clips.find(c => currentMs >= c.ms && currentMs < c.ms + c.dur);
  const activeCue      = cfg.cues.find(c => currentMs >= c.ms && currentMs < c.ms + c.durationMs);
  const activeCueRelMs = activeCue ? currentMs - activeCue.ms : 0;

  /* ── auto-scroll script panel to active cue ── */
  useEffect(() => {
    const idx = cfg.cues.findIndex(c => c.file === activeCue?.file);
    if (idx >= 0) scriptItemRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeCue?.file]); // eslint-disable-line

  /* ── transport (native video) ── */
  function play()  { videoRef.current?.play().catch(() => {}); }
  function pause() { videoRef.current?.pause(); }
  function stop()  { const v = videoRef.current; if (v) { v.pause(); v.currentTime = 0; setCurrent(0); } }

  function seekTo(ms: number) {
    const clamped = Math.max(0, Math.min(cfg.totalMs, ms));
    const v = videoRef.current;
    if (v) v.currentTime = clamped / 1000;
    setCurrent(clamped);
  }

  /* ── spacebar play/pause ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (videoRef.current?.paused) play(); else pause();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── scrub: native currentTime, frame-accurate, no reload ── */
  function msFromX(clientX: number) {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return currentMsRef.current;
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * cfg.totalMs);
  }
  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation(); e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    seekTo(msFromX(e.clientX));
  }
  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.body.style.cursor = '';
  }
  function clickTrack(e: React.MouseEvent<HTMLDivElement>) { seekTo(msFromX(e.clientX)); }

  /* ── staleness (only meaningful for the editable superflow project) ── */
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/status');
      if (!r.ok) return;
      const d = await r.json();
      if (d.stale) setStale(d.stale);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  /* ── projects ── */
  useEffect(() => {
    fetch('/api/studio/projects').then(r => r.json()).then(d => { if (d.projects) setProjects(d.projects); }).catch(() => {});
    fetch('/api/studio/languages').then(r => r.json()).then(d => { if (d.languages?.length) { setLangs(d.languages); setTrLang(d.languages[0].id); } }).catch(() => {});
  }, []);
  // Load the active project's cues + scenes for the script panel + timeline.
  useEffect(() => {
    fetch(`/api/studio/project-config?project=${activeProject}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCfg({ cues: d.cues, clickCues: d.clickCues || [], clips: buildClips(d.scenes), totalMs: d.totalMs }); })
      .catch(() => {});
  }, [activeProject]);
  function selectProject(id: string) {
    if (id === activeProject) return;
    setActiveProject(id);
    setVer(v => v + 1);   // reload the <video> with the new project's file
    setCurrent(0);
    setPlaying(false);
  }

  /* ── pipeline (SSE) ── */
  async function runSSE(endpoint: string, label: string, body?: unknown) {
    if (running) return;
    setRunning(label); setLogs([]); setShowPanel('logs');
    try {
      const res = await fetch(`/api/studio/${endpoint}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          dec.decode(value).split('\n').forEach(l => {
            if (l.startsWith('data: ')) setLogs(p => [...p.slice(-300), l.slice(6)]);
          });
        }
      }
    } finally {
      setRunning(null);
      setVer(v => v + 1);     // reload the <video> with the fresh output
      refreshStatus();
    }
  }

  async function runQA() {
    if (running) return;
    setRunning('qa'); setLogs([]); setShowPanel('logs');
    try {
      const res = await fetch('/api/studio/qa', { method: 'POST' });
      const d = await res.json();
      if (d.report) { setQaText(d.report); setShowPanel('qa'); }
    } finally { setRunning(null); }
  }

  async function runTranslate() {
    if (trBusy || !trInput.trim()) return;
    setTrBusy(true); setTrOutput('');
    try {
      const res = await fetch('/api/studio/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: trLang, text: trInput }),
      });
      const d = await res.json();
      setTrOutput(d.translation || (d.error ? `⚠ ${d.error}` : ''));
    } catch (e: any) { setTrOutput(`⚠ ${e.message}`); }
    finally { setTrBusy(false); }
  }

  const busy = running !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#0D0D0D', color: '#E0E0E0', fontFamily: 'ui-monospace,"SF Mono",monospace' }}>

      {/* ══ HEADER + ACTIONS ══ */}
      <div style={{ height: 42, borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, flexShrink: 0, background: '#0A0A0A' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Studio <span style={{ color: '#0EA5E9' }}>Ads</span></span>
        <span style={{ width: 1, height: 18, background: '#222', margin: '0 4px' }} />
        {isEditable ? (
          <>
            <Btn label="Rec All"   color="#7C3AED" busy={busy} on={() => runSSE('record-scenes', 'rec all')} />
            <Btn label="Assemble"  color="#2563EB" busy={busy} on={() => runSSE('assemble', 'assemble')} />
            <Btn label="Mix"       color="#16A34A" busy={busy} on={() => runSSE('mix', 'mix')} />
            <Btn label="QA"        color="#D97706" busy={busy} on={runQA} />
            {stale.final && <span title="final video is stale — re-assemble" style={{ fontSize: 10, color: '#EAB308' }}>● final stale</span>}
          </>
        ) : (
          <span style={{ fontSize: 10, color: '#555' }}>imported clip · read-only</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {running && <span style={{ fontSize: 10, color: '#EAB308' }}>● {running}…</span>}
          <Btn label="Translate" color="#0EA5E9" busy={false} on={() => setShowPanel(showPanel === 'translate' ? null : 'translate')} />
        </div>
      </div>

      {/* ══ PREVIEW + SCRIPT ══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Projects sidebar */}
        <div style={{ width: 150, flexShrink: 0, background: '#0A0A0A', borderRight: '1px solid #1A1A1A', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 12px 8px', fontSize: 10, color: '#333', fontWeight: 700, letterSpacing: 1 }}>PROJECTS</div>
          {projects.map(p => {
            const active = p.id === activeProject;
            return (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                title={p.label}
                style={{
                  padding: '8px 12px',
                  borderLeft: `3px solid ${active ? '#5B52F0' : 'transparent'}`,
                  background: active ? '#15131F' : 'transparent',
                  color: active ? '#E0E0E0' : '#777',
                  cursor: 'pointer', fontSize: 11,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >{p.label}</div>
            );
          })}
        </div>

        {/* Preview — whole video, scaled as large as fits (no crop), centered. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden', position: 'relative' }}>
          <video
            ref={videoRef}
            key={`${activeProject}-${videoVersion}`}
            src={`/api/studio/video?project=${activeProject}&v=${videoVersion}`}
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onSeeked={() => { const v = videoRef.current; if (v) setCurrent(v.currentTime * 1000); }}
            onTimeUpdate={() => { const v = videoRef.current; if (v && !playing && !isDraggingRef.current) setCurrent(v.currentTime * 1000); }}
            onLoadStart={() => setVideoErrored(false)}
            onError={() => setVideoErrored(true)}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
          {videoErrored && (
            <div style={{ position: 'absolute', fontSize: 12, color: '#666', textAlign: 'center', lineHeight: 1.8 }}>
              {isEditable
                ? <>No assembled video yet.<br />Click <b style={{ color: '#7C3AED' }}>Rec All</b> → <b style={{ color: '#2563EB' }}>Assemble</b>.</>
                : <>No video in this project yet.</>}
            </div>
          )}
        </div>

        {/* Script panel */}
        <div style={{ width: 300, flexShrink: 0, background: '#080808', borderLeft: '1px solid #1A1A1A', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '12px 14px 8px', fontSize: 10, color: '#333', fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>SCRIPT</div>
          {cfg.cues.map((cue, i) => {
            const isActive = activeCue?.file === cue.file;
            return (
              <div
                key={cue.file}
                ref={el => { scriptItemRefs.current[i] = el; }}
                onClick={() => seekTo(cue.ms)}
                style={{
                  padding: '10px 14px',
                  borderLeft: `3px solid ${isActive ? '#EF4444' : 'transparent'}`,
                  background: isActive ? '#1A0808' : 'transparent',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 9, color: isActive ? '#EF4444' : '#2A2A2A', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(cue.ms)} · {cue.file}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7, overflowWrap: 'break-word' }}>
                  {isActive && cue.words?.length
                    ? cue.words.map((w, wi) => {
                        const isCurrent = activeCueRelMs >= w.startMs && activeCueRelMs < w.endMs;
                        const isSpoken  = activeCueRelMs >= w.endMs;
                        return (
                          <span key={wi} style={{
                            color: isCurrent ? '#FF6B6B' : isSpoken ? '#E0E0E0' : '#555',
                            fontWeight: isCurrent ? 700 : 400,
                            marginRight: 3, display: 'inline',
                            transition: 'color 80ms ease',
                            textDecoration: isCurrent ? 'underline' : 'none',
                          }}>{w.word}</span>
                        );
                      })
                    : <span style={{ color: isActive ? '#E0E0E0' : '#3A3A3A' }}>{cue.text ?? cue.note}</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* ══ TRANSPORT ══ */}
      <div style={{ height: 36, borderTop: '1px solid #1E1E1E', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, background: '#0A0A0A', flexShrink: 0 }}>
        <button onClick={() => (videoRef.current?.paused ? play() : pause())} style={iconBtn('#5B52F0')}>{playing ? '⏸' : '▶'}</button>
        <button onClick={stop} style={iconBtn('#333')}>⏹</button>
        <span style={{ fontSize: 12, color: '#ccc', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>{fmt(currentMs)}</span>
        <span style={{ fontSize: 11, color: '#333' }}>/ {fmt(cfg.totalMs)}</span>
        {activeClip && <span style={{ fontSize: 10, color: '#555', marginLeft: 8 }}>{activeClip.label}</span>}
      </div>

      {/* ══ TIMELINE ══ */}
      <div ref={trackRef} onClick={clickTrack} style={{ height: 168, borderTop: '1px solid #1E1E1E', background: '#0D0D0D', flexShrink: 0, position: 'relative', cursor: 'crosshair', display: 'flex', flexDirection: 'column' }}>

        {/* Playhead */}
        <div style={{ position: 'absolute', left: `${pct(currentMs, cfg.totalMs)}%`, top: 0, bottom: 0, width: 2, background: '#EF4444', zIndex: 20, pointerEvents: 'none', boxShadow: '0 0 6px #EF4444aa' }}>
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={() => { isDraggingRef.current = false; document.body.style.cursor = ''; }}
            style={{
              position: 'absolute', top: -4, left: -14, width: 30, height: 30,
              background: '#EF4444', borderRadius: '50%', cursor: 'grab',
              pointerEvents: 'all', touchAction: 'none',
              boxShadow: '0 0 0 2px #FF6B6B44, 0 2px 8px #0008',
            }}
          />
        </div>

        {/* Ruler */}
        <div style={{ height: 22, background: '#0A0A0A', borderBottom: '1px solid #1E1E1E', position: 'relative', pointerEvents: 'none' }}>
          {[0,5,10,15,20,25,30,35,40,45,50].filter(s => s * 1000 <= cfg.totalMs + 500).map(s => (
            <div key={s} style={{ position: 'absolute', left: `${pct(s * 1000, cfg.totalMs)}%`, bottom: 3, transform: 'translateX(-50%)' }}>
              <span style={{ fontSize: 9, color: '#444', whiteSpace: 'nowrap' }}>{s}s</span>
            </div>
          ))}
        </div>

        {/* Scene/part clips — per-scene Record button + staleness dot only for the editable project */}
        <div style={{ height: 62, position: 'relative', borderBottom: '1px solid #1A1A1A' }}>
          {cfg.clips.map(c => {
            const active = activeClip?.label === c.label;
            const isStale = stale.scenes[c.index];
            return (
              <div key={c.label} style={{
                position: 'absolute', left: `${pct(c.ms, cfg.totalMs)}%`, width: `calc(${pct(c.dur, cfg.totalMs)}% - 2px)`,
                top: 7, bottom: 7,
                background: c.color + (active ? 'AA' : '2A'),
                border: `1px solid ${c.color}${active ? 'FF' : '55'}`,
                borderRadius: 5, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 6px',
                boxShadow: active ? `0 0 14px ${c.color}44` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
                  {isEditable && <span style={{ width: 6, height: 6, borderRadius: '50%', background: isStale ? '#EAB308' : '#16A34A', flexShrink: 0 }} title={isStale ? 'stale — re-record' : 'fresh'} />}
                  <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#fff' : c.color, whiteSpace: 'nowrap', overflow: 'hidden' }}>{c.label}</span>
                </div>
                {isEditable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); runSSE('record-scene', `rec ${c.label}`, { n: c.index }); }}
                    disabled={busy}
                    title={`re-record ${c.label} → scene-${c.index}.mp4`}
                    style={{ pointerEvents: 'all', alignSelf: 'stretch', background: '#0008', border: `1px solid ${c.color}77`, color: '#bbb', borderRadius: 3, padding: '1px 4px', fontSize: 8, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 3 }}
                  ><span style={{ color: '#EF4444' }}>⏺</span>scene-{c.index}.mp4</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Audio track */}
        <div style={{ height: 44, position: 'relative', borderBottom: '1px solid #1A1A1A' }}>
          {cfg.cues.map((cue, i) => {
            const active = activeCue?.file === cue.file;
            const col = AUDIO_COLORS[i % AUDIO_COLORS.length];
            return (
              <div key={cue.file} style={{
                position: 'absolute', left: `${pct(cue.ms, cfg.totalMs)}%`, width: `calc(${pct(cue.durationMs, cfg.totalMs)}% - 2px)`,
                top: 8, bottom: 8,
                background: col + (active ? 'DD' : '55'),
                border: `1px solid ${col}${active ? 'FF' : '77'}`,
                borderRadius: 4, overflow: 'hidden', pointerEvents: 'none',
                display: 'flex', alignItems: 'center', padding: '0 5px',
                boxShadow: active ? `0 0 8px ${col}55` : 'none',
              }}>
                <span style={{ fontSize: 8, color: active ? '#fff' : '#aaa', whiteSpace: 'nowrap', fontWeight: active ? 700 : 400 }}>{cue.file}</span>
              </div>
            );
          })}
        </div>

        {/* Click markers */}
        <div style={{ height: 20, position: 'relative', pointerEvents: 'none' }}>
          {cfg.clickCues.map(c => (
            <div key={c.ms} style={{ position: 'absolute', left: `${pct(c.ms, cfg.totalMs)}%`, top: 5, bottom: 5, width: 2, background: '#EAB308', borderRadius: 1 }} />
          ))}
        </div>
      </div>

      {/* ══ SLIDE-UP PANEL ══ */}
      {showPanel && (
        <div style={{ position: 'fixed', bottom: 168 + 36 + 1, left: 0, right: 0, height: showPanel === 'translate' ? 340 : 200, background: '#0C0C0C', borderTop: '1px solid #2A2A2A', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #1E1E1E', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1 }}>{showPanel.toUpperCase()}</span>
            <button onClick={() => setShowPanel(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>✕</button>
          </div>

          {showPanel === 'translate' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={trLang} onChange={e => setTrLang(e.target.value)}
                  style={{ background: '#1A1A1A', color: '#E0E0E0', border: '1px solid #2A2A2A', borderRadius: 5, padding: '4px 8px', fontSize: 11, fontFamily: 'inherit' }}>
                  {langs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <Btn label={trBusy ? '…' : 'Translate'} color="#0EA5E9" busy={trBusy} on={runTranslate} />
                <span style={{ fontSize: 9, color: '#444' }}>English → {langs.find(l => l.id === trLang)?.name}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 8, minHeight: 0 }}>
                <textarea value={trInput} onChange={e => setTrInput(e.target.value)} placeholder="English text to translate…"
                  style={{ flex: 1, resize: 'none', background: '#080808', color: '#E0E0E0', border: '1px solid #1E1E1E', borderRadius: 6, padding: 10, fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', outline: 'none' }} />
                <div onClick={() => trOutput && navigator.clipboard?.writeText(trOutput)} title="click to copy"
                  style={{ flex: 1, overflowY: 'auto', background: '#0A0F0A', color: '#E0E0E0', border: '1px solid #14532D', borderRadius: 6, padding: 10, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', cursor: trOutput ? 'copy' : 'default' }}>
                  {trOutput || <span style={{ color: '#444' }}>translation appears here (click to copy)</span>}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontSize: 10, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#555' }}>
              {showPanel === 'logs'
                ? logs.map((l, i) => <div key={i} style={{ color: l.startsWith('[') ? '#EF4444' : l.startsWith('▶') ? '#5B52F0' : '#555' }}>{l}</div>)
                : qaText
              }
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── micro components ─── */
function Btn({ label, color, busy, on }: { label: string; color: string; busy: boolean; on: () => void }) {
  return (
    <button onClick={on} disabled={busy} style={{ background: busy ? '#1A1A1A' : color, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}>
      {label}
    </button>
  );
}

function iconBtn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid #2A2A2A', color: '#fff', borderRadius: 5, width: 30, height: 30, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 };
}
