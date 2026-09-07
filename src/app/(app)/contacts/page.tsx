import { requireOrg } from "@/lib/auth/session";
import { getContacts, getLists } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { ContactsClient } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { orgId } = await requireOrg();
  const [contacts, lists] = await Promise.all([getContacts(orgId, 1000), getLists(orgId)]);

  return (
    <>
      <PageHeader
        title="Contacts & Lists"
        description="Upload your own CSV, or use the provided sample list to get started."
      />
      <ContactsClient
        initialContacts={contacts}
        lists={lists.map((l) => ({ id: l.id, name: l.name, count: l.contactIds.length }))}
      />
    </>
  );
}
