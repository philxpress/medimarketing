"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Mail, ShieldCheck } from "lucide-react";

interface MemberRow {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  mfaEnrolled: boolean;
}
interface InviteRow {
  email: string;
  role: string;
  key: string;
}

export function TeamPanel({
  members,
  invites,
  currentUid,
  canManage,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  currentUid: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Invited ${data.email}. They'll join when they sign in with that email.`);
      setEmail("");
      router.refresh();
    } catch (err) {
      setMsg(`${err}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(uid: string, newRole: string) {
    await fetch(`/api/team/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    router.refresh();
  }

  async function removeMember(uid: string, who: string) {
    if (!window.confirm(`Remove ${who} from the workspace?`)) return;
    await fetch(`/api/team/members/${uid}`, { method: "DELETE" });
    router.refresh();
  }

  async function revoke(key: string) {
    await fetch(`/api/team/invites/${key}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card">
      {canManage && (
        <form onSubmit={invite} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label">Invite by email</label>
            <input
              type="email"
              className="input"
              placeholder="teammate@practice.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input w-32"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn-primary" disabled={busy}>
            <UserPlus size={16} /> Invite
          </button>
        </form>
      )}

      {msg && <p className="mb-3 text-sm text-neutral-900">{msg}</p>}

      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr className="border-b border-slate-100">
            <th className="py-2 pr-4 font-medium">Member</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 pr-4 font-medium">2FA</th>
            {canManage && <th className="py-2 font-medium"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {members.map((m) => {
            const isOwner = m.role === "owner";
            const isSelf = m.uid === currentUid;
            return (
              <tr key={m.uid}>
                <td className="py-2 pr-4">
                  <div className="font-medium text-neutral-900">
                    {m.displayName || m.email} {isSelf && <span className="text-neutral-500">(you)</span>}
                  </div>
                  <div className="text-xs text-neutral-500">{m.email}</div>
                </td>
                <td className="py-2 pr-4">
                  {canManage && !isOwner ? (
                    <select
                      className="input h-8 w-28 py-1"
                      value={m.role}
                      onChange={(e) => changeRole(m.uid, e.target.value)}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="capitalize text-neutral-700">{m.role}</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {m.mfaEnrolled ? (
                    <ShieldCheck size={16} className="text-neutral-900" />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                {canManage && (
                  <td className="py-2 text-right">
                    {!isOwner && !isSelf && (
                      <button
                        className="text-neutral-500 hover:text-neutral-900"
                        onClick={() => removeMember(m.uid, m.displayName || m.email)}
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {invites.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
            Pending invites
          </h3>
          <ul className="space-y-1">
            {invites.map((i) => (
              <li key={i.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-neutral-900">
                  <Mail size={14} className="text-neutral-500" />
                  {i.email}
                  <span className="badge bg-slate-100 capitalize text-neutral-700">{i.role}</span>
                </span>
                {canManage && (
                  <button
                    className="text-xs text-neutral-500 hover:text-neutral-900"
                    onClick={() => revoke(i.key)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!canManage && (
        <p className="mt-3 text-xs text-neutral-500">
          Only owners and admins can invite or manage members.
        </p>
      )}
    </div>
  );
}
