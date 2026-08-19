import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel, IconTile, SectionTitle } from "@/components/nexus/glass";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  disconnectGmail,
  getEmailStatus,
  startGmailConnect,
  completeGmailConnection,
  updateEmailSettings,
} from "@/lib/email.functions";
import { openOAuthPopup, waitForOAuthCompletion } from "@/lib/email/connect-popup";
import { cn } from "@/lib/utils";

export function useEmailStatus() {
  return useQuery({
    queryKey: ["email-status"],
    queryFn: () => getEmailStatus(),
  });
}

export function EmailSenderSettings() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useEmailStatus();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["email-status"] });

  const connect = useMutation({
    mutationFn: async () => {
      const popup = openOAuthPopup();
      let code: string | null;
      try {
        const { authorizationUrl } = await startGmailConnect();
        const completion = waitForOAuthCompletion(popup);
        popup.location.href = authorizationUrl;
        code = await completion;
      } catch (error) {
        popup.close();
        throw error;
      }
      if (!code) return { accountEmail: null };
      return completeGmailConnection({ data: { code } });
    },
    onSuccess: (result) => {
      toast.success("Gmail connected", {
        description: result?.accountEmail
          ? `Nexus will send as ${result.accountEmail}.`
          : "Nexus can now send from your Gmail account.",
      });
      void refresh();
    },
    onError: (error: Error) => toast.error("Could not connect Gmail", { description: error.message }),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectGmail(),
    onSuccess: () => {
      toast.success("Gmail disconnected", { description: "Sending falls back to Nexus Default Mail." });
      void refresh();
    },
    onError: (error: Error) => toast.error("Could not disconnect", { description: error.message }),
  });

  const setDefault = useMutation({
    mutationFn: (sender: "nexus" | "gmail") => updateEmailSettings({ data: { defaultSender: sender } }),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error("Could not save", { description: error.message }),
  });

  const defaultSender = status?.defaultSender ?? "nexus";

  return (
    <GlassPanel className="space-y-5 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <IconTile tone="azure">
          <Mail className="h-[1.05rem] w-[1.05rem]" />
        </IconTile>
        <SectionTitle
          title="Email sending"
          subtitle="Choose how Nexus delivers the mail you and your AI assistant send."
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your sending setup…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SenderCard
            title="Nexus Default Mail"
            description="Built-in sending — nothing to connect. Works out of the box for every member."
            active={defaultSender === "nexus"}
            status={
              status?.nexusReady ? (
                <Badge variant="secondary" className="rounded-full">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Ready
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full">
                  Domain setup pending
                </Badge>
              )
            }
            action={
              <Button
                variant={defaultSender === "nexus" ? "secondary" : "outline"}
                className="rounded-xl"
                disabled={defaultSender === "nexus" || setDefault.isPending}
                onClick={() => setDefault.mutate("nexus")}
              >
                {defaultSender === "nexus" ? "Default sender" : "Make default"}
              </Button>
            }
          />

          <SenderCard
            title="Your Gmail"
            description={
              status?.gmailConnected
                ? `Connected${status.gmailAccount ? ` · ${status.gmailAccount}` : ""} — mail is sent from your own address.`
                : "Connect your Google account so Nexus sends from your own Gmail address."
            }
            active={defaultSender === "gmail" && Boolean(status?.gmailConnected)}
            status={
              status?.gmailConnected ? (
                <Badge variant="secondary" className="rounded-full">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full">
                  Not connected
                </Badge>
              )
            }
            action={
              status?.gmailConnected ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={defaultSender === "gmail" ? "secondary" : "outline"}
                    className="rounded-xl"
                    disabled={defaultSender === "gmail" || setDefault.isPending}
                    onClick={() => setDefault.mutate("gmail")}
                  >
                    {defaultSender === "gmail" ? "Default sender" : "Make default"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                  >
                    {disconnect.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="h-4 w-4" />
                    )}
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  className="brand-gradient rounded-xl text-primary-foreground hover:opacity-90"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate()}
                >
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Connect Gmail
                </Button>
              )
            }
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        If Gmail sending ever fails, Nexus automatically falls back to Nexus Default Mail so your
        message still goes out. Google access is stored encrypted and is never shared between
        accounts.
      </p>
    </GlassPanel>
  );
}

function SenderCard({
  title,
  description,
  active,
  status,
  action,
}: {
  title: string;
  description: string;
  active: boolean;
  status: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass flex flex-col gap-3 rounded-2xl p-4",
        active && "ring-1 ring-[var(--accent-ring,theme(colors.violet.DEFAULT))]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {status}
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div>{action}</div>
    </div>
  );
}
