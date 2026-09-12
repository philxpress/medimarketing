import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/platformAdmin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Not an operator → send them back to their own workspace, don't reveal /admin.
  if (!isPlatformAdminEmail(user.email)) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar email={user.email} />
      <main className="flex-1 overflow-x-hidden">
        <div className="px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
