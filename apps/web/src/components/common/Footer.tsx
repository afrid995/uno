import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-900 bg-slate-950/40 py-6 mt-auto text-xs text-slate-500">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <p>© {new Date().getFullYear()} UNO Ultimate — Phase 1 Project Foundation.</p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Crafted for private multiplayer card games with friends. No public matchmaking or registration.
          </p>
        </div>
        <div className="text-[11px] text-slate-500 max-w-sm">
          <span>Mattel &amp; UNO are registered trademarks of Mattel, Inc. This project uses original visual elements and rule sets under fair use fan development.</span>
        </div>
      </div>
    </footer>
  );
};
