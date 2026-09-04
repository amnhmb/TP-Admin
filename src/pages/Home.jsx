import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/PageHeader';
import BookingFormModal from '../components/BookingFormModal';

const HELD_STATUSES = ['reserved', 'confirmed', 'out'];

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stats, setStats] = useState({ totalStock: 0, availableToday: 0, outNow: 0 });
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [itemsRes, heldRes, outRes, pickupsRes] = await Promise.all([
      supabase.from('items').select('total_quantity'),
      supabase
        .from('booking_items')
        .select('quantity, bookings!inner(status, rental_date, return_date)')
        .in('bookings.status', HELD_STATUSES)
        .lte('bookings.rental_date', today)
        .gte('bookings.return_date', today),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'out'),
      supabase
        .from('bookings')
        .select('id, booking_no, return_date, status, customers(name)')
        .eq('rental_date', today)
        .in('status', ['reserved', 'confirmed'])
        .order('booking_no'),
    ]);

    const totalStock = (itemsRes.data || []).reduce((s, i) => s + i.total_quantity, 0);
    const heldToday = (heldRes.data || []).reduce((s, r) => s + r.quantity, 0);

    setStats({
      totalStock,
      availableToday: totalStock - heldToday,
      outNow: outRes.count || 0,
    });
    setPickups(pickupsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <>
      <PageHeader title="TIGAPASAK" subtitle="Camping rental control" actionLabel="+ Booking" onAction={() => setIsModalOpen(true)} />
      <div className="p-4 space-y-6 motion-safe:animate-fade-in">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
            <span className="text-3xl font-bold text-gray-900">{loading ? '–' : stats.totalStock}</span>
            <span className="text-sm text-gray-500">Total stock</span>
          </div>
          <div className="bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
            <span className="text-3xl font-bold text-gray-900">{loading ? '–' : stats.availableToday}</span>
            <span className="text-sm text-gray-500">Available today</span>
          </div>
        </div>
        <div className="bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <span className="text-3xl font-bold text-gray-900">{loading ? '–' : stats.outNow}</span>
          <span className="text-sm text-gray-500">Out now</span>
        </div>

        <div>
          <h2 className="font-semibold text-gray-800 mb-2">Today's pickups ({loading ? 0 : pickups.length})</h2>
          {loading ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-500 shadow-sm border border-gray-100">
              Loading...
            </div>
          ) : pickups.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-500 shadow-sm border border-gray-100">
              No pickups today
            </div>
          ) : (
            <div className="space-y-3">
              {pickups.map((p, i) => (
                <div
                  key={p.id}
                  className="bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center opacity-0 motion-safe:animate-slide-up"
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                >
                  <div>
                    <h3 className="font-bold text-gray-900">{p.booking_no}</h3>
                    <p className="text-sm text-gray-800">{p.customers?.name}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <span className="uppercase font-semibold">{p.status}</span>
                    <p>Return {p.return_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <BookingFormModal
          onClose={() => setIsModalOpen(false)}
          bookingToEdit={null}
          onSaveSuccess={() => { setIsModalOpen(false); loadDashboard(); }}
        />
      )}
    </>
  );
}
