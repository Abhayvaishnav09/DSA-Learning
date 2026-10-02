import {
  DOMAINS,
  domainOf,
  parseEvent,
  type Domain,
  type EventEnvelope,
  type EventType,
} from '@logicpath/contracts';
import {
  AckPolicy,
  DeliverPolicy,
  jetstream,
  jetstreamManager,
  type ConsumerMessages,
  type JetStreamClient,
  type JetStreamManager,
} from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import type { Logger } from 'pino';

export interface ConsumerSpec {
  /** Durable name, unique per service and purpose, e.g. "progress". */
  name: string;
  types: EventType[];
  handle: (event: EventEnvelope) => Promise<void>;
  /** Deliveries before giving up on a poison message. */
  maxDeliver?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Event bus on NATS JetStream (ADR-0014): one stream per domain, durable pull consumers,
 * publish de-duplication on the event id, at-least-once delivery.
 */
export class EventBus {
  private running: ConsumerMessages[] = [];

  private constructor(
    private readonly nc: NatsConnection,
    private readonly js: JetStreamClient,
    private readonly jsm: JetStreamManager,
    readonly prefix: string,
    private readonly log: Logger,
  ) {}

  static async connect(url: string, prefix: string, log: Logger): Promise<EventBus> {
    const nc = await connect({ servers: url, name: `${prefix}-client`, maxReconnectAttempts: -1 });
    const jsm = await jetstreamManager(nc);
    const bus = new EventBus(nc, jetstream(nc), jsm, prefix, log);
    await bus.ensureStreams();
    return bus;
  }

  streamName(domain: Domain): string {
    return `${this.prefix}_${domain}`.toUpperCase();
  }

  subject(type: string): string {
    return `${this.prefix}.${type}`;
  }

  /** Idempotent: every service may call this at start-up. */
  async ensureStreams(): Promise<void> {
    for (const domain of DOMAINS) {
      const config = {
        name: this.streamName(domain),
        subjects: [`${this.prefix}.${domain}.>`],
        max_age: 14 * 24 * 60 * 60 * 1e9, // nanoseconds: replay window for slow consumers
        duplicate_window: 2 * 60 * 1e9,
      };
      try {
        await this.jsm.streams.info(config.name);
      } catch {
        try {
          await this.jsm.streams.add(config);
        } catch (error) {
          // Another service created it between our check and add.
          await this.jsm.streams.info(config.name).catch(() => {
            throw error;
          });
        }
      }
    }
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    await this.js.publish(this.subject(envelope.type), encoder.encode(JSON.stringify(envelope)), {
      msgID: envelope.id,
    });
  }

  async consume(spec: ConsumerSpec): Promise<void> {
    const byDomain = new Map<Domain, EventType[]>();
    for (const type of spec.types) {
      byDomain.set(domainOf(type), [...(byDomain.get(domainOf(type)) ?? []), type]);
    }
    for (const [domain, types] of byDomain) {
      const stream = this.streamName(domain);
      const durable = `${spec.name}-${domain}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const config = {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        filter_subjects: types.map((t) => this.subject(t)),
        max_deliver: spec.maxDeliver ?? 8,
        ack_wait: 30 * 1e9,
      };
      try {
        await this.jsm.consumers.info(stream, durable);
        await this.jsm.consumers.update(stream, durable, {
          filter_subjects: config.filter_subjects,
          max_deliver: config.max_deliver,
        });
      } catch {
        await this.jsm.consumers.add(stream, config);
      }
      const consumer = await this.js.consumers.get(stream, durable);
      const messages = await consumer.consume({ max_messages: 50 });
      this.running.push(messages);
      void (async () => {
        for await (const msg of messages) {
          let envelope: EventEnvelope;
          try {
            envelope = parseEvent(JSON.parse(decoder.decode(msg.data)));
          } catch (error) {
            this.log.error({ err: error, subject: msg.subject }, 'invalid event, dropping');
            msg.term();
            continue;
          }
          try {
            await spec.handle(envelope);
            msg.ack();
          } catch (error) {
            const attempt = msg.info.deliveryCount;
            if (attempt >= config.max_deliver) {
              this.log.error(
                { err: error, event: envelope.type, id: envelope.id },
                'giving up on event',
              );
              msg.term();
            } else {
              this.log.warn(
                { err: error, event: envelope.type, attempt },
                'event handler failed, retrying',
              );
              msg.nak(Math.min(30_000, 250 * 2 ** attempt));
            }
          }
        }
      })();
    }
  }

  async close(): Promise<void> {
    for (const messages of this.running) messages.stop();
    this.running = [];
    await this.nc.drain().catch(() => this.nc.close());
  }
}
