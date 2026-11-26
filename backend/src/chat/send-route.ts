import { classifyError } from "../public-error";
import { logEvent, maskId } from "../logger";
import { admitRunAtomic, type AdmitRunResult } from "../quotas";
import type { Env, ChatStreamFrame, ServicePolicy, Tier } from "../types";
import type { TrackedD1 } from "../db";
import { ContextSizeError } from "./history";
import { messageError, MessageValidationError } from "./message-error";
import { readSendRequest, type SendRequest } from "./send-request";
import { validateNewSend } from "./send-validation";

type Admitted = Extract<AdmitRunResult, { kind: "admitted" }>;
type Duplicate = Extract<AdmitRunResult, { kind: "duplicate" }>;
export interface AcceptedMessage {
  admit: Admitted;
  policy: ServicePolicy;
  tier: Tier;
}

function streamResponse(body: BodyInit) {
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function metaFrame(
  admit: Admitted | Duplicate,
  tier: Tier,
): Extract<ChatStreamFrame, { type: "meta" }> {
  return {
    type: "meta",
    threadId: admit.threadId,
    runId: admit.runId,
    userMessageId: admit.userMessageId,
    assistantMessageId: admit.assistantMessageId,
    threadTitle: admit.threadTitle,
    generatedTitle: admit.generatedTitle,
    contextLimited: admit.contextLimited,
    tier,
    ...(admit.kind === "admitted"
      ? { model: admit.route.model, degraded: admit.degraded }
      : { replayed: true, model: admit.model, degraded: { active: false } }),
  };
}

function recoveryResponse(admit: Admitted | Duplicate, tier: Tier) {
  const frames: ChatStreamFrame[] = [
    { ...metaFrame(admit, tier), replayed: true },
    {
      type: "done",
      runId: admit.runId,
      status: admit.kind === "duplicate" ? admit.status : "running",
      text: "",
      steps: [],
      block: null,
      degraded: { active: false },
      contextLimited: admit.contextLimited,
      replayed: true,
    },
  ];
  return streamResponse(frames.map((frame) => JSON.stringify(frame) + "\n").join(""));
}

/** The response for an admission that did not start a run. */
function admissionRefusalResponse(
  admit: Exclude<AdmitRunResult, { kind: "admitted" | "duplicate" }>,
  r: SendRequest,
): Response {
  if (admit.kind === "conflict") return messageError(409, "client_request_conflict", admit.message);
  if (admit.kind === "not_found") return messageError(404, "thread_not_found", admit.message);
  logEvent("warn", "chat_admit_blocked", {
    browserId: maskId(r.browserId),
    block: admit.block,
    course: r.course,
    docId: r.docId,
  });
  const status =
    admit.block.code === "service_unavailable" || admit.block.code === "oauth_unavailable"
      ? 503
      : admit.block.code === "auth_required"
        ? 403
        : 429;
  return messageError(status, admit.block.code, "Запрос отклонен по ограничениям чата.", {
    block: admit.block,
    ...(admit.block.retryAfterSec ? { retryAfterSec: admit.block.retryAfterSec } : {}),
  });
}

/** Reserves quota and records the question; validation failures and context overflow become responses. */
async function admitSend(
  env: Env,
  db: TrackedD1,
  r: SendRequest,
): Promise<{ admit: AdmitRunResult } | { response: Response }> {
  try {
    const admit = await admitRunAtomic(
      db,
      r.policy,
      {
        env,
        axes: {
          tier: r.allowance.tier,
          telegramId: r.allowance.tgId ?? null,
          browserId: r.browserId,
          ipAddress: r.clientIp || r.allowance.ip,
          fingerprint: r.allowance.fp,
        },
        clientRequestId: r.clientRequestId,
        payloadHash: r.payloadHash,
        threadId: r.frame.threadId ?? null,
        retryAssistantMessageId: r.retryAssistantMessageId,
        course: r.course,
        docId: r.docId,
        questionText: r.questionText,
        quote: r.quote,
      },
      () => validateNewSend(env, db, r),
    );
    return { admit };
  } catch (error) {
    if (error instanceof MessageValidationError) return { response: error.response };
    if (error instanceof ContextSizeError) {
      return {
        response: messageError(
          400,
          "context_too_large",
          "Контекст вопроса слишком большой. Сократи вопрос или цитату и попробуй снова.",
        ),
      };
    }
    throw error;
  }
}

export async function postMessage(env: Env, db: TrackedD1, request: Request): Promise<Response> {
  const parsed = await readSendRequest(env, db, request);
  if ("response" in parsed) return parsed.response;
  const r = parsed.value;
  const tier = r.allowance.tier;

  const admission = await admitSend(env, db, r);
  if ("response" in admission) return admission.response;
  const { admit } = admission;
  if (admit.kind === "duplicate") return recoveryResponse(admit, tier);
  if (admit.kind !== "admitted") return admissionRefusalResponse(admit, r);

  try {
    const runner = env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName(admit.runId));
    return streamResponse(await runner.startMessage({ admit, tier, policy: r.policy }));
  } catch (error) {
    // D1 has committed. The runner may already have started. Return the durable run ID so
    // the client polls the result or its deadline without resending and double-charging.
    logEvent("error", "chat_run_handoff_uncertain", {
      runId: admit.runId,
      code: classifyError(error).code,
    });
    return recoveryResponse(admit, tier);
  }
}
