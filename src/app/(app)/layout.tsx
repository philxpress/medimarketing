import { redirect } from "next/navigation";
import { getCurrentUser, getOrgIdForUser, requireOrg } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/platformAdmin";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = await getOrgIdForUser(user.uid);
  if (!orgId) redirect("/onboarding");

  const { org, member } = await requireOrg();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orgName={org.name}
        userName={member.displayName || member.email}
        role={member.role}
        isPlatformAdmin={isPlatformAdminEmail(user.email)}
      />
      <main className="flex-1 overflow-x-hidden">
        <div className="px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
