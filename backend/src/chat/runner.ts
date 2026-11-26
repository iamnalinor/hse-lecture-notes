import { DurableObject } from "cloudflare:workers";
import { r2ToArchiveStorage, runArchiveBatch, type ArchiveBatchStats } from "../archiver";
import { TrackedD1 } from "../db";
import { createLlmProvider } from "../llm/provider";
import { classifyError } from "../public-error";
import { loadPolicy } from "../quotas";
import type { Env, ChatStreamFrame } from "../types";
import { executeAgentRun } from "./agent-loop";
import { metaFrame, type AcceptedMessage } from "./send-route";

const encoder = new TextEncoder();

export class ChatRunner extends DurableObject<Env> {
  private active: AbortController | null = null;
  private stopRequested = false;

  /** Each cron or alarm invocation processes one bounded archive batch. */
  async runDailyArchive(): Promise<ArchiveBatchStats> {
    const db = new TrackedD1(this.env.DB);
    const storage = this.env.ARCHIVE_BUCKET ? r2ToArchiveStorage(this.env.ARCHIVE_BUCKET) : null;
    if (!storage) return runArchiveBatch(db, null);
    const policy = await loadPolicy(db);
    const stats = await runArchiveBatch(db, storage, { archiveAfterDays: policy.archiveAfterDays });
    if (stats.needsContinuation) await this.ctx.storage.setAlarm(Date.now() + 1_000);
    return stats;
  }

  async alarm(): Promise<void> {
    await this.runDailyArchive();
  }

  async startMessage({
    admit,
    policy,
    tier,
  }: AcceptedMessage): Promise<ReadableStream<Uint8Array>> {
    const db = new TrackedD1(this.env.DB);
    const provider = createLlmProvider(this.env, db);
    const abort = new AbortController();
    this.active = abort;
    // A replay can expose the run ID while the original request is handing it off.
    if (this.stopRequested) abort.abort("user_stop");
    let sink: ReadableByteStreamController | null = null;
    const stream = new ReadableStream(
      {
        type: "bytes",
        start(controller) {
          sink = controller;
        },
        cancel() {
          sink = null;
        },
      },
      { highWaterMark: 1024 * 1024 },
    );
    const sendFrame = (frame: ChatStreamFrame) => {
      if (!sink) return;
      if ((sink.desiredSize ?? 0) <= 0) {
        sink.error(new Error("Chat stream reader fell behind"));
        sink = null;
        return;
      }
      sink.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
    };
    sendFrame(metaFrame(admit, tier));
    // The run owns the provider request. Closing the browser's reader only detaches its sink.
    const run = executeAgentRun({
      env: this.env,
      db,
      provider,
      policy,
      tier,
      ...admit.question,
      requestTitle: admit.requestTitle,
      generatedTitle: admit.generatedTitle,
      preparedContext: admit.preparedContext,
      contextLimited: admit.contextLimited,
      questionCreatedAt: admit.questionCreatedAt,
      runId: admit.runId,
      threadId: admit.threadId,
      bucket: admit.bucket,
      route: admit.route,
      initialReserveMicros: admit.reserveMicros,
      degraded: admit.degraded,
      signal: abort.signal,
      isStoppedByUser: () => abort.signal.aborted,
      sendFrame,
    })
      .catch((error) => {
        const failure = classifyError(error);
        sendFrame({ type: "error", code: failure.code, message: failure.message });
      })
      .finally(() => {
        this.active = null;
        sink?.close();
        console.log(
          JSON.stringify({
            event: "chat_run_telemetry",
            runId: admit.runId,
            ...db.telemetry.snapshot(),
          }),
        );
      });
    this.ctx.waitUntil(run);
    return stream;
  }

  async stopMessage(): Promise<void> {
    this.stopRequested = true;
    this.active?.abort("user_stop");
  }
}
