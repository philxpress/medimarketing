import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getCurrentUser, getOrgIdForUser, requireOrg } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/platformAdmin";
import { getIntegrations } from "@/lib/data";
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
  const integrations = await getIntegrations(orgId);
  const broken = integrations.filter((i) => i.status === "error");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orgName={org.name}
        userName={member.displayName || member.email}
        role={member.role}
        isPlatformAdmin={isPlatformAdminEmail(user.email)}
      />
      <main className="flex-1 overflow-x-hidden">
        {broken.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900">
            <AlertTriangle size={15} className="mr-1.5 inline" />
            {broken.map((i) => i.connectedEmail || i.provider).join(", ")}{" "}
            {broken.length === 1 ? "mailbox needs" : "mailboxes need"} reconnecting — sends
            from {broken.length === 1 ? "it" : "them"} are paused.{" "}
            <Link href="/settings/mailboxes" className="font-medium underline">
              Reconnect
            </Link>
          </div>
        )}
        <div className="px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
