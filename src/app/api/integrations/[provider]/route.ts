import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { logEvent } from "@/lib/data";

/** Disconnect (revoke) a connected mailbox. */
export async function DELETE(
  _req: Request,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  if (provider !== "gmail" && provider !== "microsoft") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  try {
    const { orgId, user } = await requireOrg();
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("integrations")
      .doc(provider)
      .delete();
    await logEvent(orgId, {
      type: "integration.revoked",
      actorUid: user.uid,
      summary: `Disconnected ${provider} mailbox`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
