import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/PageHeader';
import BookingFormModal from '../components/BookingFormModal';
import { Search, Edit2, Trash2 } from 'lucide-react';
import { formatMyPhone } from '../utils/phone';

const STATUSES = ['all', 'reserved', 'confirmed', 'out', 'returned', 'cancelled'];

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*, customers(name, whatsapp), packages(name)')
      .order('rental_date', { ascending: false });
    
    if (!error && data) {
      setBookings(data);
    }
    setLoading(false);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase.rpc('set_booking_status', { p_booking_id: id, p_status: newStatus });
      if (error) throw error;
      fetchBookings();
    } catch (err) {
      alert("Error updating status: " + err.message);
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete booking ${b.booking_no}? This cannot be undone.`)) return;
    setRemovingId(b.id);
    setTimeout(async () => {
      const { error } = await supabase.from('bookings').delete().eq('id', b.id);
      if (error) {
        alert('Error deleting booking: ' + error.message);
        setRemovingId(null);
        return;
      }
      setBookings(prev => prev.filter(x => x.id !== b.id));
      setRemovingId(null);
    }, 200);
  };

  const openNew = () => {
    setEditingBooking(null);
    setIsModalOpen(true);
  };

  const openEdit = (b) => {
    setEditingBooking(b);
    setIsModalOpen(true);
  };

  const filtered = bookings.filter(b => {
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchSearch = (b.booking_no.toLowerCase().includes(search.toLowerCase()) || 
                         b.customers.name.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  return (
    <>
      <PageHeader 
        title="Bookings" 
        subtitle={`${filtered.length} bookings`} 
        actionLabel="+ New" 
        onAction={openNew} 
      />
      
      <div className="p-4 space-y-4 motion-safe:animate-fade-in">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search booking # or customer" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 border border-gray-300 rounded-lg p-3 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {STATUSES.map(s => (
            <button 
              key={s} 
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${filterStatus === s ? 'bg-forest text-white shadow' : 'bg-white text-gray-600 border border-gray-200'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-sm text-gray-500 py-8 motion-safe:animate-fade-in">Loading bookings...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-100 motion-safe:animate-fade-in">
            No bookings found.
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {filtered.map((b, i) => (
              <div 
                key={b.id} 
                className={`bg-card p-4 rounded-2xl shadow-sm border border-gray-100 opacity-0 motion-safe:animate-slide-up ${removingId === b.id ? 'animate-fade-out' : ''}`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{b.booking_no}</h3>
                    <p className="text-sm font-medium text-gray-800">{b.customers.name}</p>
                    {b.customers?.whatsapp && (
                      <p className="text-sm text-gray-500 font-mono">{formatMyPhone(b.customers.whatsapp)}</p>
                    )}
                  </div>
                  <div className="flex -mr-2">
                    <button onClick={() => openEdit(b)} className="p-2 text-gray-400 hover:text-forest transition-all active:scale-95">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(b)} className="p-2 text-gray-400 hover:text-red-500 transition-all active:scale-95">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500 mb-3 grid grid-cols-2 gap-1">
                  <div><span className="font-medium text-gray-700">Out:</span> {b.rental_date}</div>
                  <div><span className="font-medium text-gray-700">In:</span> {b.return_date}</div>
                  {b.packages && <div className="col-span-2"><span className="font-medium text-gray-700">Pkg:</span> {b.packages.name}</div>}
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-gray-400">{b.fulfillment}</span>
                  <select 
                    value={b.status} 
                    onChange={(e) => handleStatusChange(b.id, e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 bg-white focus:ring-forest outline-none capitalize shadow-sm transition-colors cursor-pointer"
                  >
                    {STATUSES.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <BookingFormModal 
          onClose={() => setIsModalOpen(false)} 
          bookingToEdit={editingBooking}
          onSaveSuccess={() => {
            setIsModalOpen(false);
            fetchBookings();
          }}
        />
      )}
    </>
  );
}
