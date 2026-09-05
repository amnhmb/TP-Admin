export function getCanonicalPhone(val) {
  if (!val) return '';
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '6' + digits;
  else if (digits.length > 0 && !digits.startsWith('6')) digits = '60' + digits;
  return digits;
}

export function formatMyPhone(val) {
  if (!val) return '';
  let d = getCanonicalPhone(val);
  
  if (d.length === 10) {
    let match = d.match(/^6(\d{1})(\d{2})(\d{2})(\d{4})$/);
    if (match) {
      return `+6${match[1]} ${match[2]}-${match[3]} ${match[4]}`;
    }
  } else if (d.length === 11) {
    let match = d.match(/^6(\d{1})(\d{2})(\d{3})(\d{4})$/);
    if (match) {
      return `+6${match[1]} ${match[2]}-${match[3]} ${match[4]}`;
    }
  } else if (d.length === 12) {
    let match = d.match(/^6(\d{1})(\d{2})(\d{4})(\d{4})$/);
    if (match) {
      return `+6${match[1]} ${match[2]}-${match[3]} ${match[4]}`;
    }
  }

  // If we are currently typing in an input, it might not be full yet.
  // But wait, the prompt says "Kalau formatMyPhone tak boleh hasilkan format penuh, pulangkan nombor asal"
  // This applies to both typing and displaying.
  // However, returning partial format is nice for typing.
  // Let's stick strictly to what user asked: if not full format, return original.
  return val;
}
