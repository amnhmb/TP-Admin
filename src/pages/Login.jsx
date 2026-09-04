import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-sm rounded-2xl shadow-sm p-6 border border-gray-100 motion-safe:animate-pop-in">
        <div className="mb-6 text-center">
          <h1 className="font-palioka text-4xl text-gray-900">Tiga Pasak</h1>
          <p className="text-sm text-gray-500 mt-1">Camping Rental Control</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm motion-safe:animate-fade-in">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-forest text-white py-2 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
      
      <div className="absolute bottom-6 w-full text-center">
        <p className="text-xs text-gray-400 opacity-60">Developed by @amnhmb</p>
      </div>
    </div>
  );
}
