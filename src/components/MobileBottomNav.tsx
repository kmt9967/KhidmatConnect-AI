'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageContext';
import { Home, MapPin, Phone, User, AlertTriangle } from 'lucide-react';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { lang } = useLanguage();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#21262D] bg-[#0B0E14]/95 backdrop-blur-md md:hidden safe-area-pb">
      <div className="flex items-center justify-around px-2 py-2">
        <Link
          href="/"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
            isActive('/') ? 'text-[#3FB950]' : 'text-[#6E7681] hover:text-[#8B949E]'
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-medium">{lang === 'ur' ? 'ہوم' : 'Home'}</span>
        </Link>

        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
            isActive('/dashboard') ? 'text-[#3FB950]' : 'text-[#6E7681] hover:text-[#8B949E]'
          }`}
        >
          <MapPin className="h-5 w-5" />
          <span className="text-[10px] font-medium">{lang === 'ur' ? 'کیس' : 'Track'}</span>
        </Link>

        <Link
          href="/emergency"
          className="flex flex-col items-center justify-center -mt-4 h-14 w-14 rounded-full bg-gradient-to-br from-[#F85149] to-[#DA3633] text-white shadow-lg shadow-red-500/30 active:scale-95 transition-transform"
        >
          <AlertTriangle className="h-6 w-6" />
        </Link>

        <Link
          href="/nearby"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
            isActive('/nearby') ? 'text-[#3FB950]' : 'text-[#6E7681] hover:text-[#8B949E]'
          }`}
        >
          <Phone className="h-5 w-5" />
          <span className="text-[10px] font-medium">{lang === 'ur' ? 'مدد' : 'Help'}</span>
        </Link>

        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
            isActive('/dashboard') ? 'text-[#3FB950]' : 'text-[#6E7681] hover:text-[#8B949E]'
          }`}
        >
          <User className="h-5 w-5" />
          <span className="text-[10px] font-medium">{lang === 'ur' ? 'اکاؤنٹ' : 'Account'}</span>
        </Link>
      </div>
    </nav>
  );
}
