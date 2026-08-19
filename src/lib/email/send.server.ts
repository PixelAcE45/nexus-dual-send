import { EmailAPIError, sendLovableEmail } from "@lovable.dev/email-js";
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GMAIL_CONNECTOR_ID = "google_mail";

export type SenderMode = "nexus" | "gmail";

export type SendOutcome = {
  ok: boolean;
  sender: SenderMode;
  messageId?: string | null;
  error?: string;
  fellBack?: boolean;
};

export function nexusSenderDomain(): string | null {
  return process.env["NEXUS_MAIL_SENDER_DOMAIN"]?.trim() || null;
}

export function nexusMailReady(): boolean {
  return Boolean(nexusSenderDomain() && process.env["LOVABLE_API_KEY"]);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bodyToHtml(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#111827">${paragraphs}</div>`;
}

/** Nexus Default Mail — Lovable's managed sending infrastructure. */
export async function sendViaNexus(input: {
  to: string;
  subject: string;
  body: string;
  fromName?: string | null;
  replyTo?: string | null;
  idempotencyKey?: string;
}): Promise<SendOutcome> {
  const domain = nexusSenderDomain();
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!domain || !apiKey) {
    return {
      ok: false,
      sender: "nexus",
      error:
        "Nexus Default Mail is not configured yet — an email sending domain must be set up for this workspace.",
    };
  }

  const address = `nexus@${domain}`;
  const from = input.fromName ? `${input.fromName} <${address}>` : address;

  try {
    const res = await sendLovableEmail(
      {
        to: input.to,
        from,
        sender_domain: domain,
        subject: input.subject,
        html: bodyToHtml(input.body),
        text: input.body,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
      },
      { apiKey, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) },
    );
    return { ok: res.success !== false, sender: "nexus", messageId: res.message_id ?? null };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      return { ok: false, sender: "nexus", error: `${error.code ?? error.status}: ${error.message}` };
    }
    return { ok: false, sender: "nexus", error: (error as Error).message };
  }
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildRawEmail(input: {
  to: string;
  subject: string;
  body: string;
  fromName?: string | null;
}) {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    input.body,
  ];
  return base64Url(lines.join("\r\n"));
}

/** Send through the signed-in user's own connected Gmail account. */
export async function sendViaGmail(input: {
  connectionAPIKey: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendOutcome> {
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: input.connectionAPIKey,
      connectorId: GMAIL_CONNECTOR_ID,
      path: "/gmail/v1/users/me/messages/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: buildRawEmail(input) }),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Gmail send failed [${res.status}]: ${text}`);
      return { ok: false, sender: "gmail", error: `Gmail refused the send (${res.status}).` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, sender: "gmail", messageId: json.id ?? null };
  } catch (error) {
    return { ok: false, sender: "gmail", error: (error as Error).message };
  }
}

export async function getGmailProfileEmail(connectionAPIKey: string): Promise<string | null> {
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: GMAIL_CONNECTOR_ID,
    path: "/gmail/v1/users/me/profile",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { emailAddress?: string };
  return json.emailAddress ?? null;
}
