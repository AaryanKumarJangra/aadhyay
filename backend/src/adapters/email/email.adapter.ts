import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';

export interface EmailMessage { to: string; subject: string; html: string; text?: string; attachments?: { filename: string; content: Buffer }[] }
export interface EmailResult { id: string }

/** Email port. Providers: smtp (dev: Mailpit), resend (free 3k/month), ses (volume), log. */
@Injectable()
export class EmailAdapter {
  private readonly log = new Logger('Email');
  private smtp = env.EMAIL_PROVIDER === 'smtp' && env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

  async send(m: EmailMessage): Promise<EmailResult> {
    switch (env.EMAIL_PROVIDER) {
      case 'smtp': {
        const r = await this.smtp!.sendMail({ from: env.EMAIL_FROM, to: m.to, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
        return { id: r.messageId };
      }
      case 'resend': {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text,
            attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }),
        });
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
        return { id: ((await res.json()) as any).id };
      }
      default:
        this.log.log(`[email→${m.to}] ${m.subject}`);
        return { id: `log-${Date.now()}` };
    }
  }
}
