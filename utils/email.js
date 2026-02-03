import nodemailer from 'nodemailer';
import pug from 'pug';
import juice from 'juice';
import path from 'path';
import { fileURLToPath } from 'url';

// 🟢 FIX: Define __dirname manually for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendEmail = async (options) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      },
      // 🟢 ADD THIS BLOCK TO FIX THE ERROR
      tls: {
        rejectUnauthorized: false
      }
    });

    // 🟢 Point to the correct views folder
    // Go up one level (..) from 'utils' to reach 'BackEnd', then into 'views/emails'
    const templatePath = path.join(__dirname, '../views/emails', `${options.template}.pug`);

    const html = pug.renderFile(templatePath, options.data);
    const inlinedHtml = juice(html);

    const mailOptions = {
      from: `"Eat's on Tap" <${process.env.EMAIL_USERNAME}>`,
      to: options.email,
      subject: options.subject,
      html: inlinedHtml
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${options.email}`);

  } catch (error) {
    console.error('❌ Email send failed:', error);
    throw error; // Throw error so controller catches it
  }
};

export default sendEmail;