import { requireOrg } from "@/lib/auth/session";
import { getMembers, getInvites, inviteKey } from "@/lib/data";
import { TeamPanel } from "@/components/settings/TeamPanel";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const { orgId, member, user } = await requireOrg();
  const [members, invites] = await Promise.all([getMembers(orgId), getInvites(orgId)]);
  return (
    <TeamPanel
      currentUid={user.uid}
      canManage={member.role !== "member"}
      members={members.map((m) => ({
        uid: m.uid,
        email: m.email,
        displayName: m.displayName,
        role: m.role,
        mfaEnrolled: m.mfaEnrolled,
      }))}
      invites={invites.map((i) => ({
        email: i.email,
        role: i.role,
        key: inviteKey(i.email),
      }))}
    />
  );
}
