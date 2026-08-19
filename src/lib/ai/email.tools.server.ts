import { z } from "zod";
import type { ToolContext, ToolResult } from "./tasks.tools.server";

const GMAIL_CONNECTOR_ID = "google_mail";

const SendEmailToolArgs = z.object({
  to: z.string().email(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  sender: z.enum(["nexus", "gmail", "auto"]).optional(),
});

export const emailTools: Record<string, (ctx: ToolContext, raw: unknown) => Promise<ToolResult>> = {
  async get_email_status(ctx): Promise<ToolResult> {
    const { nexusMailReady } = await import("../email/send.server");
    const { getConnectionForUser } = await import("@/server/appUserConnections.server");
    const { data: settings } = await ctx.supabase
      .from("email_settings")
      .select("default_sender")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const connection = await getConnectionForUser(ctx.userId, GMAIL_CONNECTOR_ID);
    return {
      ok: true,
      data: {
        default_sender: settings?.default_sender ?? "nexus",
        nexus_default_mail_ready: nexusMailReady(),
        gmail_connected: Boolean(connection),
        gmail_account: connection?.account_email ?? null,
      },
    } as ToolResult;
  },

  async send_email(ctx, raw): Promise<ToolResult> {
    const args = SendEmailToolArgs.parse(raw);
    const { sendViaGmail, sendViaNexus, nexusMailReady } = await import("../email/send.server");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const { data: settings } = await ctx.supabase
      .from("email_settings")
      .select("default_sender, from_name")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const preferred =
      !args.sender || args.sender === "auto"
        ? ((settings?.default_sender as "nexus" | "gmail") ?? "nexus")
        : args.sender;

    const connectionAPIKey =
      preferred === "gmail" ? await getConnectionKeyForUser(ctx.userId, GMAIL_CONNECTOR_ID) : null;

    let outcome;
    let fellBack = false;
    if (preferred === "gmail" && connectionAPIKey) {
      outcome = await sendViaGmail({
        connectionAPIKey,
        to: args.to,
        subject: args.subject,
        body: args.body,
      });
      if (!outcome.ok && nexusMailReady()) {
        fellBack = true;
        outcome = await sendViaNexus({
          to: args.to,
          subject: args.subject,
          body: args.body,
          fromName: settings?.from_name ?? null,
        });
      }
    } else {
      if (preferred === "gmail" && !connectionAPIKey) fellBack = true;
      outcome = await sendViaNexus({
        to: args.to,
        subject: args.subject,
        body: args.body,
        fromName: settings?.from_name ?? null,
      });
    }

    await ctx.supabase.from("email_messages").insert({
      user_id: ctx.userId,
      to_email: args.to,
      subject: args.subject,
      body: args.body,
      sender_mode: outcome.sender,
      status: outcome.ok ? "sent" : "failed",
      error: outcome.error ?? null,
      provider_message_id: outcome.messageId ?? null,
    });

    if (!outcome.ok) {
      return { ok: false, error: outcome.error ?? "The email could not be sent." } as ToolResult;
    }
    return {
      ok: true,
      data: { sent_with: outcome.sender, to: args.to, subject: args.subject, used_fallback: fellBack },
    } as ToolResult;
  },
};
