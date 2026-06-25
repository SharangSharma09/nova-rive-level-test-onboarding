'use client';

import { useEffect, useRef, useState } from 'react';

interface Avatar {
  key: string;
  role: string;
  name: string;
  thumb: string;
  heygenLookId?: string;
  heygenEngine?: string;
  cartesiaVoiceId?: string;
  cartesiaModel?: string;
}

interface Language {
  id: string;
  name: string;
}

interface Layout {
  id: string;
  name: string;
  preview?: string;
}

interface ResultEntry {
  lang: string;
  layout: string;
  file: string;
}

function extractLabels(script: string): string[] {
  const labels = new Set<string>();
  for (const line of script.split('\n')) {
    const m = /^([A-Za-z][A-Za-z0-9 _-]*?):\s*.+$/.exec(line.trim());
    if (m) labels.add(m[1]);
  }
  return [...labels];
}

// Split a labelled script into ordered per-turn text, joining soft-wrapped continuation lines and
// dropping labels + stage directions. Mirrors scripts/parse-script.ts so the UI aligns with the render.
function splitLabelledLines(script: string): string[] {
  const out: string[] = [];
  for (const raw of script.split('\n')) {
    const s = raw.trim();
    if (!s || /^[[(]/.test(s)) continue;
    const m = /^[A-Za-z][A-Za-z0-9 _-]*?:\s*(.+)$/.exec(s);
    if (m) out.push(m[1].trim());
    else if (out.length) out[out.length - 1] += ' ' + s;
  }
  return out;
}

export default function AdsSplitScreen() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);

  const [rawScript, setRawScript] = useState('');
  const [sourceLang, setSourceLang] = useState('hindi');
  const [labelRoles, setLabelRoles] = useState<Record<string, 'teacher' | 'learner'>>({});
  const [selectedTeacher, setSelectedTeacher] = useState<Avatar | null>(null);
  const [selectedLearner, setSelectedLearner] = useState<Avatar | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>([]);

  const [preview, setPreview] = useState<{ turns: Array<{ id: string; speaker: string }>; perLang: Record<string, { segments: Array<{ id: string; speaker: string; text: string; roman?: string }> }> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Editable translations: editedSpecs[lang][segId] = { text (native → TTS/lip-sync), roman (caption) }.
  // Seeded from the Gemini preview; you can fix any line or paste a whole script per language. On Run
  // these are sent to the pipeline, which uses them verbatim and SKIPS Gemini for that language.
  const [editedSpecs, setEditedSpecs] = useState<Record<string, Record<string, { text: string; roman: string }>>>({});
  const [previewScript, setPreviewScript] = useState('');
  const [bulkOpen, setBulkOpen] = useState<Record<string, boolean>>({});

  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ads-split-screen/avatars').then(r => r.json()).then(setAvatars).catch(() => {});
    fetch('/api/ads-split-screen/languages').then(r => r.json()).then(d => setLanguages(d.languages ?? d)).catch(() => {});
    fetch('/api/ads-split-screen/layouts').then(r => r.json()).then(setLayouts).catch(() => {});
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-assign a default role (AI vs human) to each detected label; the user can flip it.
  useEffect(() => {
    const labels = extractLabels(rawScript);
    setLabelRoles(prev => {
      const next = { ...prev };
      for (const lbl of labels) if (!next[lbl]) next[lbl] = /\b(ai|bot|robot|nova|teacher|tutor|coach)\b/i.test(lbl) ? 'teacher' : 'learner';
      return next;
    });
  }, [rawScript]);

  // Poll results while running
  useEffect(() => {
    if (!runId) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/ads-split-screen/result?run=${runId}`);
        if (r.ok) {
          const data = await r.json();
          if (data.outputs) setResults(data.outputs);
          if (data.status === 'done') clearInterval(poll);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [runId]);

  const scriptLabels = extractLabels(rawScript);
  // label → avatar key, derived from the AI/Human role chosen per label (step 1) + the picked avatars
  const labelMap: Record<string, string> = Object.fromEntries(
    scriptLabels.map(l => [l, labelRoles[l] === 'learner' ? (selectedLearner?.key ?? 'girl') : (selectedTeacher?.key ?? 'nova')])
  );
  const rolesComplete = scriptLabels.length > 0 && scriptLabels.every(l => labelRoles[l]);

  // Source line per turn (in order) — shown as a muted reference beside each editable row.
  const sourceLines = splitLabelledLines(rawScript);
  const previewStale = !!preview && rawScript.trim() !== previewScript.trim();

  const canPreview = rawScript.trim().length > 0 && selectedLangs.length > 0;
  const canRun = rawScript.trim().length > 0 && rolesComplete && selectedTeacher && selectedLearner && selectedLangs.length > 0 && selectedLayouts.length > 0 && !running;

  async function getPreview() {
    if (!canPreview) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    try {
      const res = await fetch('/api/ads-split-screen/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawScript, labelMap, sourceLang, languages: selectedLangs }),
      });
      const data = await res.json();
      if (!res.ok) { setPreviewError(data.error ?? 'preview failed'); return; }
      setPreview(data);
      setPreviewScript(rawScript);
      // Seed the editable specs from the translation result (native text + Roman caption per line).
      const seeded: Record<string, Record<string, { text: string; roman: string }>> = {};
      for (const lang of Object.keys(data.perLang ?? {})) {
        seeded[lang] = {};
        for (const s of data.perLang[lang].segments) seeded[lang][s.id] = { text: s.text ?? '', roman: s.roman ?? s.text ?? '' };
      }
      setEditedSpecs(seeded);
    } catch (e: unknown) {
      setPreviewError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runPipeline() {
    if (!canRun) return;
    setRunning(true);
    setLogs([]);
    setResults([]);
    setRunId(null);

    // extract runId from SSE stream header is not possible — we'll parse it from logs
    const payload = {
      rawScript,
      labelMap,
      sourceLang,
      avatars: { teacher: selectedTeacher!.key, learner: selectedLearner!.key },
      languages: selectedLangs,
      layouts: selectedLayouts,
      engine: 'heygen',
      // User's edited / pasted scripts — only for languages they previewed. The pipeline uses these
      // verbatim and skips Gemini for those languages; untouched languages are auto-translated.
      editedSpecs: Object.fromEntries(selectedLangs.filter(l => editedSpecs[l]).map(l => [l, editedSpecs[l]])),
    };

    try {
      const res = await fetch('/api/ads-split-screen/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.body) { setLogs(p => [...p, '[error] no response body']); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split('\n').forEach(l => {
          if (l.startsWith('data: ')) {
            const line = l.slice(6);
            setLogs(p => [...p.slice(-500), line]);
            // extract runId from log lines like "run=abc123"
            const m = /run=([a-zA-Z0-9_-]+)/.exec(line);
            if (m) setRunId(m[1]);
          }
        });
      }
    } finally {
      setRunning(false);
      // final result poll
      if (runId) {
        const r = await fetch(`/api/ads-split-screen/result?run=${runId}`).catch(() => null);
        if (r?.ok) { const d = await r.json(); if (d.outputs) setResults(d.outputs); }
      }
    }
  }

  function toggleLang(id: string) {
    setSelectedLangs(p => p.includes(id) ? p.filter(l => l !== id) : [...p, id]);
  }

  function toggleLayout(id: string) {
    setSelectedLayouts(p => p.includes(id) ? p.filter(l => l !== id) : [...p, id]);
  }

  // Edit one segment's Spoken (text → TTS) or Caption (roman) for a language.
  function updateSeg(lang: string, id: string, field: 'text' | 'roman', val: string) {
    setEditedSpecs(p => ({ ...p, [lang]: { ...(p[lang] ?? {}), [id]: { text: '', roman: '', ...(p[lang]?.[id]), [field]: val } } }));
  }

  // Paste a whole script for one language → distribute its lines onto the rows in turn order.
  function bulkFill(lang: string, blob: string) {
    if (!preview) return;
    const lines = splitLabelledLines(blob);
    setEditedSpecs(p => {
      const next: Record<string, { text: string; roman: string }> = { ...(p[lang] ?? {}) };
      preview.turns.forEach((t, i) => { if (lines[i] != null) next[t.id] = { text: lines[i], roman: next[t.id]?.roman ?? '' }; });
      return { ...p, [lang]: next };
    });
  }

  const teacherAvatars = avatars.filter(a => a.role === 'teacher');
  const learnerAvatars = avatars.filter(a => a.role === 'learner');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '24px 16px', color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Ads Split-Screen Factory</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Paste a labelled script → pick avatars + languages + layouts → generate captioned MP4s</p>

      {/* ── Script ── */}
      <Section title="1. Script">
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: '#555' }}>
            Script language:&nbsp;
            <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} style={selectStyle}>
              {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>Format: <code>Label: spoken line</code>, one per line</span>
        </div>
        <textarea
          value={rawScript}
          onChange={e => setRawScript(e.target.value)}
          placeholder={'User: I want to learn English\nAI: Learn English with me'}
          rows={10}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical' }}
        />
        {scriptLabels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>Who&apos;s who? Mark each speaker as the <b>AI</b> teacher or the <b>Human</b> learner:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {scriptLabels.map(lbl => (
                <div key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{lbl}</span>
                  <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
                    {([['teacher', 'AI'], ['learner', 'Human']] as const).map(([role, label]) => (
                      <button key={role} type="button" onClick={() => setLabelRoles(p => ({ ...p, [lbl]: role }))}
                        style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', border: 'none', cursor: 'pointer',
                          background: labelRoles[lbl] === role ? (role === 'teacher' ? '#4F46E5' : '#059669') : '#f5f5f5',
                          color: labelRoles[lbl] === role ? '#fff' : '#555' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Languages ── */}
      <Section title="2. Target Languages">
        <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>You get a full set of videos in every language you pick — the script language itself needs no translation.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {languages.map(l => (
            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: selectedLangs.includes(l.id) ? '#4F46E5' : '#f5f5f5', color: selectedLangs.includes(l.id) ? '#fff' : '#333', borderRadius: 20, padding: '6px 14px', userSelect: 'none', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={selectedLangs.includes(l.id)} onChange={() => toggleLang(l.id)} style={{ display: 'none' }} />
              {l.name}
            </label>
          ))}
        </div>
      </Section>

      {/* ── Preview & Edit ── */}
      <Section title="3. Preview & Edit Translations">
        <p style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
          Translate, then <b>edit any line</b> — or paste your own full script per language. What you leave here is exactly what gets spoken &amp; captioned.
          {' '}<b>Spoken</b> = audio (native script). <b>Caption</b> = on-screen Roman (leave blank to caption in native script).
        </p>
        <button onClick={getPreview} disabled={!canPreview || previewLoading} style={btnStyle('#6366F1', !canPreview || previewLoading)}>
          {previewLoading ? 'Translating…' : preview ? 'Re-translate (re-seeds rows)' : 'Get Translations'}
        </button>
        {previewError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{previewError}</p>}
        {previewStale && (
          <p style={{ color: '#b45309', fontSize: 12, marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>
            ⚠ The script in step 1 changed since these rows were generated. Click <b>Re-translate</b> to re-sync, or your edits may not line up on Run.
          </p>
        )}
        {preview && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {selectedLangs.filter(l => editedSpecs[l]).map(lang => {
              const lname = languages.find(x => x.id === lang)?.name ?? lang;
              return (
                <div key={lang} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{lname}{lang === sourceLang ? ' · source' : ''}</span>
                    <button type="button" onClick={() => setBulkOpen(p => ({ ...p, [lang]: !p[lang] }))} style={{ fontSize: 11, color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {bulkOpen[lang] ? 'Close paste box' : 'Paste full script ▾'}
                    </button>
                  </div>
                  {bulkOpen[lang] && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fcfcff' }}>
                      <textarea
                        placeholder={`Paste the full ${lname} script — one line per turn (labels like "User:" / "AI:" optional). Fills the Spoken fields below in order.`}
                        rows={6}
                        onChange={e => bulkFill(lang, e.target.value)}
                        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                      <div style={{ fontSize: 10.5, color: '#888', marginTop: 4 }}>{preview.turns.length} turns expected · extra lines ignored · missing lines keep their value · captions fall back to native script (fill Caption for Roman).</div>
                    </div>
                  )}
                  <div style={{ padding: '4px 12px 8px' }}>
                    {preview.turns.map((t, i) => {
                      const seg = editedSpecs[lang]?.[t.id] ?? { text: '', roman: '' };
                      return (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, padding: '8px 0', borderBottom: i < preview.turns.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'start' }}>
                          <div style={{ fontSize: 11, color: '#6b7280', paddingTop: 4 }}>
                            <div style={{ fontWeight: 700, color: '#374151' }}>{t.id}</div>
                            <div>{t.speaker}</div>
                          </div>
                          <div>
                            {sourceLines[i] && lang !== sourceLang && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3, fontStyle: 'italic' }}>src: {sourceLines[i]}</div>}
                            <textarea value={seg.text} onChange={e => updateSeg(lang, t.id, 'text', e.target.value)} placeholder="spoken line (native script → audio + lips)" rows={2}
                              style={{ width: '100%', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px', boxSizing: 'border-box', resize: 'vertical' }} />
                            <input value={seg.roman} onChange={e => updateSeg(lang, t.id, 'roman', e.target.value)} placeholder="caption (Roman) — blank = native script"
                              style={{ width: '100%', fontSize: 12, color: '#555', border: '1px solid #eee', borderRadius: 6, padding: '4px 8px', boxSizing: 'border-box', marginTop: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {selectedLangs.some(l => !editedSpecs[l]) && (
              <p style={{ fontSize: 12, color: '#b45309' }}>
                {selectedLangs.filter(l => !editedSpecs[l]).map(l => languages.find(x => x.id === l)?.name ?? l).join(', ')} not translated yet — click <b>Re-translate</b> to include, or it&apos;ll be auto-translated on Run.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* ── Avatars ── */}
      <Section title="4. Pick Avatars">
        <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Pick the AI teacher and the human learner. (Which label is AI vs human is set per label up in step 1.)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <AvatarGroup
            title="Teacher (AI)"
            avatars={teacherAvatars}
            selected={selectedTeacher}
            onSelect={a => { setSelectedTeacher(a); }}
          />
          <AvatarGroup
            title="Learner (human)"
            avatars={learnerAvatars}
            selected={selectedLearner}
            onSelect={a => { setSelectedLearner(a); }}
          />
        </div>
      </Section>

      {/* ── Layouts ── */}
      <Section title="5. Target Layouts">
        <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Each thumbnail is a real frame from a generated video — pick the formats you want.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 190px)', gap: 14, alignItems: 'start' }}>
          {layouts.map(l => {
            const sel = selectedLayouts.includes(l.id);
            return (
              <div key={l.id} onClick={() => toggleLayout(l.id)} title={`${l.id} · ${l.name}`} style={{ cursor: 'pointer', border: sel ? '2px solid #059669' : '2px solid #e5e7eb', borderRadius: 10, padding: 8, background: sel ? '#ecfdf5' : '#fff', transition: 'all 0.15s', userSelect: 'none' }}>
                {l.preview && <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.preview} alt={l.name} style={{ width: '100%', borderRadius: 6, display: 'block', background: '#000' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </>}
                <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 5, color: sel ? '#047857' : '#444', lineHeight: 1.3 }}>{l.id} · {l.name}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Run ── */}
      <Section title="6. Run">
        <div style={{ marginBottom: 8, fontSize: 13, color: '#555' }}>
          {canRun ? `Ready: ${selectedLangs.length} lang(s) × ${selectedLayouts.length} layout(s) = ${selectedLangs.length * selectedLayouts.length} MP4s` : 'Select script + both avatars + at least 1 language + 1 layout to enable Run.'}
        </div>
        <button onClick={runPipeline} disabled={!canRun} style={btnStyle('#DC2626', !canRun)}>
          {running ? 'Running...' : 'Run Pipeline'}
        </button>
        {running && <span style={{ marginLeft: 12, fontSize: 13, color: '#888' }}>This takes several minutes (HeyGen + ffmpeg per language).</span>}
      </Section>

      {/* ── Logs ── */}
      {logs.length > 0 && (
        <Section title="7. Live Log">
          <div style={{ background: '#0f172a', color: '#94a3b8', borderRadius: 8, padding: '12px 14px', height: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.startsWith('[error') || l.startsWith('[done:1') ? '#f87171' : l.startsWith('[done:0]') ? '#4ade80' : undefined }}>{l}</div>)}
            <div ref={logsEndRef} />
          </div>
        </Section>
      )}

      {/* ── Results ── */}
      {results.length > 0 && (
        <Section title="8. Results">
          {runId && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a href={`/api/ads-split-screen/zip?run=${runId}`} download style={{ background: '#059669', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>⬇ Download all ({results.length}) as zip</a>
              <span style={{ fontSize: 11.5, color: '#888' }}>Also saved on disk at <code>.context/projects/_runs/{runId}/auto-gen-split/</code></span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {results.map((r, i) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: '#f9fafb', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  {r.lang} · {r.layout}
                </div>
                <video
                  controls
                  style={{ width: '100%', display: 'block', background: '#000' }}
                  src={runId ? `/api/ads-split-screen/video?run=${runId}&lang=${r.lang}&layout=${r.layout}` : undefined}
                />
                {runId && (
                  <div style={{ padding: '8px 12px' }}>
                    <a href={`/api/ads-split-screen/video?run=${runId}&lang=${r.lang}&layout=${r.layout}`} download={`${r.lang}-${r.layout}.mp4`} style={{ fontSize: 12, color: '#4F46E5' }}>Download</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#111', borderBottom: '1px solid #eee', paddingBottom: 6 }}>{title}</h2>
      {children}
    </div>
  );
}

function AvatarGroup({ title, avatars, selected, onSelect }: {
  title: string;
  avatars: Avatar[];
  selected: Avatar | null;
  onSelect: (a: Avatar) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#555' }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {avatars.map(a => (
          <div
            key={a.key}
            onClick={() => onSelect(a)}
            style={{
              cursor: 'pointer', border: selected?.key === a.key ? '2px solid #4F46E5' : '2px solid #e5e7eb',
              borderRadius: 10, padding: 10, textAlign: 'center', background: selected?.key === a.key ? '#EEF2FF' : '#fff',
              transition: 'all 0.15s', minWidth: 174
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.thumb} alt={a.name} style={{ width: 150, height: 150, borderRadius: 75, objectFit: 'cover', background: '#e5e7eb', display: 'block', margin: '0 auto 8px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
            <div style={{ fontSize: 10, color: '#888' }}>{a.role}{a.heygenEngine ? ` · ${a.heygenEngine}` : ''}</div>
            <div style={{ fontSize: 9, color: '#999', fontFamily: 'monospace', marginTop: 5, lineHeight: 1.5, textAlign: 'left' }}>
              <div title={a.heygenLookId}>look&nbsp; {a.heygenLookId ? a.heygenLookId.slice(0, 8) + '…' + a.heygenLookId.slice(-4) : '—'}</div>
              <div title={a.cartesiaVoiceId}>voice {a.cartesiaVoiceId ? a.cartesiaVoiceId.slice(0, 8) + '…' + a.cartesiaVoiceId.slice(-4) : '—'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 4, padding: '3px 6px', fontSize: 13 };

function btnStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#ccc' : color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.15s',
  };
}
