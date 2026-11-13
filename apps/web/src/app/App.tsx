import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useGuestStore } from '../stores/guestStore';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { LandingPage } from '../pages/LandingPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LobbyPage } from '../pages/LobbyPage';
import { JoinInvitePage } from '../pages/JoinInvitePage';
import { GamePage } from '../pages/GamePage';

export const App: React.FC = () => {
  const { resumeSession, guest, isResuming } = useGuestStore();

  useEffect(() => {
    // Attempt automatic session resumption on application startup
    resumeSession();
  }, [resumeSession]);

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center">
        {isResuming ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-10 h-10 border-3 border-uno-red border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Checking session...</p>
          </div>
        ) : (
          <Routes>
            <Route
              path="/"
              element={guest ? <Navigate to="/dashboard" replace /> : <LandingPage />}
            />
            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />
            <Route
              path="/room/:roomCode"
              element={<LobbyPage />}
            />
            <Route
              path="/game/:roomCode"
              element={<GamePage />}
            />
            <Route
              path="/join/:roomCode"
              element={<JoinInvitePage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default App;
