"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Users,
  Mail,
  History,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import { logout } from "@/lib/auth/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts & Lists", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/campaigns/new", label: "New campaign", icon: Sparkles },
  { href: "/history", label: "Email history", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  orgName,
  userName,
  role,
}: {
  orgName: string;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Activity size={20} />
        </span>
        <div>
          <div className="font-bold leading-tight text-slate-900">MediReach</div>
          <div className="max-w-[9rem] truncate text-xs text-slate-400">{orgName}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/campaigns" && href !== "/dashboard" && pathname.startsWith(href)) ||
            (href === "/campaigns" && pathname === "/campaigns");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 px-2">
          <div className="truncate text-sm font-medium text-slate-700">{userName}</div>
          <div className="text-xs capitalize text-slate-400">{role}</div>
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          onClick={async () => {
            await logout();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </aside>
  );
}
