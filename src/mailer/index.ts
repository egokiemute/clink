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
