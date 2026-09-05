import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/PageHeader';
import { User, Trash2 } from 'lucide-react';
import { formatMyPhone } from '../utils/phone';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [orderCounts, setOrderCounts] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');

      const { data: bData } = await supabase
        .from('bookings')
        .select('customers(whatsapp)');

      if (bData) {
        const counts = {};
        bData.forEach(b => {
          const wa = b.customers?.whatsapp;
          if (wa) {
            counts[wa] = (counts[wa] || 0) + 1;
          }
        });
        setOrderCounts(counts);
      }

      if (!error && data) {
        setCustomers(data);
      }
      setLoading(false);
    };
    fetchCustomers();
  }, []);

  const handleDelete = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    setRemovingId(customer.id);
    setTimeout(async () => {
      const { error } = await supabase.from('customers').delete().eq('id', customer.id);
      if (error) {
        alert(error.code === '23503'
          ? 'This customer has bookings and cannot be deleted. Delete their bookings first.'
          : 'Error deleting customer: ' + error.message);
        setRemovingId(null);
        return;
      }
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      setRemovingId(null);
    }, 200);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.whatsapp.includes(search)
  );

  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.length} total`} />
      <div className="p-4 space-y-4 motion-safe:animate-fade-in">
        <input 
          type="text" 
          placeholder="Search name or number" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
        />
        
        {loading ? (
          <div className="text-center text-sm text-gray-500 py-8 motion-safe:animate-fade-in">Loading customers...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-100 motion-safe:animate-fade-in">
            {search ? 'No customers match your search.' : 'No customers yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustomers.map((customer, i) => (
              <div 
                key={customer.id} 
                className={`bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3 opacity-0 motion-safe:animate-slide-up ${removingId === customer.id ? 'animate-fade-out' : ''}`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div className="bg-cream p-2 rounded-full text-forest">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                    {customer.whatsapp && (
                      <span className="text-xs bg-cream text-forest px-2 py-0.5 rounded-full font-medium border border-forest/10">
                        {orderCounts[customer.whatsapp] || 0} order
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 font-mono mt-0.5">{formatMyPhone(customer.whatsapp)}</p>
                </div>
                <button onClick={() => handleDelete(customer)} className="ml-auto p-2 text-gray-400 hover:text-red-500 transition-all duration-200 active:scale-95">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
