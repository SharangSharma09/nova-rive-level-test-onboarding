# Skill: Screenshot → HTML/CSS Scene

When the user uploads a screenshot and says "make this into an animated scene":

## Step 1 — Read the screenshot

The user will drop it into the studio (saves to `.context/attachments/{id}/image.png`).
Read with the Read tool.

## Step 2 — Identify elements

From the screenshot, identify:
- Background color / gradient
- Text blocks (font size, weight, color, position)
- Image/icon elements (replace with CSS approximations or public/icons/)
- Buttons / interactive elements
- Layout structure (centered, left-aligned, card, etc.)

## Step 3 — Build the HTML/CSS component

Template:
```tsx
function SceneN() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 500);  // animate in first element
    const t2 = setTimeout(() => setStep(2), 1200); // animate in second
    return () => [t1, t2].forEach(clearTimeout);
  }, []);

  return (
    <div style={{ width: 540, height: 960, background: '{bg_color}', position: 'relative', ... }}>
      {/* background elements */}
      {/* text block with fade-up animation */}
      <div style={{
        opacity: step >= 1 ? 1 : 0,
        transform: step >= 1 ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.5s ease',
        // ... position and typography from screenshot
      }}>
        {text}
      </div>
    </div>
  );
}
```

## Step 4 — Animation approach

Match the reference video's style:
- Entries: `fade-up` (opacity 0→1, translateY 20px→0, 0.5s ease)
- Emphasis: `pop-in` (scale 0.6→1, 0.3s spring)
- Stagger: 150–200ms between elements
- Blur reveal: `filter: blur(20px)→blur(0)` for icon grids

## Rules
- NO screenshots as `<img>` — always recreate in pure HTML/CSS
- Colors from screenshot: use eyedropper or approximate
- Fonts: use system fonts (no custom font imports)
- Keep 540×960 container, no overflow
