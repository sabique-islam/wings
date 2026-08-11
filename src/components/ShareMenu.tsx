import { useState, useCallback, useEffect } from "react";
import { Entry } from "@/lib/journal";
import { Share2, Copy, Check, Globe, Lock, X, Link as LinkIcon, ChevronDown, Trash2 } from "@/lib/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendShareInviteEmail } from "@/lib/email";
import { toast } from "sonner";
import { logError } from "@/lib/logger";

interface Props {
  entry: Entry;
  onUpdate: (entry: Entry) => void;
}

interface ShareRecord {
  id: string;
  entry_id: string;
  shared_with_email: string;
  shared_with_user_id: string | null;
  role: string;
  created_at: string;
  created_by: string;
}

type Role = "viewer" | "editor" | "admin";

const roleLabels: Record<Role, string> = {
  viewer: "Can view",
  editor: "Can edit",
  admin: "Full access",
};

const roleDescriptions: Record<Role, string> = {
  viewer: "Read-only access",
  editor: "Can add text, images & edit content",
  admin: "Can edit, delete & manage sharing",
};

function generateToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ShareMenu({ entry, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [lastInvited, setLastInvited] = useState<{ email: string; url: string } | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
  const { user } = useAuth();

  const isShared = !!entry.share_token;
  const shareUrl = isShared ? `${window.location.origin}/s/${entry.share_token}` : null;

  const loadShares = useCallback(() => {
    supabase
      .from("entry_shares")
      .select("*")
      .eq("entry_id", entry.id)
      .then(({ data, error }) => {
        if (error) {
          logError("Failed to load shares", error);
          return;
        }
        if (data) setShares(data as ShareRecord[]);
      });
  }, [entry.id]);

  useEffect(() => {
    if (!open) return;
    loadShares();
  }, [open, loadShares]);

  const togglePublicShare = useCallback(async () => {
    setLoading(true);
    const newToken = isShared ? null : generateToken();
    const { data, error } = await supabase
      .from("entries")
      .update({ share_token: newToken })
      .eq("id", entry.id)
      .select("share_token")
      .maybeSingle();
    if (error) {
      toast.error("Couldn't update public link", { description: error.message });
    } else if (!data) {
      toast.error("Couldn't update public link", { description: "Permission denied or page not found." });
    } else {
      onUpdate({ ...entry, share_token: data.share_token });
    }
    setLoading(false);
  }, [entry, isShared, onUpdate]);

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const inviteUser = useCallback(async () => {
    if (!email.trim() || !user) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email");
      return;
    }
    if (email.trim() === user.email) {
      setError("You can't share with yourself");
      return;
    }
    setInviting(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("entry_shares")
      .insert({
        entry_id: entry.id,
        shared_with_email: email.trim().toLowerCase(),
        role: selectedRole,
        created_by: user.id,
      } as any)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        setError("Already shared with this email");
      } else {
        setError("Failed to share");
      }
    } else if (data) {
      setShares((prev) => [...prev, data as ShareRecord]);
      const invitedEmail = email.trim().toLowerCase();
      // Invites deep-link to the authenticated note — no public token is minted.
      // Recipients get access through their share row after signing in.
      const inviteUrl = `${window.location.origin}/n/${entry.id}`;
      setLastInvited({ email: invitedEmail, url: inviteUrl });
      setInviteLinkCopied(false);
      setEmail("");
      window.dispatchEvent(new CustomEvent("nw:shares-changed", { detail: entry.id }));
      const { error: emailError } = await sendShareInviteEmail({
        to: invitedEmail,
        entryId: entry.id,
      });
      if (emailError) {
        toast.message("Invite saved", { description: "Link copied — email could not be sent." });
      }
    }
    setInviting(false);
  }, [email, selectedRole, entry.id, user]);

  const updateRole = useCallback(async (shareId: string, newRole: Role) => {
    const { error } = await supabase
      .from("entry_shares")
      .update({ role: newRole } as any)
      .eq("id", shareId);
    if (error) {
      toast.error("Couldn't update role", { description: error.message });
      return;
    }
    setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, role: newRole } : s)));
    setRoleDropdownId(null);
  }, []);

  const removeShare = useCallback(async (shareId: string) => {
    const { error } = await supabase.from("entry_shares").delete().eq("id", shareId);
    if (error) {
      toast.error("Couldn't remove access", { description: error.message });
      return;
    }
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          isShared || shares.length > 0
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`}
        title="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="font-mono hidden sm:inline">Share</span>
      </button>
    );
  }

  return (
    <>
      {/* Full-screen overlay for mobile, transparent click-away for desktop */}
      <div className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent" onClick={() => { setOpen(false); setRoleDropdownId(null); }} />

      {/* Panel: centered sheet on mobile, dropdown on desktop */}
      <div className="fixed inset-x-3 bottom-3 top-auto z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-8 w-auto sm:w-[360px] bg-card border border-border rounded-xl sm:rounded-lg shadow-2xl max-h-[85vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-xs font-medium text-foreground">Share this page</span>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Invite by email */}
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="Add people by email…"
              className="flex-1 min-w-0 bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              onKeyDown={(e) => e.key === "Enter" && inviteUser()}
            />
            <div className="flex gap-2">
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="w-full appearance-none bg-secondary border border-border rounded-md px-3 py-2 pr-7 text-xs text-foreground font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="viewer">Can view</option>
                  <option value="editor">Can edit</option>
                  <option value="admin">Full access</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              <button
                onClick={inviteUser}
                disabled={inviting || !email.trim()}
                className="bg-foreground text-background rounded-md px-4 py-2 text-xs font-mono hover:bg-foreground/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {inviting ? "…" : "Invite"}
              </button>
            </div>
          </div>
          {error && <p className="text-[10px] text-destructive mt-1.5 font-mono">{error}</p>}
          {lastInvited && !error && (
            <div className="mt-3 rounded-md border border-border bg-secondary/40 p-2.5">
              <p className="text-[10px] text-muted-foreground font-mono mb-1.5">
                Invited <span className="text-foreground">{lastInvited.email}</span> — share this link with them:
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2 bg-background rounded px-2 py-1.5 border border-border">
                  <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-mono truncate">{lastInvited.url}</span>
                </div>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(lastInvited.url);
                    setInviteLinkCopied(true);
                    setTimeout(() => setInviteLinkCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 bg-foreground text-background rounded px-2.5 py-1.5 text-[10px] font-mono hover:bg-foreground/90 transition-colors shrink-0"
                >
                  {inviteLinkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {inviteLinkCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>


        {/* People with access */}
        <div className="flex-1 min-h-0">
          {/* Owner */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs text-foreground font-mono uppercase shrink-0">
              {user?.email?.[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground font-mono truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground">Owner</p>
            </div>
          </div>

          {/* Shared users */}
          {shares.map((share) => (
            <div key={share.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-accent/30 transition-colors">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs text-muted-foreground font-mono uppercase shrink-0">
                {share.shared_with_email[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground font-mono truncate">{share.shared_with_email}</p>
                <p className="text-[10px] text-muted-foreground">{roleDescriptions[share.role as Role]}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <div className="relative">
                  <button
                    onClick={() => setRoleDropdownId(roleDropdownId === share.id ? null : share.id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground font-mono flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/50 transition-colors whitespace-nowrap"
                  >
                    {roleLabels[share.role as Role]}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                  {roleDropdownId === share.id && (
                    <>
                      <div className="fixed inset-0 z-50" onClick={() => setRoleDropdownId(null)} />
                      <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 z-50 bg-card border border-border rounded-md shadow-lg min-w-[140px] overflow-hidden">
                        {(["viewer", "editor", "admin"] as Role[]).map((role) => (
                          <button
                            key={role}
                            onClick={() => updateRole(share.id, role)}
                            className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                              share.role === role ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                            }`}
                          >
                            <p className="font-medium">{roleLabels[role]}</p>
                            <p className="text-[10px] text-muted-foreground">{roleDescriptions[role]}</p>
                          </button>
                        ))}
                        <div className="border-t border-border">
                          <button
                            onClick={() => { removeShare(share.id); setRoleDropdownId(null); }}
                            className="w-full text-left px-3 py-2 text-xs font-mono text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove access
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Public link section */}
        <div className="p-4 border-t border-border space-y-3 shrink-0">
          <button
            onClick={togglePublicShare}
            disabled={loading}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className={`p-2 rounded-md transition-colors shrink-0 ${isShared ? "bg-accent" : "bg-secondary"}`}>
              {isShared ? <Globe className="h-4 w-4 text-foreground" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground font-mono">
                {isShared ? "Published to web" : "Publish to web"}
              </p>
              <p className="text-[10px] text-muted-foreground/50 truncate">
                {isShared ? "Anyone with the link can view" : "Create a public link for anyone"}
              </p>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${isShared ? "bg-foreground" : "bg-secondary"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isShared ? "right-0.5 bg-background" : "left-0.5 bg-muted-foreground"}`} />
            </div>
          </button>

          {isShared && shareUrl && (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-secondary rounded-md px-3 py-2">
                <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground font-mono truncate">{shareUrl}</span>
              </div>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 bg-foreground text-background rounded-md px-3 py-2 text-[10px] font-mono hover:bg-foreground/90 transition-colors shrink-0"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
