"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building2, Plug, Users, ShieldCheck } from "lucide-react";

const ITEMS = [
  { href: "/settings/profile", label: "User profile", icon: User },
  { href: "/settings/company", label: "Company", icon: Building2 },
  { href: "/settings/mailboxes", label: "Connected mailboxes", icon: Plug },
  { href: "/settings/team", label: "Teams", icon: Users },
  { href: "/settings/security", label: "Security", icon: ShieldCheck },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-neutral-900 hover:bg-slate-50"
            }`}
          >
            <Icon size={16} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
