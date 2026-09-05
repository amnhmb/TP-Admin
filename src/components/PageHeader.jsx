import { useState, useRef, useEffect } from 'react';
import { UserCircle, Download, Upload, LogOut, Smartphone } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { onInstallChange, canInstall, isIos, isStandalone, triggerInstall } from '../pwaInstall';

function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [installable, setInstallable] = useState(canInstall());
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);

  // Show the install entry on Chrome/Android (when the prompt is available) and
  // on iOS (manual add), but never once already running as an installed app.
  const showInstall = !isStandalone() && (installable || isIos());

  const handleInstall = async () => {
    setIsOpen(false);
    if (isIos()) {
      alert('To install: tap the Share button, then "Add to Home Screen".');
      return;
    }
    const ok = await triggerInstall();
    if (!ok) alert('Install is not available right now. Try again in a moment, or use your browser menu > Install app.');
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email);
    });

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleExport = async () => {
    setIsOpen(false);
    try {
      const tables = ['items', 'packages', 'package_items', 'customers', 'bookings', 'booking_items'];
      const backupData = {};
      
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        backupData[table] = data;
      }
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      a.download = `tp-admin-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleImportClick = () => {
    setIsOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("WARNING: This will overwrite existing data. Are you sure you want to restore from this backup?")) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const tables = ['items', 'packages', 'customers', 'package_items', 'bookings', 'booking_items'];
      for (const table of tables) {
        if (!data[table]) throw new Error(`Missing table in backup: ${table}`);
      }

      for (const table of tables) {
        if (data[table].length > 0) {
          const { error } = await supabase.from(table).upsert(data[table]);
          if (error) throw error;
        }
      }

      alert('Restore complete! Please refresh the page.');
      window.location.reload();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`text-gray-600 hover:text-forest transition-all duration-200 active:scale-95 focus:outline-none ${isOpen ? 'text-forest' : ''}`}
      >
        <UserCircle 
          className="w-8 h-8 transition-colors" 
          fill={isOpen ? 'currentColor' : 'none'} 
          stroke={isOpen ? '#F5F1E6' : 'currentColor'} 
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-cream rounded-xl shadow-lg border border-gray-200 py-1 z-50 origin-top-right motion-safe:animate-pop-in">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-900 truncate">{email}</p>
          </div>
          
          <button 
            onClick={handleExport}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" /> Export Data
          </button>
          
          <button 
            onClick={handleImportClick}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Import Data
          </button>
          
          {showInstall && (
            <button
              onClick={handleInstall}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <Smartphone className="w-4 h-4" /> Install app
            </button>
          )}

          <div className="border-t border-gray-200 mt-1 pt-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </div>
      )}
      <input 
        type="file" 
        accept=".json,application/json"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

export default function PageHeader({ title, subtitle, actionLabel, onAction }) {
  return (
    <header className="p-4 flex justify-between items-center bg-cream sticky top-0 z-10 border-b border-gray-200">
      <img src="/tiga-pasak.png" alt="Tiga Pasak" className="h-10 w-auto" />
      <div className="flex items-center gap-2">
        {actionLabel && (
          <button 
            onClick={onAction}
            className="bg-forest text-white px-4 py-2 rounded-lg font-medium text-sm shadow hover:bg-forest-light transition-all duration-200 active:scale-95"
          >
            {actionLabel}
          </button>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}
