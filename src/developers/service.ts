import { randomUUID } from 'node:crypto';

import { sendApiKeyEmail } from '../mailer';
import { DeveloperRepository } from '../storage/developers';
import { generateSecretKey } from '../utils/crypto';
import { ClinkError } from '../utils/errors';

export class DeveloperService {
  constructor(private readonly repo: DeveloperRepository) {}

  async register(params: {
    name: string;
    email: string;
    company?: string;
  }): Promise<{ message: string; developer: { id: string; name: string; email: string; company?: string; secretKey: string; createdAt: string } }> {
    const existing = await this.repo.getByEmail(params.email);

    if (existing) {
      throw new ClinkError(
        'INVALID_PAYMENT_REQUEST',
        'An API key has already been issued to this email address.',
      );
    }

    const developer = await this.repo.create({
      id: randomUUID(),
      name: params.name,
      email: params.email,
      company: params.company,
      secretKey: generateSecretKey(),
      createdAt: new Date().toISOString(),
    });

    await sendApiKeyEmail({
      to: developer.email,
      name: developer.name,
      secretKey: developer.secretKey,
    });

    return {
      message: 'Account created. Copy your secret key — it will not be shown again.',
      developer: {
        id: developer.id,
        name: developer.name,
        email: developer.email,
        company: developer.company,
        secretKey: developer.secretKey,
        createdAt: developer.createdAt,
      },
    };
  }
}
