import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

// Intercepts the browser Back gesture at the app root and shows an in-app
// warning (not the browser's own dialog) before the user leaves the app.
// Pattern: keep a sentinel history entry; on popstate, re-push it and warn.
export default function BackGuard() {
  const [warn, setWarn] = useState(false);
  const bypass = useRef(false);

  useEffect(() => {
    window.history.pushState({ guard: true }, '');
    const onPop = () => {
      if (bypass.current) return; // an intentional leave is in progress
      setWarn(true);
      window.history.pushState({ guard: true }, ''); // stay put until decided
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const stay = () => setWarn(false);

  const leave = () => {
    setWarn(false);
    bypass.current = true;
    window.history.go(-2); // undo both guard entries -> real back / exit
  };

  if (!warn) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 motion-safe:animate-fade-in">
      <div className="bg-cream w-full max-w-xs rounded-2xl shadow-lg p-6 border border-gray-100 text-center motion-safe:animate-pop-in">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Leave the app?</h2>
        <p className="text-sm text-gray-500 mt-1">You are about to exit Tiga Pasak. Your session stays signed in.</p>
        <div className="flex gap-3 mt-5">
          <button
            onClick={stay}
            className="flex-1 bg-forest text-white py-2 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95"
          >
            Stay
          </button>
          <button
            onClick={leave}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-medium shadow-sm hover:bg-gray-50 transition-all duration-200 active:scale-95"
          >
            Leave
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
