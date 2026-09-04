import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, X, Plus, ChevronLeft } from 'lucide-react';

export default function PackagesModal({ onClose, availableItems }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // View state: 'list' | 'edit'
  const [view, setView] = useState('list');
  
  // Edit state
  const [editingPkg, setEditingPkg] = useState(null); // null if new
  const [pkgName, setPkgName] = useState('');
  const [pkgItems, setPkgItems] = useState([]); // [{ item_id, quantity }]
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('packages')
      .select('*, package_items(item_id, quantity)')
      .order('name');
    if (!error && data) {
      setPackages(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this package?")) return;
    setRemovingId(id);
    setTimeout(async () => {
      const { error } = await supabase.from('packages').delete().eq('id', id);
      if (error) {
        alert('Error deleting package: ' + error.message);
        setRemovingId(null);
        return;
      }
      setPackages(prev => prev.filter(p => p.id !== id));
      setRemovingId(null);
    }, 200);
  };

  const openEdit = (pkg) => {
    setEditingPkg(pkg);
    setPkgName(pkg ? pkg.name : '');
    setPkgItems(pkg && pkg.package_items ? pkg.package_items : []);
    setView('edit');
  };

  const handleAddItem = () => {
    if (availableItems.length === 0) return;
    setPkgItems([...pkgItems, { item_id: availableItems[0].id, quantity: 1 }]);
  };

  const updatePkgItem = (index, field, value) => {
    const newItems = [...pkgItems];
    newItems[index][field] = value;
    setPkgItems(newItems);
  };

  const removePkgItem = (index) => {
    setPkgItems(pkgItems.filter((_, i) => i !== index));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!pkgName) return;
    setSaving(true);
    try {
      let packageId = editingPkg?.id;
      
      if (!packageId) {
        // Insert package
        const { data, error } = await supabase
          .from('packages')
          .insert([{ name: pkgName }])
          .select()
          .single();
        if (error) throw error;
        packageId = data.id;
      } else {
        // Update package
        const { error } = await supabase
          .from('packages')
          .update({ name: pkgName })
          .eq('id', packageId);
        if (error) throw error;
        
        // Delete old items
        await supabase.from('package_items').delete().eq('package_id', packageId);
      }
      
      // Insert new items
      if (pkgItems.length > 0) {
        const itemsToInsert = pkgItems.map(pi => ({
          package_id: packageId,
          item_id: pi.item_id,
          quantity: parseInt(pi.quantity)
        }));
        const { error: itemsError } = await supabase.from('package_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }
      
      setView('list');
      fetchPackages();
    } catch (err) {
      alert("Error saving package: " + err.message);
    }
    setSaving(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-cream motion-safe:animate-fade-in sm:p-4">
      <div className="bg-cream sm:bg-card sm:rounded-2xl sm:shadow-lg sm:border sm:border-gray-100 flex-1 sm:flex-none sm:h-[85vh] w-full max-w-md mx-auto flex flex-col overflow-hidden relative sm:motion-safe:animate-pop-in">
        
        <header className="shrink-0 p-4 flex justify-between items-center bg-cream sm:bg-card sticky top-0 z-10 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {view === 'edit' && (
              <button onClick={() => setView('list')} className="p-1 -ml-2 text-gray-500 hover:text-gray-900">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <h2 className="text-xl font-bold text-gray-900">
              {view === 'list' ? 'Manage Packages' : (editingPkg ? 'Edit Package' : 'New Package')}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none transition-all duration-200 active:scale-95">
            <X className="w-6 h-6" />
          </button>
        </header>

        {view === 'list' ? (
          <div className="flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 space-y-4">
            <button 
              onClick={() => openEdit(null)}
              className="w-full bg-forest text-white py-2 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95"
            >
              + Create Package
            </button>

            {loading ? (
              <div className="text-center text-sm text-gray-500 py-8">Loading packages...</div>
            ) : packages.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-100">
                No packages yet.
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <div key={pkg.id} className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center ${removingId === pkg.id ? 'animate-fade-out' : ''}`}>
                    <div>
                      <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                      <p className="text-xs text-gray-500">{pkg.package_items.length} items</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(pkg)} className="p-2 text-gray-400 hover:text-forest transition-all duration-200 active:scale-95">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(pkg.id)} className="p-2 text-gray-400 hover:text-red-500 transition-all duration-200 active:scale-95">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Name</label>
                <input 
                  type="text" 
                  required 
                  value={pkgName}
                  onChange={e => setPkgName(e.target.value)}
                  placeholder="e.g. Starter Kit"
                  className="w-full border border-gray-300 rounded-lg p-2 bg-white focus:ring-forest focus:border-forest outline-none transition-colors duration-200" 
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Included Items</label>
                  <button type="button" onClick={handleAddItem} className="text-xs text-forest font-medium flex items-center hover:underline">
                    <Plus className="w-3 h-3 mr-1" /> Add item
                  </button>
                </div>
                
                {pkgItems.length === 0 ? (
                  <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg text-center border border-dashed border-gray-300">
                    No items added.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pkgItems.map((pi, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <select 
                          value={pi.item_id}
                          onChange={(e) => updatePkgItem(idx, 'item_id', e.target.value)}
                          className="flex-1 border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:ring-forest focus:border-forest"
                        >
                          {availableItems.map(ai => (
                            <option key={ai.id} value={ai.id}>{ai.name}</option>
                          ))}
                        </select>
                        <input 
                          type="number"
                          min="1"
                          value={pi.quantity}
                          onChange={(e) => updatePkgItem(idx, 'quantity', e.target.value)}
                          className="w-16 border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:ring-forest focus:border-forest"
                        />
                        <button type="button" onClick={() => removePkgItem(idx)} className="text-red-400 hover:text-red-600 p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white sm:bg-card border-t border-gray-200 mt-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] sm:shadow-none pb-safe shrink-0">
              <button 
                type="submit" 
                disabled={saving}
                className="w-full bg-forest text-white py-3 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Package'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
