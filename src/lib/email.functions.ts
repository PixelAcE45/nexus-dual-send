import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GMAIL_CONNECTOR_ID = "google_mail";
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const SendEmailInput = z.object({
  to: z.string().email(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  sender: z.enum(["nexus", "gmail", "auto"]).default("auto"),
});

export type EmailStatus = {
  defaultSender: "nexus" | "gmail";
  fromName: string | null;
  nexusReady: boolean;
  gmailConnected: boolean;
  gmailAccount: string | null;
};

export const getEmailStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailStatus> => {
    const { nexusMailReady } = await import("./email/send.server");
    const { getConnectionForUser } = await import("@/server/appUserConnections.server");

    const { data: settings } = await context.supabase
      .from("email_settings")
      .select("default_sender, from_name")
      .eq("user_id", context.userId)
      .maybeSingle();

    const connection = await getConnectionForUser(context.userId, GMAIL_CONNECTOR_ID);

    return {
      defaultSender: (settings?.default_sender as "nexus" | "gmail") ?? "nexus",
      fromName: settings?.from_name ?? null,
      nexusReady: nexusMailReady(),
      gmailConnected: Boolean(connection),
      gmailAccount: connection?.account_email ?? null,
    };
  });

export const updateEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        defaultSender: z.enum(["nexus", "gmail"]).optional(),
        fromName: z.string().trim().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { user_id: context.userId };
    if (data.defaultSender) patch["default_sender"] = data.defaultSender;
    if (data.fromName !== undefined) patch["from_name"] = data.fromName || null;

    const { error } = await context.supabase
      .from("email_settings")
      .upsert(patch, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSentEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_messages")
      .select("id, to_email, subject, body, sender_mode, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Dual sending router. Picks Gmail when requested/default and connected,
 * otherwise Nexus Default Mail. If Gmail fails at send time it falls back
 * to Nexus Default Mail automatically.
 */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendEmailInput.parse(input))
  .handler(async ({ data, context }) => {
    const { sendViaGmail, sendViaNexus, nexusMailReady } = await import("./email/send.server");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const { data: settings } = await context.supabase
      .from("email_settings")
      .select("default_sender, from_name")
      .eq("user_id", context.userId)
      .maybeSingle();

    const preferred =
      data.sender === "auto" ? ((settings?.default_sender as "nexus" | "gmail") ?? "nexus") : data.sender;

    const connectionAPIKey =
      preferred === "gmail" ? await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID) : null;

    let outcome;
    let fellBack = false;

    if (preferred === "gmail" && connectionAPIKey) {
      outcome = await sendViaGmail({ connectionAPIKey, to: data.to, subject: data.subject, body: data.body });
      if (!outcome.ok && nexusMailReady()) {
        fellBack = true;
        outcome = await sendViaNexus({
          to: data.to,
          subject: data.subject,
          body: data.body,
          fromName: settings?.from_name ?? null,
        });
      }
    } else {
      if (preferred === "gmail" && !connectionAPIKey) fellBack = true;
      outcome = await sendViaNexus({
        to: data.to,
        subject: data.subject,
        body: data.body,
        fromName: settings?.from_name ?? null,
      });
    }

    await context.supabase.from("email_messages").insert({
      user_id: context.userId,
      to_email: data.to,
      subject: data.subject,
      body: data.body,
      sender_mode: outcome.sender,
      status: outcome.ok ? "sent" : "failed",
      error: outcome.error ?? null,
      provider_message_id: outcome.messageId ?? null,
    });

    return { ...outcome, fellBack };
  });

/* ---------------- Gmail connect / disconnect ---------------- */

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientAPIKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientAPIKey) {
      throw new Error("Gmail connector client is not configured for this project.");
    }
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/google-mail/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const existing = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GMAIL_CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { getGmailProfileEmail } = await import("./email/send.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== GMAIL_CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }
    let accountEmail: string | null = null;
    try {
      accountEmail = await getGmailProfileEmail(connectionAPIKey);
    } catch {
      accountEmail = null;
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, accountEmail);
    await context.supabase
      .from("email_settings")
      .upsert({ user_id: context.userId, default_sender: "gmail" }, { onConflict: "user_id" });
    return { ok: true, accountEmail };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/server/appUserConnections.server"
    );

    const connectionAPIKey = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (connectionAPIKey) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId: GMAIL_CONNECTOR_ID,
        });
      } catch (error) {
        console.error("Gmail disconnect failed:", (error as Error).message);
      }
    }
    await deleteConnectionForUser(context.userId, GMAIL_CONNECTOR_ID);
    await context.supabase
      .from("email_settings")
      .upsert({ user_id: context.userId, default_sender: "nexus" }, { onConflict: "user_id" });
    return { ok: true };
  });
