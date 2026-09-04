import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/PageHeader';
import PackagesModal from '../components/PackagesModal';
import { Edit2, Trash2 } from 'lucide-react';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', total_quantity: 1 });
  const [saving, setSaving] = useState(false);

  const [isPackagesModalOpen, setIsPackagesModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setItems(data);
    }
    setLoading(false);
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ name: '', total_quantity: 1 });
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({ name: item.name, total_quantity: item.total_quantity });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setRemovingId(id);
    setTimeout(async () => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) {
        alert(error.code === '23503'
          ? 'This item is used in a package or booking and cannot be deleted.'
          : 'Error deleting item: ' + error.message);
        setRemovingId(null);
        return;
      }
      setItems(prev => prev.filter(x => x.id !== id));
      setRemovingId(null);
    }, 200);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    if (editingItem) {
      await supabase
        .from('items')
        .update({ name: formData.name, total_quantity: parseInt(formData.total_quantity) })
        .eq('id', editingItem.id);
    } else {
      await supabase
        .from('items')
        .insert([{ name: formData.name, total_quantity: parseInt(formData.total_quantity) }]);
    }
    
    setSaving(false);
    setIsModalOpen(false);
    fetchItems();
  };

  return (
    <>
      <PageHeader 
        title="Inventory" 
        subtitle={`${items.length} item types`} 
        actionLabel="+ Item" 
        onAction={openAddModal} 
      />
      
      <div className="p-4 space-y-4 motion-safe:animate-fade-in">
        <input 
          type="text" 
          placeholder="Search item name..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
        />
        
        <button 
          onClick={() => setIsPackagesModalOpen(true)}
          className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-all duration-200 active:scale-95"
        >
          Manage packages
        </button>

        {loading ? (
          <div className="text-center text-sm text-gray-500 py-8 motion-safe:animate-fade-in">Loading inventory...</div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-100 motion-safe:animate-fade-in">
            {search ? 'No items match your search.' : 'No items yet. Add your first piece of gear.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, i) => (
              <div 
                key={item.id} 
                className={`bg-card p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center opacity-0 motion-safe:animate-slide-up ${removingId === item.id ? 'animate-fade-out' : ''}`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <p className="text-sm text-gray-500">Qty: {item.total_quantity}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditModal(item)} className="p-2 text-gray-400 hover:text-forest transition-all duration-200 active:scale-95">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-all duration-200 active:scale-95">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 motion-safe:animate-fade-in">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-lg p-6 border border-gray-100 relative opacity-0 motion-safe:animate-pop-in">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingItem ? 'Edit equipment' : 'Add equipment'}
            </h2>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
                <input 
                  type="text" 
                  required 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Coleman Tent 4P"
                  className="w-full border border-gray-300 rounded-lg p-2 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total quantity</label>
                <input 
                  type="number" 
                  min="1"
                  required 
                  value={formData.total_quantity}
                  onChange={e => setFormData({...formData, total_quantity: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg p-2 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-medium shadow-sm hover:bg-gray-50 transition-all duration-200 active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="flex-1 bg-forest text-white py-2 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save item'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {isPackagesModalOpen && (
        <PackagesModal onClose={() => setIsPackagesModalOpen(false)} availableItems={items} />
      )}
    </>
  );
}
