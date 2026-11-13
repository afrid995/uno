import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuestStore } from '../stores/guestStore';
import { DashboardView } from '../features/guest/components/DashboardView';

export const DashboardPage: React.FC = () => {
  const { guest, isResuming } = useGuestStore();
  const navigate = useNavigate();

  useEffect(() => {
    // If not resuming and no guest session exists, redirect back to landing page
    if (!isResuming && !guest) {
      navigate('/', { replace: true });
    }
  }, [guest, isResuming, navigate]);

  if (isResuming) {
    return (
      <div className="w-full min-h-[50vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-uno-red border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Verifying guest session...</p>
        </div>
      </div>
    );
  }

  if (!guest) return null;

  return <DashboardView />;
};
