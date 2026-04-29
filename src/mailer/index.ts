import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER ?? 'onboarding@okiemute.cv',
    pass: process.env.SMTP_PASS,
  },
});

export async function sendApiKeyEmail(params: {
  to: string;
  name: string;
  secretKey: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Clink" <onboarding@okiemute.cv>',
    to: params.to,
    subject: 'Your Clink API Key',
    text: [
      `Hi ${params.name},`,
      '',
      'Welcome to Clink! Here is your API key:',
      '',
      `  ${params.secretKey}`,
      '',
      'Quick start:',
      '',
      '  npm install clink-sdk',
      '',
      'Then in your project:',
      '',
      '  import Clink from "clink-sdk";',
      '',
      '  const clink = new Clink({',
      `    secretKey: "${params.secretKey}",`,
      '    environment: "testnet",',
      '    receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,',
      '  });',
      '',
      'Full documentation: https://www.npmjs.com/package/clink-sdk',
      '',
      'Keep your API key secret — do not commit it to source control.',
      '',
      'The Clink team',
    ].join('\n'),
    html: `
      <p>Hi ${params.name},</p>
      <p>Welcome to Clink! Here is your API key:</p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">${params.secretKey}</pre>
      <p><strong>Quick start:</strong></p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">npm install clink-sdk</pre>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">import Clink from "clink-sdk";

const clink = new Clink({
  secretKey: "${params.secretKey}",
  environment: "testnet",
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
});</pre>
      <p>Full documentation: <a href="https://www.npmjs.com/package/clink-sdk">npmjs.com/package/clink-sdk</a></p>
      <p style="color:#888;font-size:12px;">Keep your API key secret — do not commit it to source control.</p>
      <p>The Clink team</p>
    `,
  });
}

export async function sendApplicationReceivedEmail(params: {
  to: string;
  name: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Clink" <onboarding@okiemute.cv>',
    to: params.to,
    subject: 'Clink — Application Received',
    text: [
      `Hi ${params.name},`,
      '',
      'Thank you for applying to Clink.',
      '',
      'We have received your application and our team will review it shortly.',
      'You will receive an email once your account is approved.',
      '',
      'The Clink team',
    ].join('\n'),
    html: `
      <p>Hi ${params.name},</p>
      <p>Thank you for applying to Clink.</p>
      <p>We have received your application and our team will review it shortly.<br/>
      You will receive an email once your account is approved.</p>
      <p>The Clink team</p>
    `,
  });
}

export async function sendMerchantApprovalEmail(params: {
  to: string;
  name: string;
  secretKey: string;
  stellarPublicKey: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Clink" <onboarding@okiemute.cv>',
    to: params.to,
    subject: 'Clink — Account Approved',
    text: [
      `Hi ${params.name},`,
      '',
      'Great news! Your Clink account has been approved.',
      '',
      'Your API key (keep this secret):',
      `  ${params.secretKey}`,
      '',
      'Your dedicated Stellar wallet address:',
      `  ${params.stellarPublicKey}`,
      '',
      'Customer payments will route directly to your Stellar wallet.',
      '',
      'Full documentation: https://www.npmjs.com/package/clink-sdk',
      '',
      'The Clink team',
    ].join('\n'),
    html: `
      <p>Hi ${params.name},</p>
      <p>Great news! Your Clink account has been approved.</p>
      <p><strong>Your API key</strong> (keep this secret):</p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">${params.secretKey}</pre>
      <p><strong>Your dedicated Stellar wallet address:</strong></p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">${params.stellarPublicKey}</pre>
      <p>Customer payments will route directly to your Stellar wallet.</p>
      <p>Full documentation: <a href="https://www.npmjs.com/package/clink-sdk">npmjs.com/package/clink-sdk</a></p>
      <p>The Clink team</p>
    `,
  });
}

export async function sendMerchantRejectionEmail(params: {
  to: string;
  name: string;
  reason?: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Clink" <onboarding@okiemute.cv>',
    to: params.to,
    subject: 'Clink — Application Update',
    text: [
      `Hi ${params.name},`,
      '',
      'Unfortunately, we were unable to approve your Clink application at this time.',
      ...(params.reason ? ['', `Reason: ${params.reason}`] : []),
      '',
      'If you have questions, please contact our support team.',
      '',
      'The Clink team',
    ].join('\n'),
    html: `
      <p>Hi ${params.name},</p>
      <p>Unfortunately, we were unable to approve your Clink application at this time.</p>
      ${params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : ''}
      <p>If you have questions, please contact our support team.</p>
      <p>The Clink team</p>
    `,
  });
}

export async function sendWithdrawalConfirmationEmail(params: {
  to: string;
  name: string;
  usdcAmount: number;
  localAmount: number;
  currency: string;
  bankName: string;
  accountNumber: string;
  withdrawalId: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Clink" <onboarding@okiemute.cv>',
    to: params.to,
    subject: 'Clink — Withdrawal Confirmed',
    text: [
      `Hi ${params.name},`,
      '',
      'Your withdrawal has been processed successfully.',
      '',
      `Amount: ${params.usdcAmount} USDC → ${params.localAmount.toLocaleString()} ${params.currency}`,
      `Bank: ${params.bankName} (${params.accountNumber})`,
      `Reference: ${params.withdrawalId}`,
      '',
      'Funds typically arrive within 1-2 business days.',
      '',
      'The Clink team',
    ].join('\n'),
    html: `
      <p>Hi ${params.name},</p>
      <p>Your withdrawal has been processed successfully.</p>
      <table style="border-collapse:collapse;width:100%;max-width:400px;">
        <tr><td style="padding:8px;color:#666;">Amount</td><td style="padding:8px;">${params.usdcAmount} USDC → ${params.localAmount.toLocaleString()} ${params.currency}</td></tr>
        <tr><td style="padding:8px;color:#666;">Bank</td><td style="padding:8px;">${params.bankName} (${params.accountNumber})</td></tr>
        <tr><td style="padding:8px;color:#666;">Reference</td><td style="padding:8px;">${params.withdrawalId}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">Funds typically arrive within 1-2 business days.</p>
      <p>The Clink team</p>
    `,
  });
}
