import { requireOrg } from "@/lib/auth/session";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const { org, member } = await requireOrg();
  return (
    <OrgProfileForm
      name={org.name}
      postalAddress={org.postalAddress}
      replyToEmail={org.replyToEmail ?? ""}
      timezone={org.timezone ?? ""}
      canEdit={member.role !== "member"}
    />
  );
}
