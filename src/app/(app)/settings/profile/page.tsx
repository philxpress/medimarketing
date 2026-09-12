import { requireOrg } from "@/lib/auth/session";
import { UserProfileForm } from "@/components/settings/UserProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { member } = await requireOrg();
  return (
    <UserProfileForm
      displayName={member.displayName || ""}
      email={member.email}
      role={member.role}
    />
  );
}
