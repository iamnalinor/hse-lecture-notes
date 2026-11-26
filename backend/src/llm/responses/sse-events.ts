import { MAX_METADATA_ARGUMENTS_CHARS } from "../../chat/metadata-tools";
import type { RoundTokenUsage } from "../../types";
import { extractUsage, object, type Raw } from "./output-items";

export interface SseEventOptions {
  maxResponseChars: number;
  onDelta: (delta: string) => void;
  onTruncateAbort?: () => void;
  /** Protocol checks on text deltas (every delta must belong to an assistant message). */
  strict: boolean;
  /** Text of the round is not shown (the topic round). */
  hideText: boolean;
}

/**
 * State of one streamed response built up from its server-sent events: the visible text, the
 * output items seen so far, the terminal event and every protocol violation noticed on the way.
 */
export class SseEventAccumulator {
  streamedText = "";
  observedOutputChars = 0;
  sawEvent = false;
  truncated = false;
  terminal = false;
  status = "incomplete";
  completed = false;
  usage: RoundTokenUsage | null = null;
  responseId: string | undefined;
  /** The `output` of the terminal response, which is authoritative over the streamed items. */
  finalOutput: Raw[] | null = null;
  readonly doneItems: Raw[] = [];
  readonly violations: string[] = [];

  private readonly items = new Map<number, Raw>();
  private readonly argumentLengths = new Map<number, number>();
  private lastTextItem: Raw | undefined;

  constructor(private readonly options: SseEventOptions) {}

  /** Stops reading: the response is over its size limit or malformed. */
  truncate(violation?: string): void {
    if (violation) this.violations.push(violation);
    this.truncated = true;
    this.options.onTruncateAbort?.();
  }

  /** Counts a text delta against the response limit and forwards what fits. */
  private emit(text: string): void {
    if (this.truncated) return;
    const { maxResponseChars, onDelta, hideText } = this.options;
    const remaining = maxResponseChars - this.observedOutputChars;
    this.observedOutputChars += Math.min(text.length, Math.max(0, remaining));
    if (text.length > remaining) {
      if (!hideText) {
        this.streamedText += text.slice(0, Math.max(0, remaining));
        onDelta(text.slice(0, Math.max(0, remaining)));
      }
      this.truncate();
    } else if (!hideText) {
      this.streamedText += text;
      onDelta(text);
    }
  }

  /** Handles the payload of one `data:` line. */
  process(raw: string): void {
    if (this.terminal || this.truncated || !raw.trim() || raw.trim() === "[DONE]") return;
    const evt = this.parseEvent(raw);
    if (!evt) return;
    const type = typeof evt.type === "string" ? evt.type : "";
    if (type.startsWith("response.") || type === "error") this.sawEvent = true;
    const index = typeof evt.output_index === "number" ? evt.output_index : undefined;
    const item = object(evt.item);
    if (type === "response.output_item.added" && item) {
      if (index !== undefined) this.items.set(index, item);
    } else if (
      type === "response.function_call_arguments.delta" &&
      typeof evt.delta === "string" &&
      index !== undefined
    ) {
      this.onArgumentsDelta(index, evt.delta);
    } else if (type === "response.output_text.delta" && typeof evt.delta === "string") {
      this.onTextDelta(evt, index, evt.delta);
    } else if (type === "response.output_item.done" && item) {
      this.doneItems.push(item);
    } else if (
      ["response.completed", "response.incomplete", "response.failed", "error"].includes(type)
    ) {
      this.onTerminal(evt, type);
    }
  }

  private parseEvent(raw: string): Raw | null {
    try {
      const parsed = object(JSON.parse(raw));
      if (!parsed) {
        this.violations.push("invalid_event");
        return null;
      }
      return parsed;
    } catch {
      this.violations.push("invalid_event_json");
      return null;
    }
  }

  private onArgumentsDelta(index: number, delta: string): void {
    const n = (this.argumentLengths.get(index) ?? 0) + delta.length;
    this.argumentLengths.set(index, n);
    if (this.items.get(index)?.name === "set_topic" && n > MAX_METADATA_ARGUMENTS_CHARS) {
      this.truncate("metadata_too_large");
    }
  }

  private onTextDelta(evt: Raw, index: number | undefined, delta: string): void {
    const source =
      index !== undefined
        ? this.items.get(index)
        : [...this.items.values()].find((v) => v.id === evt.item_id);
    if (this.options.strict && (source?.type !== "message" || source.role !== "assistant")) {
      this.violations.push("unidentified_text");
      return;
    }
    if (this.streamedText && source !== this.lastTextItem) return;
    this.lastTextItem = source;
    this.emit(delta);
  }

  private onTerminal(evt: Raw, type: string): void {
    this.terminal = true;
    const response = object(evt.response);
    this.responseId = typeof response?.id === "string" ? response.id : undefined;
    this.usage = extractUsage(response);
    this.status =
      typeof response?.status === "string" ? response.status : type.slice("response.".length);
    this.completed = type === "response.completed" && this.status === "completed";
    if (type === "response.completed" && this.status !== "completed")
      this.violations.push("terminal_mismatch");
    if (Array.isArray(response?.output)) {
      if (response.output.some((value) => object(value) === null))
        this.violations.push("invalid_output_item");
      this.finalOutput = response.output.map(object).filter((v): v is Raw => v !== null);
    } else if (response?.output !== undefined) this.violations.push("invalid_output");
    if (type === "response.failed" || type === "error") {
      this.status = "failed";
      this.completed = false;
    }
  }
}
