import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { X, Plus, AlertCircle } from 'lucide-react';

const STATUSES = ['reserved', 'confirmed', 'out', 'returned', 'cancelled'];

import { getCanonicalPhone, formatMyPhone } from '../utils/phone';

export default function BookingFormModal({ onClose, bookingToEdit, onSaveSuccess }) {
  const [items, setItems] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form State
  const [bookingNo, setBookingNo] = useState('');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [rentalDate, setRentalDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [packageId, setPackageId] = useState('');
  const [additionalItems, setAdditionalItems] = useState([]);
  const [fulfillment, setFulfillment] = useState('pickup');
  const [status, setStatus] = useState('reserved');
  const [notes, setNotes] = useState('');
  
  // Availability State
  const [availabilityContext, setAvailabilityContext] = useState({});
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const todayYYMMDD = new Date().toISOString().slice(2, 10).replace(/-/g, '');

  useEffect(() => {
    async function loadData() {
      try {
      const [itemsRes, pkgsRes] = await Promise.all([
        supabase.from('items').select('id, name, total_quantity'),
        supabase.from('packages').select('id, name, package_items(item_id, quantity)')
      ]);
      if (itemsRes.data) setItems(itemsRes.data);
      if (pkgsRes.data) setPackages(pkgsRes.data);

      if (bookingToEdit) {
        // Need customer details
        const { data: bData } = await supabase
          .from('bookings')
          .select('*, customers(name, whatsapp), booking_items(item_id, quantity)')
          .eq('id', bookingToEdit.id)
          .single();
        if (bData) {
          // customers may come back as an object or (defensively) an array
          const cust = Array.isArray(bData.customers) ? bData.customers[0] : bData.customers;
          setBookingNo(bData.booking_no || '');
          setName(cust?.name || '');
          setWhatsapp(formatMyPhone(cust?.whatsapp || ''));
          setRentalDate(bData.rental_date);
          setReturnDate(bData.return_date);
          setPackageId(bData.package_id || '');
          setFulfillment(bData.fulfillment);
          setStatus(bData.status);
          setNotes(bData.notes || '');

          // Filter out package items from additionalItems to avoid double counting
          // Actually, update_booking requires additional_items to NOT include package items if package is selected, 
          // because it adds them internally. Wait, the DB stores them all in booking_items.
          // To correctly load edit state: we must subtract the package items from booking_items to get additional.
          let extras = bData.booking_items;
          if (bData.package_id && pkgsRes.data) {
            const pkg = pkgsRes.data.find(p => p.id === bData.package_id);
            if (pkg) {
              pkg.package_items.forEach(pi => {
                const idx = extras.findIndex(e => e.item_id === pi.item_id);
                if (idx !== -1) {
                  extras[idx].quantity -= pi.quantity;
                  if (extras[idx].quantity <= 0) {
                    extras.splice(idx, 1);
                  }
                }
              });
            }
          }
          setAdditionalItems(extras);
        }
      }
      } catch (err) {
        setErrorMsg(err.message || 'Failed to load form');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, [bookingToEdit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (whatsapp && whatsapp !== formatMyPhone(whatsapp)) {
        setWhatsapp(formatMyPhone(whatsapp));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [whatsapp]);

  // Aggregate total requested quantities per item
  const requestedQuantities = {};
  if (packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (pkg) {
      pkg.package_items.forEach(pi => {
        requestedQuantities[pi.item_id] = (requestedQuantities[pi.item_id] || 0) + pi.quantity;
      });
    }
  }
  additionalItems.forEach(ai => {
    requestedQuantities[ai.item_id] = (requestedQuantities[ai.item_id] || 0) + parseInt(ai.quantity || 0);
  });

  const checkAvailability = async () => {
    if (!rentalDate || !returnDate || Object.keys(requestedQuantities).length === 0) {
      setAvailabilityContext({});
      return;
    }
    // Only care about checking if status isn't returned/cancelled
    if (['returned', 'cancelled'].includes(status)) {
      setAvailabilityContext({});
      return;
    }
    const newContext = {};
    for (const itemId of Object.keys(requestedQuantities)) {
      const { data, error } = await supabase.rpc('get_available_quantity', {
        p_item_id: itemId,
        p_req_start: rentalDate,
        p_req_end: returnDate,
        p_exclude_booking_id: bookingToEdit ? bookingToEdit.id : null
      });
      if (!error && data !== null) {
        newContext[itemId] = data; // available amount
      }
    }
    setAvailabilityContext(newContext);
  };

  useEffect(() => {
    if (!loadingInitial) {
      const timeoutId = setTimeout(() => {
        checkAvailability();
      }, 300); // debounce
      return () => clearTimeout(timeoutId);
    }
  }, [rentalDate, returnDate, packageId, additionalItems, status, loadingInitial]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (rentalDate > returnDate) {
      setErrorMsg("Return date cannot be before rental date.");
      return;
    }
    
    // Check local availability context to prevent bad saves
    let hasOverbook = false;
    for (const [itemId, reqQty] of Object.entries(requestedQuantities)) {
      const avail = availabilityContext[itemId];
      if (avail !== undefined && avail < reqQty) hasOverbook = true;
    }
    if (hasOverbook) {
      if (!window.confirm("WARNING: Some items are overbooked based on current availability. The database will reject this if true. Attempt save anyway?")) {
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      p_customer_name: name,
      p_customer_whatsapp: getCanonicalPhone(whatsapp),
      p_rental_date: rentalDate,
      p_return_date: returnDate,
      p_fulfillment: fulfillment,
      p_status: status,
      p_package_id: packageId || null,
      p_notes: notes,
      p_additional_items: additionalItems.length > 0 ? additionalItems : null
    };

    try {
      if (bookingToEdit) {
        const { error } = await supabase.rpc('update_booking', { ...payload, p_booking_id: bookingToEdit.id });
        if (error) throw error;
      } else {
        const num = bookingNo.trim();
        const composedNo = num ? `TP-${todayYYMMDD}-${num.padStart(4, '0')}` : null;
        const { error } = await supabase.rpc('create_booking', { ...payload, p_booking_no: composedNo });
        if (error) throw error;
      }
      onSaveSuccess();
    } catch (err) {
      if (err.code === '23505' || (err.message && (err.message.includes('bookings_booking_no_key') || err.message.includes('duplicate key')))) {
        setErrorMsg('Booking number already in use. Please choose another.');
      } else {
        setErrorMsg(err.message || 'Error saving booking');
      }
    }
    setSaving(false);
  };

  return createPortal((
    <div className="fixed inset-0 z-[60] flex flex-col bg-cream motion-safe:animate-fade-in sm:p-4">
      <div className="bg-cream sm:bg-card sm:rounded-2xl sm:shadow-lg sm:border sm:border-gray-100 flex-1 sm:flex-none sm:h-[85vh] w-full max-w-md mx-auto flex flex-col overflow-hidden relative sm:motion-safe:animate-pop-in">
        <header className="shrink-0 p-4 flex justify-between items-center bg-cream sm:bg-card sticky top-0 z-10 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {bookingToEdit ? 'Edit Booking' : 'New Booking'}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none transition-all duration-200 active:scale-95">
            <X className="w-6 h-6" />
          </button>
        </header>

        {loadingInitial ? (
          <div className="flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 flex items-center justify-center">
            <div className="text-center text-gray-500">Loading form...</div>
          </div>
        ) : (
          <form id="booking-form" onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 space-y-6">
              {errorMsg && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex gap-2 items-start motion-safe:animate-pop-in">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Customer Info */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider">Customer</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking No</label>
                  {bookingToEdit ? (
                    <input type="text" readOnly value={bookingNo} className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-lg p-2 outline-none cursor-not-allowed" />
                  ) : (
                    <>
                      <div className="flex items-stretch">
                        <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm select-none">TP-{todayYYMMDD}-</span>
                        <input type="text" inputMode="numeric" value={bookingNo} onChange={e => setBookingNo(e.target.value.replace(/\D/g, ''))} placeholder="auto" className="flex-1 border border-gray-300 rounded-r-lg p-2 focus:ring-forest focus:border-forest outline-none transition-colors" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Leave blank to auto-generate the next number.</p>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-forest focus:border-forest outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="text" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} onBlur={() => setWhatsapp(formatMyPhone(whatsapp))} placeholder="e.g. +60 12-345 6789" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-forest focus:border-forest outline-none transition-colors" />
                </div>
              </div>

              {/* Booking Details */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider">Dates & Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rental Date</label>
                    <input type="date" required value={rentalDate} onChange={e => setRentalDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-forest outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Return Date</label>
                    <input type="date" required value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-forest outline-none transition-colors" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fulfillment</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button type="button" onClick={() => setFulfillment('pickup')} className={`flex-1 text-sm py-1 rounded-md transition-colors ${fulfillment === 'pickup' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>Pickup</button>
                      <button type="button" onClick={() => setFulfillment('delivery')} className={`flex-1 text-sm py-1 rounded-md transition-colors ${fulfillment === 'delivery' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>Delivery</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-forest outline-none capitalize">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider">Equipment</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Package</label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPackageId('')} className={`px-3 py-1 rounded-full text-sm border transition-colors duration-200 ${!packageId ? 'bg-forest text-white border-forest' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>None</button>
                    {packages.map(p => (
                      <button key={p.id} type="button" onClick={() => setPackageId(p.id)} className={`px-3 py-1 rounded-full text-sm border transition-colors duration-200 ${packageId === p.id ? 'bg-forest text-white border-forest' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Additional Items</label>
                    <button type="button" onClick={() => { if(items.length) setAdditionalItems([...additionalItems, {item_id: items[0].id, quantity: 1}]) }} className="text-xs text-forest font-medium flex items-center hover:underline active:scale-95 transition-all">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </button>
                  </div>
                  {additionalItems.map((ai, idx) => (
                    <div key={idx} className="flex gap-2 items-center mb-2">
                      <select value={ai.item_id} onChange={(e) => {
                        const newAi = [...additionalItems];
                        newAi[idx].item_id = e.target.value;
                        setAdditionalItems(newAi);
                      }} className="flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-forest outline-none">
                        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <input type="number" min="1" value={ai.quantity} onChange={(e) => {
                        const newAi = [...additionalItems];
                        newAi[idx].quantity = e.target.value;
                        setAdditionalItems(newAi);
                      }} className="w-16 border border-gray-300 rounded p-2 text-sm focus:ring-forest outline-none" />
                      <button type="button" onClick={() => setAdditionalItems(additionalItems.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1 active:scale-95 transition-all"><X className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
                
                {/* Availability Feedback List */}
                {Object.keys(requestedQuantities).length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Availability Check</label>
                    <div className="space-y-1">
                      {Object.entries(requestedQuantities).map(([itemId, reqQty]) => {
                        const it = items.find(i => i.id === itemId);
                        if (!it) return null;
                        const avail = availabilityContext[itemId];
                        const isChecking = avail === undefined;
                        const isOver = !isChecking && avail < reqQty;
                        return (
                          <div key={itemId} className={`text-xs flex justify-between ${isOver ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                            <span>{reqQty}x {it.name}</span>
                            <span>{isChecking ? '...' : (['returned','cancelled'].includes(status) ? '-' : `${avail} available`)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="2" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-forest outline-none transition-colors text-sm"></textarea>
              </div>
            </div>

            <div className="p-4 bg-white sm:bg-card border-t border-gray-200 mt-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] sm:shadow-none pb-safe shrink-0">
              <button 
                type="submit" 
                disabled={saving}
                className="w-full bg-forest text-white py-3 rounded-lg font-medium shadow hover:bg-forest-light transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : (bookingToEdit ? 'Save Changes' : 'Create Booking')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  ), document.body);
}
