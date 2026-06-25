'use client';

import { useEffect, useRef, useState } from 'react';
import ttsCues from '../../video-generation-flow/config/tts-cues.json';
import scenesConfig from '../../video-generation-flow/config/scenes.json';

/* ─── Synthetic click sound via Web Audio API ─── */
function playClick(freq = 1200, duration = 0.05) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* AudioContext unavailable in headless — ignore */ }
}

/* ─── TTS audio cues: [file, startMs, durationMs] — derived from tts-cues.json (single source) ─── */
const AUDIO_CUES: [string, number, number][] = ttsCues.ttsCues.map(
  (c) => [`/tts/video/${c.file}`, c.ms, c.durationMs] as [string, number, number]
);

/* ─── Icon types ─── */
type Icon = { src: string; bg: string; pad?: number; filter?: string };

const ROWS: Icon[][] = [
  [
    { src: '/icons/tumblr.svg',   bg: '#35465C', pad: 20, filter: 'brightness(0) invert(1)' },
    { src: '/icons/whatsapp.svg', bg: 'transparent', pad: 0 },
    { src: '/icons/facebook.svg', bg: '#1877F2', pad: 18, filter: 'brightness(0) invert(1)' },
    { src: '/icons/gmail.svg',    bg: '#fff', pad: 10 },
    { src: '/icons/messages.svg', bg: 'transparent', pad: 0 },
    { src: '/icons/github.svg',   bg: '#24292e', pad: 16, filter: 'brightness(0) invert(1)' },
  ],
  [
    { src: '/icons/github.svg',     bg: '#24292e', pad: 16, filter: 'brightness(0) invert(1)' },
    { src: '/icons/instagram.png',  bg: 'transparent', pad: 0 },
    { src: '/icons/google.svg',     bg: '#fff', pad: 12 },
    { src: '/icons/googledocs.svg', bg: '#4285F4', pad: 16, filter: 'brightness(0) invert(1)' },
    { src: '/icons/linkedin.png',   bg: 'transparent', pad: 0 },
    { src: '/icons/tumblr.svg',     bg: '#35465C', pad: 20, filter: 'brightness(0) invert(1)' },
  ],
  [
    { src: '/icons/pinterest.svg', bg: '#E60023', pad: 18, filter: 'brightness(0) invert(1)' },
    { src: '/icons/messages.svg',  bg: 'transparent', pad: 0 },
    { src: '/icons/linkedin.png',  bg: 'transparent', pad: 0 },
    { src: '/icons/notes.svg',     bg: 'transparent', pad: 0 },
    { src: '/icons/facebook.svg',  bg: '#1877F2', pad: 18, filter: 'brightness(0) invert(1)' },
    { src: '/icons/gmail.svg',     bg: '#fff', pad: 10 },
  ],
];

const ICON_SIZE = 80;
const ICON_GAP = 14;
const ICON_RADIUS = 18;
const SCROLL_DURATIONS = [11, 13, 10];

