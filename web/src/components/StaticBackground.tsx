export type BackgroundTheme = 'login' | 'app';

export default function StaticBackground({ theme }: { theme: BackgroundTheme }) {
  return <div className={`ambient-background ambient-background-${theme}`} aria-hidden="true" />;
}
