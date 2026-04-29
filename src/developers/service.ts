import { randomUUID } from 'node:crypto';

import { sendApplicationReceivedEmail } from '../mailer';
import { DeveloperRepository } from '../storage/developers';
import { generateSecretKey } from '../utils/crypto';
import { ClinkError } from '../utils/errors';

export class DeveloperService {
  constructor(private readonly repo: DeveloperRepository) {}

  async register(params: {
    name: string;
    email: string;
    company?: string;
    businessName?: string;
    businessType?: 'individual' | 'registered_company';
    country?: string;
  }): Promise<{ message: string; developer: { id: string; name: string; email: string; company?: string; verificationStatus: string; createdAt: string } }> {
    const existing = await this.repo.getByEmail(params.email);

    if (existing) {
      throw new ClinkError(
        'INVALID_PAYMENT_REQUEST',
        'An account already exists for this email address.',
      );
    }

    const developer = await this.repo.create({
      id: randomUUID(),
      name: params.name,
      email: params.email,
      company: params.company,
      secretKey: generateSecretKey(),
      createdAt: new Date().toISOString(),
      businessName: params.businessName,
      businessType: params.businessType,
      country: params.country,
      verificationStatus: 'pending',
    });

    await sendApplicationReceivedEmail({ to: developer.email, name: developer.name });

    return {
      message: 'Application received. You will be notified by email once your account is approved.',
      developer: {
        id: developer.id,
        name: developer.name,
        email: developer.email,
        company: developer.company,
        verificationStatus: developer.verificationStatus,
        createdAt: developer.createdAt,
      },
    };
  }
}
