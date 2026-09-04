import { Outlet, Navigate, useLocation } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import { supabase } from '../supabaseClient';
import { useEffect, useState } from 'react';

export default function ProtectedLayout() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center motion-safe:animate-fade-in">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-cream pb-20 flex flex-col items-center">
      <div className="w-full max-w-md bg-cream min-h-screen relative shadow-sm">
        <main key={location.pathname} className="motion-safe:animate-fade-in">
          <Outlet context={{ session }} />
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
