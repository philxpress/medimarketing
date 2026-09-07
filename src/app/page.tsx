import { redirect } from "next/navigation";
import { getCurrentUser, getOrgIdForUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = await getOrgIdForUser(user.uid);
  redirect(orgId ? "/dashboard" : "/onboarding");
}
