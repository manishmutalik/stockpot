import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChefHat } from 'lucide-react';

/**
 * PrivacyPage.tsx
 *
 * ⚠️ DRAFT LEGAL CONTENT — NOT REVIEWED BY A LAWYER.
 * This is a reasonable starting template, not a finished legal document.
 * Privacy law varies significantly by where your customers are located
 * (e.g. GDPR in the EU/UK, CCPA/CPRA in California, similar laws elsewhere)
 * and by what data you actually collect. Have this reviewed by a lawyer
 * before charging real customers, and update it to accurately reflect your
 * actual data practices — it must be accurate, not just plausible.
 *
 * Every [BRACKETED] placeholder below MUST be filled in with real values.
 */
const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <nav className="border-b border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-amber-600 font-bold">
            <ChefHat size={22} />
            <span className="text-stone-900 font-serif">Stockpot</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
            <ArrowLeft size={16} /> Back
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold text-stone-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-stone-400 mb-10">Last updated: [DATE]</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-10 text-sm text-stone-700">
          <strong>Draft notice:</strong> this document is a starting template and has not been
          reviewed by a lawyer. It must accurately describe what you actually do with data —
          verify every section against your real practices, replace the placeholders, and have
          it reviewed before relying on it.
        </div>

        <Section title="1. What This Policy Covers">
          <p>
            This Privacy Policy explains what personal data [COMPANY NAME] ("we", "us")
            collects through the Stockpot application (the "Service"), how we use it,
            and the choices you have.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <ul>
            <li><strong>Account data:</strong> name, email address, and authentication data,
              collected when you sign up (via email/password or Google sign-in).</li>
            <li><strong>Business data you enter:</strong> inventory items, recipes, orders,
              production records, wastage logs, and similar records you input to use the
              Service. This may include personal data about your own customers if you enter
              their names or phone numbers on orders.</li>
            <li><strong>Billing data:</strong> handled by Stripe, our payment processor. We
              receive and store your subscription status and Stripe customer/subscription IDs,
              but never your full card number — Stripe handles that directly under its own{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
                privacy policy
              </a>.</li>
            <li><strong>Third-party integration data:</strong> if you connect Shopify or Odoo,
              we store an access token/credentials (encrypted) needed to import your order data,
              and the order data itself.</li>
            <li><strong>Usage data:</strong> [describe any analytics/logging you actually collect
              — e.g. server logs, error reports. If you don't collect analytics, say so.]</li>
          </ul>
        </Section>

        <Section title="3. How We Use Data">
          <ul>
            <li>To provide, maintain, and improve the Service;</li>
            <li>To process your subscription payments and communicate about billing;</li>
            <li>To respond to support requests;</li>
            <li>To detect, prevent, and address technical issues or abuse;</li>
            <li>To send you service-related communications (e.g. billing receipts, security
              notices). [Describe marketing communications and opt-out, if applicable.]</li>
          </ul>
        </Section>

        <Section title="4. Who We Share Data With">
          <p>We share data with the following categories of service providers, only as needed to run the Service:</p>
          <ul>
            <li><strong>Firebase / Google Cloud</strong> — authentication and database hosting for your account and business data.</li>
            <li><strong>Stripe</strong> — payment processing and subscription management.</li>
            <li><strong>Shopify / Odoo</strong> — only if you choose to connect these integrations, to import your order data.</li>
            <li>[Add any hosting provider (Render/Railway/Fly.io/etc.) here, since your app's infrastructure runs on their servers.]</li>
          </ul>
          <p>We do not sell personal data.</p>
        </Section>

        <Section title="5. Data Security">
          <p>
            We use industry-standard measures to protect your data, including encryption of
            third-party integration credentials at rest, access controls limiting data to your
            own account, and secure transmission (HTTPS) between your browser and our servers.
            No method of transmission or storage is completely secure, and we can't guarantee
            absolute security.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your account and business data for as long as your account is active.
            [Describe what happens to data after you cancel or delete your account — e.g. how
            long it's kept before deletion, and whether/how you can request earlier deletion.]
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>
            Depending on where you're located, you may have rights to access, correct, export,
            or delete your personal data, and to object to or restrict certain processing.
            [If you serve EU/UK or California customers, this section needs to specifically
            address GDPR/CCPA rights and how to exercise them — have a lawyer confirm what
            applies to you.] To make a request, contact [SUPPORT EMAIL].
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            [Describe what cookies/local storage the app actually uses — e.g. a CSRF token
            cookie, and any authentication session data. If you don't use tracking/advertising
            cookies, say so explicitly, since many small SaaS apps don't.]
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            The Service is intended for business use and is not directed at children. We don't
            knowingly collect personal data from children under 13 (or the relevant age in your
            jurisdiction).
          </p>
        </Section>

        <Section title="10. International Data Transfers">
          <p>
            [If your hosting/Firebase region differs from where your customers are located,
            describe how data may be transferred internationally and the safeguards in place —
            this matters especially for EU/UK customers.]
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We'll notify you of material
            changes (e.g. by email or in-app notice) before they take effect.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>Questions about this Privacy Policy or your data: [SUPPORT EMAIL / COMPANY ADDRESS].</p>
        </Section>
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold text-stone-800 mb-3">{title}</h2>
    <div className="text-sm text-stone-600 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2">
      {children}
    </div>
  </section>
);

export default PrivacyPage;
