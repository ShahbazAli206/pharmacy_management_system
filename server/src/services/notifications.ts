import { NotificationChannel } from '@prisma/client';

/**
 * Pluggable notification transport. Production wires Twilio (SMS) + SendGrid
 * (email); this ships a stub that "accepts" the message so the queue/record
 * flow is real and testable. Swap via setNotificationProvider().
 */
export interface OutboundMessage {
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<{ ok: boolean; error?: string }>;
}

class StubNotificationProvider implements NotificationProvider {
  readonly name = 'stub';
  async send(_msg: OutboundMessage): Promise<{ ok: boolean }> {
    // No external call; a real provider would return delivery status here.
    return { ok: true };
  }
}

let provider: NotificationProvider = new StubNotificationProvider();
export const getNotificationProvider = () => provider;
export const setNotificationProvider = (p: NotificationProvider) => {
  provider = p;
};