function AppIcon({ src, bg, pad = 0, filter }: Icon) {
  return (
    <div style={{
      width: ICON_SIZE, height: ICON_SIZE, borderRadius: ICON_RADIUS,
      backgroundColor: bg === 'transparent' ? undefined : bg,
      overflow: 'hidden', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
      boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{
        width: pad ? `${100 - pad}%` : '100%',
        height: pad ? `${100 - pad}%` : '100%',
        objectFit: 'contain', filter: filter ?? undefined, display: 'block',
      }} />
    </div>
  );
}

function IconRows() {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: 0, right: 0,
      transform: 'translateY(-60%)', display: 'flex', flexDirection: 'column', gap: ICON_GAP,
    }}>
      {ROWS.map((row, ri) => (
        <div key={ri} style={{
          overflow: 'hidden', width: '100%',
          animation: `icons-reveal 0.6s ${ri * 0.1}s ease both`,
        }}>
          <div style={{
            display: 'flex', gap: ICON_GAP, width: 'max-content', paddingLeft: ICON_GAP,
            animation: `scroll-left ${SCROLL_DURATIONS[ri]}s linear infinite`,
          }}>
            {[...row, ...row].map((icon, i) => <AppIcon key={i} {...icon} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Scene 1: Icon grid ─── */
function Scene1() {
  return (
    <div style={{ width: 540, height: 960, background: '#E8E8F0', position: 'relative', overflow: 'hidden' }}>
      <IconRows />
      <div style={{
        position: 'absolute', bottom: 110, left: 0, right: 0, textAlign: 'center',
        padding: '0 40px', animation: 'fade-up 0.7s 0.4s ease both',
      }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#111', letterSpacing: -0.3, marginBottom: 8 }}>
          Works on any App
        </div>
        <div style={{ fontSize: 16, color: '#888', fontWeight: 400 }}>
          Tap on any text field to start.
        </div>
      </div>
    </div>
  );
}

/* ─── Scene 2: WhatsApp phone mockup ─── */
function Scene2() {
  const [showKeyboard, setShowKeyboard]   = useState(false);
  const [showSFBtn, setShowSFBtn]         = useState(false);
  const [tapHand, setTapHand]             = useState(false);
  const [showRecorder, setShowRecorder]   = useState(false);
  const [tapCheck, setTapCheck]           = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowKeyboard(true),  2000);
    const t2 = setTimeout(() => setShowSFBtn(true),     4000);
    const t3 = setTimeout(() => { setTapHand(true); playClick(1000, 0.06); }, 4500);
    const t4 = setTimeout(() => { setTapHand(false); setShowRecorder(true); }, 5200);
    const t5 = setTimeout(() => { setTapCheck(true); playClick(1400, 0.05); }, 10500);
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout);
  }, []);

  const PHONE_W = 290;
  const PHONE_H = 580;

  return (
    <div style={{
      width: 540, height: 960, background: '#E8E8F0',
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fade-up 0.5s ease both',
    }}>
      {/* Phone frame */}
      <div style={{
        width: PHONE_W, height: PHONE_H,
        border: '3px solid #1a1a1a',
        borderRadius: 36,
        boxShadow: '0 30px 80px rgba(0,0,0,0.30)',
        overflow: 'hidden',
        position: 'relative',
        background: '#ECE5DD',
        animation: 'phone-enter 0.5s cubic-bezier(0.25,0.46,0.45,0.94) both',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Status bar */}
        <div style={{
          height: 20, background: '#075E54', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>9:41</span>
          <span style={{ color: '#fff', fontSize: 9 }}>▐▐▐ WiFi ▌</span>
        </div>

        {/* WhatsApp header */}
        <div style={{
          height: 48, background: '#075E54', display: 'flex',
          alignItems: 'center', padding: '0 10px', gap: 8, flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: 14 }}>←</span>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: '#25D366',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 14 }}>👩</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>Sandhya</div>
            <div style={{ color: '#B2DFDB', fontSize: 9 }}>online</div>
          </div>
          <span style={{ color: '#fff', fontSize: 16 }}>📹</span>
          <span style={{ color: '#fff', fontSize: 16, marginLeft: 8 }}>⋮</span>
        </div>

        {/* Chat area — paddingBottom reserves space for absolute bottom bar (+ keyboard) */}
        <div style={{
          flex: 1, overflowY: 'hidden', position: 'relative',
          background: '#ECE5DD', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6,
          paddingBottom: showKeyboard ? 252 : 52,
        }}>
          {/* Sent bubble */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'fade-up 0.3s 0.2s ease both', opacity: 0 }}>
            <div style={{
              background: '#DCF8C6', borderRadius: '12px 2px 12px 12px',
              padding: '6px 10px', maxWidth: '70%', fontSize: 11,
              boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
            }}>
              <div>Hi Sandhya</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:30 ✓✓</div>
            </div>
          </div>

          {/* Received bubble 1 */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fade-up 0.3s 0.4s ease both', opacity: 0 }}>
            <div style={{
              background: '#fff', borderRadius: '2px 12px 12px 12px',
              padding: '6px 10px', maxWidth: '70%', fontSize: 11,
              boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
            }}>
              <div>Hi Rohan! 👋</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:31</div>
            </div>
          </div>

          {/* Received bubble 2 */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fade-up 0.3s 0.6s ease both', opacity: 0 }}>
            <div style={{
              background: '#fff', borderRadius: '2px 12px 12px 12px',
              padding: '6px 10px', maxWidth: '80%', fontSize: 11,
              boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
            }}>
              <div>Can you send me the proposal? The client is waiting for it since yesterday 😅</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:31</div>
            </div>
          </div>
        </div>

        {/* Superflow purple button — appears over chat */}
        {showSFBtn && (
          <div style={{
            position: 'absolute', right: 10, bottom: showKeyboard ? 252 : 54,
            width: 40, height: 40, borderRadius: '50%',
            background: '#5B52F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(91,82,240,0.5)',
            animation: 'pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            zIndex: 10,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/superflow.svg" alt="" style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)' }} />
          </div>
        )}

        {/* Hand tap emoji — tip lands on SF button center (button bottom:252, center:272)
            bottom:254 → tip at rest is 10px above center, lands exactly on center at tap (-10px) */}
        {tapHand && (
          <div style={{
            position: 'absolute', right: 14, bottom: showKeyboard ? 254 : 54,
            fontSize: 28, animation: 'tap 0.6s ease both', zIndex: 20,
            transformOrigin: 'bottom center',
          }}>
            👆
          </div>
        )}

        {/* Voice recorder pill — floats above keyboard */}
        {showRecorder && (
          <div style={{
            position: 'absolute', left: 6, right: 6,
            bottom: showKeyboard ? 252 : 50,
            height: 40, borderRadius: 20,
            background: '#1a1a1a',
            display: 'flex', alignItems: 'center',
            padding: '0 4px', gap: 4,
            animation: 'pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            zIndex: 15,
          }}>
            {/* Close button */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#333',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 14 }}>✕</span>
            </div>

            {/* Waveform bars */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' }}>
              {[18, 28, 14, 34, 22, 28, 16, 24, 32, 18, 26, 14, 30, 20].map((maxH, i) => (
                <div key={i} style={{
                  width: 3, borderRadius: 2,
                  background: `hsl(${260 + i * 4}, 80%, 65%)`,
                  animation: `wave-bar 0.${4 + (i % 4)}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.05}s`,
                  height: 8,
                  '--max-h': `${maxH}px`,
                } as React.CSSProperties} />
              ))}
            </div>

            {/* Check button */}
            <div
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: tapCheck ? '#4CAF50' : '#5B52F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'background 0.2s',
                animation: tapCheck ? 'tap 0.4s ease' : undefined,
              }}
            >
              <span style={{ color: '#fff', fontSize: 16 }}>✓</span>
            </div>
          </div>
        )}

        {/* Tap hand on ✓ button — ✓ center at bottom:272, same math as tapHand */}
        {tapCheck && (
          <div style={{
            position: 'absolute', right: 12,
            bottom: showKeyboard ? 254 : 64,
            fontSize: 28, animation: 'tap 0.6s ease', zIndex: 20,
            transformOrigin: 'bottom center',
          }}>
            👆
          </div>
        )}

        {/* Bottom bar — sits above keyboard when keyboard is visible */}
        <div style={{
          position: 'absolute', left: 0, right: 0,
          bottom: showKeyboard ? 200 : 0,
          height: 46, background: '#F0F0F0', display: 'flex',
          alignItems: 'center', padding: '0 6px', gap: 6,
          borderTop: '1px solid #ddd', zIndex: 5,
          transition: 'bottom 0.35s cubic-bezier(0.25,0.46,0.45,0.94)',
        }}>
          <span style={{ fontSize: 18 }}>😊</span>
          <div style={{
            flex: 1, height: 32, background: '#fff', borderRadius: 16,
            display: 'flex', alignItems: 'center', padding: '0 10px',
            fontSize: 11, color: '#999', border: '1px solid #e0e0e0',
          }}>
            Message
          </div>
          <span style={{ fontSize: 16 }}>📎</span>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#25D366',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 16 }}>🎙</span>
          </div>
        </div>

        {/* Keyboard slides up from very bottom, message bar floats above it */}
        {showKeyboard && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 200, background: '#CDD3DA',
            animation: 'slide-up 0.35s cubic-bezier(0.25,0.46,0.45,0.94) both',
            display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
            gridTemplateRows: 'repeat(4, 1fr)',
            gap: 4, padding: '8px 4px',
          }}>
            {'QWERTYUIOP'.split('').concat('ASDFGHJKL'.split('')).concat('ZXCVBNM'.split('')).map((k, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 500, color: '#1a1a1a',
                boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
              }}>{k}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Scene 3: Processing + Response card ─── */
function Scene3() {
  const [showCard, setShowCard] = useState(false);
  const [tapInsert, setTapInsert] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowCard(true), 1500);
    const t2 = setTimeout(() => { setTapInsert(true); playClick(1300, 0.05); }, 6000);
    return () => [t1, t2].forEach(clearTimeout);
  }, []);

  const PHONE_W = 290;
  const PHONE_H = 580;

  return (
    <div style={{
      width: 540, height: 960, background: '#E8E8F0',
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: PHONE_W, height: PHONE_H,
        border: '3px solid #1a1a1a', borderRadius: 36,
        boxShadow: '0 30px 80px rgba(0,0,0,0.30)',
        overflow: 'hidden', position: 'relative',
        background: '#ECE5DD', display: 'flex', flexDirection: 'column',
      }}>
        {/* Status bar */}
        <div style={{ height: 20, background: '#075E54', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>9:41</span>
          <span style={{ color: '#fff', fontSize: 9 }}>▐▐▐ WiFi ▌</span>
        </div>
        {/* Header */}
        <div style={{ height: 48, background: '#075E54', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: 14 }}>←</span>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14 }}>👩</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Sandhya</div>
            <div style={{ color: '#B2DFDB', fontSize: 9 }}>online</div>
          </div>
        </div>

        {/* Chat */}
        <div style={{ flex: 1, background: '#ECE5DD', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: '#DCF8C6', borderRadius: '12px 2px 12px 12px', padding: '6px 10px', fontSize: 11, boxShadow: '0 1px 2px rgba(0,0,0,0.13)' }}>
              <div>Hi Sandhya</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:30 ✓✓</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#fff', borderRadius: '2px 12px 12px 12px', padding: '6px 10px', fontSize: 11, boxShadow: '0 1px 2px rgba(0,0,0,0.13)', maxWidth: '80%' }}>
              <div>Can you send me the proposal? The client is waiting 😅</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:31</div>
            </div>
          </div>

          {/* "Generating" pill */}
          {!showCard && (
            <div style={{
              position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
              background: '#1a1a1a', borderRadius: 20, padding: '6px 14px',
              color: '#fff', fontSize: 10, whiteSpace: 'nowrap',
              animation: 'pop-in 0.3s ease both',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5B52F0', animation: 'pulse 1s ease-in-out infinite' }} />
              Generating your response...
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={{ height: 46, background: '#F0F0F0', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6, flexShrink: 0, borderTop: '1px solid #ddd' }}>
          <span style={{ fontSize: 18 }}>😊</span>
          <div style={{ flex: 1, height: 32, background: '#fff', borderRadius: 16, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, color: '#999', border: '1px solid #e0e0e0' }}>
            Message
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>🎙</span>
          </div>
        </div>

        {/* Response card */}
        {showCard && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 46,
            background: '#0D0D1A', borderRadius: '16px 16px 0 0',
            animation: 'slide-up 0.4s cubic-bezier(0.25,0.46,0.45,0.94) both',
            padding: '10px 10px 12px',
          }}>
            {/* Tone pills */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {[
                { label: 'Casual', active: false },
                { label: 'Semi formal', active: false },
                { label: 'Formal', active: true },
              ].map(({ label, active }) => (
                <div key={label} style={{
                  padding: '4px 8px', borderRadius: 12, fontSize: 9, fontWeight: 600,
                  background: active ? '#5B52F0' : '#1E1E2E',
                  color: active ? '#fff' : '#888', border: active ? 'none' : '1px solid #333',
                }}>
                  {active ? '🤓 ' : '😊 '}{label}
                </div>
              ))}
            </div>

            {/* Response text */}
            <div style={{ color: '#fff', fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
              Hi, the proposal is almost ready, we're just finalizing a few details. We'll send it across to the client by tomorrow.
            </div>

            {/* Bottom pills */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ background: '#1E1E2E', borderRadius: 12, padding: '4px 10px', fontSize: 9, color: '#888' }}>
                English
              </div>
              <div style={{
                  background: '#5B52F0', borderRadius: 12, padding: '5px 14px',
                  fontSize: 10, color: '#fff', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 4,
              }}>
                Insert ↵
              </div>
            </div>

            {/* Tap hand on Insert — card bottom-padding 12px + button center 15px = 27px from card bottom */}
            {tapInsert && (
              <div style={{
                position: 'absolute', right: 8, bottom: 20,
                fontSize: 26, animation: 'tap 0.6s ease', zIndex: 20,
                transformOrigin: 'bottom center',
              }}>
                👆
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Scene 4: Message sent ─── */
function Scene4() {
  const [showSent, setShowSent] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShowSent(true), 800); return () => clearTimeout(t); }, []);

  const PHONE_W = 290;
  const PHONE_H = 580;

  return (
    <div style={{ width: 540, height: 960, background: '#E8E8F0', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: PHONE_W, height: PHONE_H, border: '3px solid #1a1a1a', borderRadius: 36, boxShadow: '0 30px 80px rgba(0,0,0,0.30)', overflow: 'hidden', position: 'relative', background: '#ECE5DD', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 20, background: '#075E54', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>9:41</span>
          <span style={{ color: '#fff', fontSize: 9 }}>▐▐▐ WiFi ▌</span>
        </div>
        <div style={{ height: 48, background: '#075E54', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: 14 }}>←</span>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14 }}>👩</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Sandhya</div>
            <div style={{ color: '#B2DFDB', fontSize: 9 }}>online</div>
          </div>
        </div>
        <div style={{ flex: 1, background: '#ECE5DD', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: '#DCF8C6', borderRadius: '12px 2px 12px 12px', padding: '6px 10px', fontSize: 11, boxShadow: '0 1px 2px rgba(0,0,0,0.13)' }}>
              <div>Hi Sandhya</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:30 ✓✓</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#fff', borderRadius: '2px 12px 12px 12px', padding: '6px 10px', fontSize: 11, boxShadow: '0 1px 2px rgba(0,0,0,0.13)', maxWidth: '80%' }}>
              <div>Can you send me the proposal? The client is waiting 😅</div>
              <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:31</div>
            </div>
          </div>

          {showSent && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'fade-up 0.3s ease both' }}>
              <div style={{ background: '#DCF8C6', borderRadius: '12px 2px 12px 12px', padding: '6px 10px', fontSize: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.13)', maxWidth: '85%' }}>
                <div>Hi, the proposal is almost ready, we're just finalizing a few details. We'll send it across to the client by tomorrow.</div>
                <div style={{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 2 }}>10:32 ✓✓</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ height: 46, background: '#F0F0F0', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6, flexShrink: 0, borderTop: '1px solid #ddd' }}>
          <span style={{ fontSize: 18 }}>😊</span>
          <div style={{ flex: 1, height: 32, background: '#fff', borderRadius: 16, fontSize: 11, color: '#999', border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 10px' }}>Message</div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>🎙</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Scene 5: Icon spotlight ─── */
// Row 0: tumblr(0) whatsapp(1) facebook(2) gmail(3) messages(4) github(5)
// Row 1: github(0) instagram(1) google(2) googledocs(3) linkedin(4) tumblr(5)
// Row 2: pinterest(0) messages(1) linkedin(2) notes(3) facebook(4) gmail(5)
const SPOTLIGHT_SEQ = [
  { row: 0, idx: 3 }, // gmail
  { row: 1, idx: 4 }, // linkedin ← voiceover mentions LinkedIn
  { row: 2, idx: 5 }, // gmail (row 2) ← replaced WhatsApp with Gmail
  { row: 2, idx: 2 }, // linkedin (row 2)
  { row: 0, idx: 3 }, // gmail again
  { row: 1, idx: 4 }, // linkedin again
];

function Scene5() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep(s => s + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const spot = SPOTLIGHT_SEQ[step % SPOTLIGHT_SEQ.length];

  return (
    <div style={{ width: 540, height: 960, background: '#E8E8F0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: ICON_GAP }}>
        {ROWS.map((row, ri) => (
          <div key={ri} style={{ overflow: 'hidden', width: '100%' }}>
            <div style={{ display: 'flex', gap: ICON_GAP, width: 'max-content', paddingLeft: ICON_GAP, animation: `scroll-left ${SCROLL_DURATIONS[ri]}s linear infinite` }}>
              {[...row, ...row].map((icon, i) => {
                const isSpot = ri === spot.row && (i % row.length) === spot.idx;
                return (
                  <div key={i} style={{
                    transform: isSpot ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: isSpot ? '0 0 28px rgba(91,82,240,0.7)' : 'none',
                    borderRadius: ICON_RADIUS, transition: 'transform 0.3s, box-shadow 0.3s',
                  }}>
                    <AppIcon {...icon} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Scene 6: Language selector ─── */
const LANGUAGES = ['Tamil', 'Hindi', 'Telugu', 'Gujarati', 'Bengali', 'Marathi', 'Kannada', 'Assamese', 'Malayalam', 'Punjabi'];

function Scene6() {
  return (
    <div style={{ width: 540, height: 960, background: '#E8E8F0', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '40px 40px' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 30, textAlign: 'center', animation: 'fade-up 0.5s ease both' }}>
        Your language, your way
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {LANGUAGES.map((lang, i) => (
          <div key={lang} style={{
            background: '#fff',
            border: '2px solid #111',
            borderRadius: 14,
            padding: '10px 20px',
            fontWeight: 800, fontSize: 16,
            boxShadow: '4px 4px 0 #5B52F0',
            opacity: 0,
            animation: `btn-enter 0.5s ${i * 0.08}s ease forwards`,
          }}>
            {lang}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Scene 7: Brand outro ─── */
function Scene7() {
  return (
    <div style={{
      width: 540, height: 960, background: '#5B52F0', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <div style={{
        width: 120, height: 120, borderRadius: '50%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(255,255,255,0.3)',
        animation: 'pop-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/superflow.svg" alt="Superflow" style={{ width: 70, height: 70 }} />
      </div>
      <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, textAlign: 'center', animation: 'fade-up 0.5s 0.3s ease both', opacity: 0, lineHeight: 1.3 }}>
        Think it.<br />Say it.<br />Done.
      </div>
    </div>
  );
}

/* ─── Scene transition overlay ─── */
function TransitionFlash() {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#fff', zIndex: 100,
      animation: 'flash-out 0.3s ease both',
      pointerEvents: 'none',
    }} />
  );
}

/* ─── Audio timeline ─── */
function AudioTimeline({ startAt = 0 }: { startAt?: number }) {
  const refs = useRef<(HTMLAudioElement | null)[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    AUDIO_CUES.forEach(([, ms, durationMs], i) => {
      const delay = ms - startAt;
      if (delay < 0) {
        // cue started before seek point — play from offset if still within its duration
        const offsetMs = startAt - ms;
        if (offsetMs < durationMs) {
          timers.push(setTimeout(() => {
            if ((window as any).__sfPaused) return;
            const el = refs.current[i];
            if (!el) return;
            el.currentTime = offsetMs / 1000;
            el.play().catch(() => {});
          }, 0));
        }
        return;
      }
      timers.push(setTimeout(() => {
        if ((window as any).__sfPaused) return;
        const el = refs.current[i];
        if (el) el.play().catch(() => {});
      }, delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [startAt]);

  return (
    <div style={{ display: 'none' }}>
      {AUDIO_CUES.map(([src], i) => (
        <audio
          key={i}
          ref={el => { refs.current[i] = el; }}
          src={src}
          preload="auto"
        />
      ))}
    </div>
  );
}

/* ─── Scene timings (cumulative ms) ─── */
// Scene 1: 0–5s   (5000ms)
// Scene 2: 5–17s  (12000ms)
// Scene 3: 17–26s (9000ms)
// Scene 4: 26–29s (3000ms)
// Scene 5: 29–37s (8000ms)
// Scene 6: 37–45s (8000ms)
// Scene 7: 45–50s (5000ms) — extended so ta-12 audio (2.59s at 45.8s) finishes before video ends
// Durations are the single source of truth (video-generation-flow/config/scenes.json);
// starts are the running cumulative sum.
const SCENE_DURATIONS = scenesConfig.scenes.map((s) => s.durationMs);
const SCENE_STARTS    = SCENE_DURATIONS.reduce<number[]>(
  (acc, d, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + SCENE_DURATIONS[i - 1]); return acc; },
  []
);
const SCENES = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6, Scene7];

/* ─── Root ─── */
export default function SuperflowDemo() {
  const [scene, setScene]       = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [startAt, setStartAt]   = useState(0);
  const [ready, setReady]       = useState(false);
  const [soloScene, setSoloScene] = useState<number | null>(null); // ?scene=N: render one scene in isolation for recording

  // Parse ?startAt=ms and apply postMessage pause/resume — client only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // scene=N: isolated single-scene render for per-scene recording.
    // Renders only SCENES[N] from its own t=0 — no auto-advance, no audio (added at mux).
    const sceneParam = params.get('scene');
    if (sceneParam !== null) {
      const n = Math.max(0, Math.min(SCENES.length - 1, parseInt(sceneParam) || 0));
      setSoloScene(n);
      setScene(n);
      // Render pure content (no transition flash) so the recorder's content-start detection
      // isn't fooled by the white flash. The flash is re-added deterministically at trim time.
      setReady(true);
      console.log('[sf] solo scene mode — scene', n);
      return;
    }

    const sa = parseInt(params.get('startAt') || '0');
    const idx = SCENE_STARTS.reduce((acc, t, i) => sa >= t ? i : acc, 0);
    setStartAt(sa);
    setScene(idx);

    // scrub=1: studio is scrubbing — freeze immediately before any audio fires
    if (params.get('scrub') === '1') {
      (window as any).__sfPaused = true;
      const el = document.createElement('style');
      el.id = '__sf_pause';
      el.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
      document.head.appendChild(el);
      console.log('[sf] scrub mode — self-frozen at', sa, 'ms');
    }

    setReady(true);

    // postMessage: pause/resume via CSS animation-play-state
    let audioWasPlaying: boolean[] = [];

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'pause') {
        (window as any).__sfPaused = true; // block AudioTimeline cue timeouts
        let el = document.getElementById('__sf_pause') as HTMLStyleElement | null;
        if (!el) { el = document.createElement('style'); el.id = '__sf_pause'; document.head.appendChild(el); }
        el.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
        const audios = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'));
        audioWasPlaying = audios.map(a => {
          const playing = !a.paused && a.currentTime > 0 && !a.ended;
          console.log(`[sf-audio] PAUSE ${a.src.split('/').pop()} playing=${playing} t=${a.currentTime.toFixed(2)}s`);
          if (playing) a.pause();
          return playing;
        });
      } else if (e.data?.type === 'resume') {
        (window as any).__sfPaused = false;
        document.getElementById('__sf_pause')?.remove();
        const audios = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'));
        audios.forEach((a, i) => {
          const shouldResume = audioWasPlaying[i] ?? false;
          console.log(`[sf-audio] RESUME ${a.src.split('/').pop()} shouldResume=${shouldResume} t=${a.currentTime.toFixed(2)}s`);
          if (shouldResume) a.play().catch(err => console.warn(`[sf-audio] resume failed:`, err));
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Solo scene: signal the recorder the moment the scene has painted (content t=0),
  // so it can start its capture timer exactly at content start.
  useEffect(() => {
    if (soloScene === null || !ready) return;
    const id = requestAnimationFrame(() => { (window as any).__sfReady = true; });
    return () => cancelAnimationFrame(id);
  }, [soloScene, ready]);

  // Scene advance — waits for ready (so startAt is parsed first)
  useEffect(() => {
    if (!ready) return;
    if (soloScene !== null) return; // solo scene render — no auto-advance
    const initScene  = SCENE_STARTS.reduce((acc, t, i) => startAt >= t ? i : acc, 0);
    const initOffset = startAt - SCENE_STARTS[initScene];
    let current = initScene;
    let tid: ReturnType<typeof setTimeout>;

    function advance() {
      if (current >= SCENES.length - 1) return;
      // If paused/stopped, hold here and retry until unpaused
      if ((window as any).__sfPaused) {
        tid = setTimeout(advance, 50);
        return;
      }
      setShowFlash(true);
      setFlashKey(k => k + 1);
      setTimeout(() => setShowFlash(false), 300);
      current++;
      setScene(current);
      tid = setTimeout(advance, SCENE_DURATIONS[current]);
    }

    tid = setTimeout(advance, Math.max(0, SCENE_DURATIONS[initScene] - initOffset));
    return () => clearTimeout(tid);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const CurrentScene = SCENES[scene];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes scroll-left {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes icons-reveal {
          from { opacity: 0; filter: blur(16px); transform: translateX(60px); }
          to   { opacity: 1; filter: blur(0);    transform: translateX(0); }
        }
        @keyframes phone-enter {
          from { opacity: 0; transform: scale(0.85) translateY(30px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes pop-in {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes tap {
          0%   { transform: translate(0,0) scale(1); }
          30%  { transform: translate(0,12px) scale(0.85); }
          55%  { transform: translate(0,0) scale(1.08); }
          100% { transform: translate(0,0) scale(1); }
        }
        @keyframes wave-bar {
          0%   { height: 4px; }
          100% { height: var(--max-h, 24px); }
        }
        @keyframes btn-enter {
          from { opacity: 0; filter: blur(8px); transform: scale(0.88); }
          to   { opacity: 1; filter: blur(0);   transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes flash-out {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div style={{ width: 540, height: 960, position: 'relative', overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
      }}>
        <CurrentScene />
        {showFlash && <TransitionFlash key={flashKey} />}
        {soloScene === null && <AudioTimeline startAt={startAt} />}
      </div>
    </>
  );
}
