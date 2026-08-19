import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google-mail/return")({
  component: OAuthReturn,
  head: () => ({
    meta: [
      { title: "Connecting Gmail · Nexus" },
      { name: "description", content: "Finishing the secure Gmail connection for your Nexus account." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "OAuth did not complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("OAuth completed without an exchange code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
