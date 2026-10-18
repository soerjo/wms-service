import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Partitioners } from 'kafkajs';
import { PosConsumerService } from './pos-consumer.service.js';
import { PosEventPayload } from './interfaces/pos-event.interface.js';

/**
 * Kafka consumer for POS order events (pos.order.completed / pos.order.refunded).
 * Runs alongside the legacy HTTP dev endpoint (/api/v1/dev/pos-event) for
 * backward compatibility. Event handling is delegated to PosConsumerService,
 * which already guarantees idempotency (ProcessedEvent) and DLQ routing.
 */
@Injectable()
export class PosKafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosKafkaConsumer.name);
  private consumer: Consumer | null = null;
  private kafka: Kafka | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly posConsumerService: PosConsumerService,
  ) {}

  private get enabled(): boolean {
    const brokers = this.configService.get<string>('KAFKA_BROKERS');
    const disabled =
      this.configService.get<string>('KAFKA_CONSUMER_DISABLED') === 'true';
    return Boolean(brokers) && !disabled;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'Kafka consumer disabled (KAFKA_BROKERS missing or KAFKA_CONSUMER_DISABLED=true) — HTTP endpoint remains available.',
      );
      return;
    }

    const brokers = (
      this.configService.get<string>('KAFKA_BROKERS') ?? ''
    )
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    const groupId =
      this.configService.get<string>('KAFKA_CONSUMER_GROUP_ID') ??
      'wms-service-pos-events';

    this.logger.log(`Connecting Kafka consumer to brokers: ${brokers.join(', ')}`);
    this.kafka = new Kafka({
      clientId: 'wms-service',
      brokers,
    });
    this.consumer = this.kafka.consumer({
      groupId,
      retry: { initialRetryTime: 300, retries: 5 },
    });

    await this.consumer.connect();

    await this.consumer.subscribe({
      topic: 'pos.order.completed',
      fromBeginning: false,
    });
    await this.consumer.subscribe({
      topic: 'pos.order.refunded',
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          this.logger.warn(`Empty message on ${topic} [${partition}] — skipped.`);
          return;
        }
        let payload: PosEventPayload;
        try {
          payload = JSON.parse(
            message.value.toString('utf8'),
          ) as PosEventPayload;
        } catch (err) {
          this.logger.error(
            `Invalid JSON on ${topic} [${partition}]: ${(err as Error).message}`,
          );
          return;
        }
        try {
          await this.posConsumerService.handleEvent(payload);
        } catch (err) {
          // PosConsumerService routes business failures to DeadLetterEvent;
          // anything that bubbles here is unexpected — log for visibility.
          this.logger.error(
            `Unhandled error processing event ${payload?.eventId} from ${topic}: ${(err as Error).message}`,
          );
        }
      },
    });

    this.logger.log(
      `Kafka consumer started (group=${groupId}, topics=pos.order.completed, pos.order.refunded)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    }
  }
}
