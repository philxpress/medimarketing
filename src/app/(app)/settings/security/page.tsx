import { requireOrg } from "@/lib/auth/session";
import { MfaPanel } from "@/components/settings/MfaPanel";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const { member } = await requireOrg();
  return <MfaPanel initialEnrolled={member.mfaEnrolled} email={member.email} />;
}
