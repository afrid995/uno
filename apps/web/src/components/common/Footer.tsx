import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-white/[0.06] bg-[#090c12]/90 py-6 mt-auto text-xs text-slate-500">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <p className="font-medium text-slate-400">© {new Date().getFullYear()} UNO Ultimate</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Private multiplayer card game for friends. No registration or public matchmaking required.
          </p>
        </div>
        <div className="text-[11px] text-slate-500 max-w-sm">
          <span>Mattel &amp; UNO are registered trademarks of Mattel, Inc. Built for private fan entertainment with server-authoritative rule sets.</span>
        </div>
      </div>
    </footer>
  );
};
