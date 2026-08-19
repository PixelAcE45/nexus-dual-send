import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Mail, PenLine, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmailSenderSettings, useEmailStatus } from "@/components/nexus/email-sender-settings";
import { Dot, GlassPanel, IconTile, PageHeader, SectionTitle } from "@/components/nexus/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSentEmails, sendEmail } from "@/lib/email.functions";

export const Route = createFileRoute("/communications")({
  head: () => ({
    meta: [
      { title: "Communications — Nexus AI OS" },
      {
        name: "description",
        content:
          "Send email from Nexus Default Mail or your own connected Gmail, with AI drafting built in.",
      },
      { property: "og:title", content: "Communications — Nexus AI OS" },
      {
        property: "og:description",
        content: "Send from Nexus Default Mail or your own Gmail, all from one inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommunicationsPage,
});

type SenderChoice = "auto" | "nexus" | "gmail";

function CommunicationsPage() {
  const queryClient = useQueryClient();
  const { data: status } = useEmailStatus();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState<SenderChoice>("auto");

  const sent = useQuery({ queryKey: ["sent-emails"], queryFn: () => listSentEmails() });

  const send = useMutation({
    mutationFn: () => sendEmail({ data: { to, subject, body, sender } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["sent-emails"] });
      if (!result.ok) {
        toast.error("Message not sent", { description: result.error ?? "Sending failed." });
        return;
      }
      setSubject("");
      setBody("");
      toast.success(result.sender === "gmail" ? "Sent from your Gmail" : "Sent with Nexus Default Mail", {
        description: result.fellBack
          ? "Gmail was unavailable, so Nexus Default Mail delivered it."
          : `Delivered to ${to}.`,
      });
    },
    onError: (error: Error) => toast.error("Message not sent", { description: error.message }),
  });

  const canSend = to.trim().length > 3 && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Communications"
        description="Send mail through Nexus Default Mail or your own Gmail — one composer, two engines."
        actions={
          <Button
            onClick={() => document.getElementById("nexus-compose-to")?.focus()}
            className="brand-gradient rounded-xl text-primary-foreground hover:opacity-90"
          >
            <PenLine className="h-4 w-4" /> Compose
          </Button>
        }
      />

      <EmailSenderSettings />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <GlassPanel className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <IconTile tone="violet">
              <Mail className="h-[1.05rem] w-[1.05rem]" />
            </IconTile>
            <div className="min-w-0">
              <SectionTitle title="New message" />
              <p className="text-xs text-muted-foreground">
                {sender === "auto"
                  ? status?.defaultSender === "gmail" && status.gmailConnected
                    ? "Using your connected Gmail"
                    : "Using Nexus Default Mail"
                  : sender === "gmail"
                    ? "Using your connected Gmail"
                    : "Using Nexus Default Mail"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nexus-compose-to">To</Label>
              <Input
                id="nexus-compose-to"
                type="email"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="name@company.com"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nexus-compose-sender">Send with</Label>
              <Select value={sender} onValueChange={(value) => setSender(value as SenderChoice)}>
                <SelectTrigger id="nexus-compose-sender" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">My default sender</SelectItem>
                  <SelectItem value="nexus">Nexus Default Mail</SelectItem>
                  <SelectItem value="gmail" disabled={!status?.gmailConnected}>
                    My Gmail{status?.gmailConnected ? "" : " (not connected)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nexus-compose-subject">Subject</Label>
            <Input
              id="nexus-compose-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Launch checklist review"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nexus-compose-body">Message</Label>
            <textarea
              id="nexus-compose-body"
              rows={9}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message…"
              className="glass w-full resize-none rounded-2xl p-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex justify-end">
            <Button
              disabled={!canSend || send.isPending}
              onClick={() => send.mutate()}
              className="brand-gradient rounded-xl text-primary-foreground hover:opacity-90"
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <SectionTitle title="Recently sent" />
          {sent.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (sent.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing sent yet. Your outgoing mail will be logged here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--hairline)]">
              {(sent.data ?? []).map((item) => (
                <li key={item.id} className="px-1 py-3">
                  <span className="flex items-center gap-2">
                    {item.status === "sent" ? <Dot className="bg-mint" /> : <Dot className="bg-rose" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.to_email}</span>
                    <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
                      {item.sender_mode === "gmail" ? "Gmail" : "Nexus"}
                    </Badge>
                  </span>
                  <span className="mt-1 block truncate text-sm">{item.subject}</span>
                  {item.error ? (
                    <span className="mt-0.5 block truncate text-xs text-rose">{item.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
