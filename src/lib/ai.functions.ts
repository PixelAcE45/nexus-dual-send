import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ChatInput } from "./ai.schema";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

export const nexusChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatInput.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveChatProvider } = await import("./ai/provider.server");
    const provider = resolveChatProvider();

    const { toolDeclarations, MUTATING_TOOLS } = await import("./ai/tool-schemas");
    const { runTool } = await import("./ai/registry.server");
    const { getN8nMcpState, n8nToolDeclarations } = await import("./ai/mcp/n8n.server");
    const toolCtx = { supabase: context.supabase, userId: context.userId };

    // Real tools discovered from the connected n8n MCP server (empty when the
    // server is unconfigured or unreachable — the rest of Nexus is unaffected).
    const mcpState = await getN8nMcpState();
    const mcpDeclarations = n8nToolDeclarations(mcpState);
    const activeTools = [...toolDeclarations, ...mcpDeclarations];

    const n8nSection =
      mcpState.status === "CONNECTED" && mcpState.tools.length > 0
        ? `\n\nConnected automation platform: n8n (via MCP). You can run these real n8n tools: ${mcpState.tools
            .map((tool) => tool.aiName)
            .join(", ")}.
- Use them when the user asks about workflows, automations, executions or anything the tool descriptions cover.
- Never invent workflow names, run history or results — call the tool and report what it returned.
- If an n8n tool fails, say plainly that the n8n connection or the workflow failed and what the error said.`
        : `\n\nn8n automations are not available right now (status: ${mcpState.status}). If the user asks you to run or inspect an n8n workflow, say the n8n connection is not active instead of pretending to run anything.`;

    const systemPrompt = `You are Nexus, a calm and precise AI operating system for knowledge work, and an active co-pilot inside the user's Nexus workspace.

You can operate the workspace through tools: create_task, list_tasks, update_task, delete_task, get_workspace_summary, get_email_status, send_email, web_search and scrape_url. Tools always act on the signed-in user's own data.

Rules:
- When the user asks you to add, change, complete or remove work, call the matching task tool instead of only describing it.
- Never claim an action succeeded unless the tool returned ok: true. If a tool fails, explain what went wrong in plain language.
- Never invent workspace data. Call list_tasks or get_workspace_summary before answering questions about progress, priorities or what is pending.
- If required information is missing (for example a task description), ask one short clarifying question instead of inventing it.
- Use the conversation so far to resolve references like "it" or "that task".
- Email: Nexus can send mail two ways — Nexus Default Mail (built in, needs no setup by the user) and the user's own Gmail if they connected it in Communications. Use send_email to actually send; it picks the user's default sender and falls back to Nexus Default Mail if Gmail fails. Always confirm recipient, subject and message with the user before sending, then report which account it was sent from.
- Web research: call web_search whenever the user asks you to research something, wants current or recent information, or asks about anything outside your training data. Call scrape_url when they give you a specific link. Base research answers only on the content those tools return, cite claims with the exact URLs returned, and never invent a source, quote or link. If research fails or returns nothing, say so plainly instead of answering from memory.
- The connected data sources are tasks, email, live web research and, when active, n8n automations. If asked about calendar, files or notes, say those are not connected yet.
- Never reveal keys, ids or technical internals unless the user needs an id.
- Do not end replies with "Would you like me to help with anything else?".${n8nSection}

Length and style: default to SHORT. Answer the question directly in the first sentence, then at most 3-5 short bullets or two brief paragraphs. Hard default ceiling: ~120 words. Confirmations of actions: one sentence. No preamble ("Sure, let me..."), no restating the question, no summaries of what you just said, no caveats the user didn't ask for. Only go long — detailed sections, step-by-step breakdowns — when the user explicitly asks to expand, explain in detail, or says the answer was too short.

Research answers: give the conclusion first, then only the few facts that matter, each with an inline link to the exact source URL. Do not summarise every source or dump page content.

Formatting: Markdown. Use lists, short headings, bold or code blocks only when they genuinely help.

Current date and time (UTC): ${new Date().toISOString()}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...data.messages.map((message) => ({ role: message.role, content: message.content })),
    ];

    let mutated = false;
    let emptyTurns = 0;
    const sourceMap = new Map<string, { title: string; url: string; domain: string; excerpt: string }>();

    for (let step = 0; step < 3; step += 1) {
      let response: Response;
      // Hard timeout so a stalled upstream never leaves the user waiting forever.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        response = await fetch(provider.url, {
          signal: controller.signal,
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
            ...provider.headers,
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            tools: activeTools,
            temperature: provider.temperature,
            max_tokens: provider.maxOutputTokens,
          }),
        });
      } catch (error) {
        if ((error as Error)?.name === "AbortError")
          throw new Error("Nexus's AI core took too long to answer. Please try again.");
        throw new Error("Nexus temporarily couldn't reach its AI core. Please try again.");
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("Nexus AI request failed", response.status, detail.slice(0, 500));
        if (response.status === 401 || response.status === 403)
          throw new Error("Nexus can't authenticate with its AI core right now.");
        if (response.status === 400 || response.status === 404)
          throw new Error("Nexus's AI core rejected that request. Please try rephrasing.");
        if (response.status === 413 || /context|too long|max.*tokens/i.test(detail))
          throw new Error("That conversation is too long for Nexus. Start a new chat and try again.");
        if (response.status === 429)
          throw new Error("Nexus's AI core is rate limited. Try again in a moment.");
        if (response.status === 402)
          throw new Error("Nexus's AI core has no remaining credits.");
        throw new Error("Nexus temporarily couldn't reach its AI core. Please try again.");
      }

      let payload: {
        choices?: Array<{
          finish_reason?: string;
          message?: {
            content?: string | null;
            reasoning?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
      try {
        payload = await response.json();
      } catch {
        throw new Error("Nexus received a malformed reply from its AI core. Please try again.");
      }

      const choice = payload.choices?.[0];
      const message = choice?.message;
      const toolCalls = message?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        const text = message?.content?.trim() || message?.reasoning?.trim();
        if (text) return { text, mutated, sources: [...sourceMap.values()] };

        // Some models occasionally return an empty turn (often after tool
        // results, or when the output budget was spent on reasoning). Nudge
        // once with a real user turn instead of failing the whole request.
        console.warn("Nexus AI empty turn", { step, finish_reason: choice?.finish_reason });
        if (emptyTurns >= 1) {
          return {
            text: "I wasn't able to put together an answer for that. Could you try rephrasing it?",
            mutated,
            sources: [...sourceMap.values()],
          };
        }
        emptyTurns += 1;
        messages.push({
          role: "user",
          content: "Please give your answer now as plain text.",
        });
        continue;
      }



      messages.push({
        role: "assistant",
        content: message?.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let args: unknown = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args, toolCtx);
        if (result.ok && MUTATING_TOOLS.includes(call.function.name)) mutated = true;

        // Collect real research sources so the UI can render source cards.
        // Only URLs Firecrawl actually returned ever reach the client.
        const data = (result as { data?: unknown }).data as
          | { sources?: Array<{ title?: string; url?: string; domain?: string; excerpt?: string }> }
          | undefined;
        if (result.ok && Array.isArray(data?.sources)) {
          for (const source of data.sources) {
            if (!source?.url) continue;
            sourceMap.set(source.url, {
              title: source.title ?? source.url,
              url: source.url,
              domain: source.domain ?? "",
              excerpt: source.excerpt ?? "",
            });
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    return {
      text: "I ran into a loop working on that and stopped. Could you rephrase the request?",
      mutated,
      sources: [...sourceMap.values()],
    };
  });
