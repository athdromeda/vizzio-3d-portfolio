import { useEffect, useState, type ReactNode } from 'react';

function Clock() {
  const fmt = () =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="clock">
      <span className="clock-zone">SGT</span> {time}
    </span>
  );
}

/** Top bar and bottom strip shared by every screen. `hint` tells the visitor what the controls do; `tools` are the current screen's own switches. */
export function Shell({ hint, tools, children }: { hint: string; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">VIZZIO</span>
          <span className="brand-sub">3D Portfolio</span>
        </div>
        <div className="topbar-meta">
          {tools}
          <Clock />
        </div>
      </header>
      {children}
      <footer className="strip">
        <span>{hint}</span>
        <span>Concept exploration. Not an official Vizzio site. Demo data.</span>
      </footer>
    </div>
  );
}
