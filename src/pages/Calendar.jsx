import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/PageHeader';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ACTIVE = ['reserved', 'confirmed', 'out'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Calendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [bookings, setBookings] = useState([]);
  const [selected, setSelected] = useState(iso(today));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = iso(new Date(year, month, 1));
  const monthEnd = iso(new Date(year, month + 1, 0));

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_no, rental_date, return_date, status, customers(name)')
        .in('status', ACTIVE)
        .lte('rental_date', monthEnd)
        .gte('return_date', monthStart);
      setBookings(data || []);
    };
    load();
  }, [monthStart, monthEnd]);

  // Map each date -> { pickups: [], returns: [] }
  const byDate = {};
  const mark = (key, type, b) => {
    if (!byDate[key]) byDate[key] = { pickups: [], returns: [] };
    byDate[key][type].push(b);
  };
  bookings.forEach(b => {
    mark(b.rental_date, 'pickups', b);
    mark(b.return_date, 'returns', b);
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const sel = byDate[selected] || { pickups: [], returns: [] };
  const shift = (delta) => setCursor(new Date(year, month + delta, 1));

  return (
    <>
      <PageHeader title="Calendar" subtitle={`${MONTHS[month]} ${year}`} />
      <div className="p-4 space-y-4 motion-safe:animate-fade-in">
        <div className="bg-card rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => shift(-1)} className="p-2 text-gray-500 hover:text-forest active:scale-95 transition-all"><ChevronLeft className="w-5 h-5" /></button>
            <span className="font-semibold text-gray-900">{MONTHS[month]} {year}</span>
            <button onClick={() => shift(1)} className="p-2 text-gray-500 hover:text-forest active:scale-95 transition-all"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 mb-1">
            {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const key = iso(new Date(year, month, day));
              const marks = byDate[key];
              const isToday = key === iso(today);
              const isSel = key === selected;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-colors duration-150
                    ${isSel ? 'bg-forest text-white' : isToday ? 'bg-cream text-forest font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <span>{day}</span>
                  {marks && (
                    <span className="flex gap-0.5 mt-0.5 h-1.5">
                      {marks.pickups.length > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-forest'}`} />}
                      {marks.returns.length > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white/70' : 'bg-amber-500'}`} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-forest" /> Pickup</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Return</span>
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-800 mb-2">{selected}</h2>
          {sel.pickups.length === 0 && sel.returns.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-500 shadow-sm border border-gray-100">
              Nothing scheduled.
            </div>
          ) : (
            <div className="space-y-2">
              {sel.pickups.map(b => (
                <div key={`p${b.id}`} className="bg-card p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-forest shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-gray-900">{b.booking_no}</span>
                    <span className="text-sm text-gray-500 ml-2">{b.customers?.name}</span>
                  </div>
                  <span className="text-xs uppercase font-semibold text-forest">Pickup</span>
                </div>
              ))}
              {sel.returns.map(b => (
                <div key={`r${b.id}`} className="bg-card p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-gray-900">{b.booking_no}</span>
                    <span className="text-sm text-gray-500 ml-2">{b.customers?.name}</span>
                  </div>
                  <span className="text-xs uppercase font-semibold text-amber-600">Return</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
