# Skill: Add a New Scene

## Steps

1. **Add scene component** to `app/superflow-demo/page.tsx`
   ```tsx
   function Scene8() {
     const [visible, setVisible] = useState(false);
     useEffect(() => {
       const t = setTimeout(() => setVisible(true), 1000);
       return () => clearTimeout(t);
     }, []);
     return (
       <div style={{ width: 540, height: 960, background: '#E8E8F0', ... }}>
         {/* content */}
       </div>
     );
   }
   ```

2. **Add to SCENES array** and **SCENE_DURATIONS**
   ```tsx
   const SCENE_DURATIONS = [5000, 12000, 9000, 3000, 8000, 8000, 5000, 4000]; // +new
   const SCENES = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6, Scene7, Scene8];
   ```

3. **Add TTS cues** for the new scene in `video-generation-flow/config/tts-cues.json`
   - Calculate `ms` offset: sum of all previous scene durations + timing within scene
   - Add `durationMs` (use `ffprobe -v quiet -show_entries format=duration -i ta-N.mp3`)

4. **Add caption chunk** in `video-generation-flow/config/caption-chunks.json`
   - Match `startMs` to TTS cue ms
   - `endMs` = startMs + durationMs
   - Tag `highlight: true` on the most impactful 1-2 words

5. **Update total video duration**
   - `tts-cues.json` → update `totalDurationMs`
   - Recording command: `node video-generation-flow/scripts/record-animation.mjs /superflow-demo {N} 540 960`

6. **Record + mix + QA**
   ```bash
   node video-generation-flow/scripts/record-animation.mjs /superflow-demo {N} 540 960
   node video-generation-flow/scripts/add-audio.mjs
   GEMINI_API_KEY=... node video-generation-flow/scripts/qa-video.mjs
   ```

## Checklist
- [ ] Scene renders correctly at `/superflow-demo` in browser
- [ ] Scene duration matches transition timing
- [ ] TTS cue starts after previous cue ends (no overlap)
- [ ] Caption chunk covers correct time range
- [ ] White flash transition appears between scenes
- [ ] QA score ≥ 8/10
