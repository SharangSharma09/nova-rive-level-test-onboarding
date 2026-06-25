export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#0D0D0D',
      minHeight: '100vh',
      color: '#E0E0E0',
      fontFamily: 'ui-monospace, "SF Mono", monospace',
    }}>
      {children}
    </div>
  );
}
