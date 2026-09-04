import { NavLink } from 'react-router-dom';
import { Home, Package, BookOpen, Users, CalendarDays } from 'lucide-react';

export default function BottomTabBar() {
  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/inventory', icon: Package, label: 'Inventory' },
    { to: '/bookings', icon: BookOpen, label: 'Bookings' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  ];

  return (
    <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around items-center p-2 pb-safe z-50">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center p-2 text-xs font-medium rounded-lg transition-all duration-200 active:scale-95 ${
              isActive ? 'text-forest' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`w-6 h-6 mb-1 transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
