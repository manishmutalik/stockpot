import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChefHat } from 'lucide-react';

/**
 * TermsPage.tsx
 *
 * ⚠️ DRAFT LEGAL CONTENT — NOT REVIEWED BY A LAWYER.
 * This is a reasonable starting template for a small B2B SaaS, not a
 * finished legal document. Before charging real customers, have this
 * reviewed by a lawyer licensed in your jurisdiction — requirements vary by
 * country/state (consumer protection law, data protection law, required
 * disclosures, etc.) and this content cannot account for that.
 *
 * Every [BRACKETED] placeholder below MUST be filled in with real values
 * (company name, jurisdiction, contact info) before this is usable.
 */
const TermsPage: React.FC = () => {
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

      <main className="max-w-3xl mx-auto px-6 py-16 prose-content">
        <h1 className="text-3xl font-extrabold text-stone-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-stone-400 mb-10">Last updated: [DATE]</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-10 text-sm text-stone-700">
          <strong>Draft notice:</strong> this document is a starting template and has not been
          reviewed by a lawyer. Replace every [bracketed] placeholder and have it reviewed
          before relying on it.
        </div>

        <Section title="1. Agreement to Terms">
          <p>
            These Terms of Service ("Terms") are a legal agreement between you ("Customer",
            "you") and [COMPANY NAME] ("we", "us", "our"), governing your access to and use of
            the Stockpot web application and related services (the "Service"). By creating
            an account or using the Service, you agree to these Terms. If you are agreeing on
            behalf of a business, you represent that you have authority to bind that business.
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            The Service is a subscription-based inventory, recipe, order, and production
            management tool for bakeries, restaurants, and food businesses. We may add, change,
            or remove features over time, and may modify or discontinue the Service (in whole or
            part) with reasonable notice where practical.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You must provide accurate information when creating an account and keep your login
            credentials secure. You're responsible for all activity under your account. Notify us
            promptly at [SUPPORT EMAIL] if you suspect unauthorized access.
          </p>
        </Section>

        <Section title="4. Subscriptions, Billing & Cancellation">
          <ul>
            <li>The Service is billed on a recurring subscription basis (monthly, unless stated
              otherwise at signup). Payment is processed by Stripe; we do not store your full
              card number.</li>
            <li>Subscriptions renew automatically at the end of each billing period until
              canceled. You can cancel anytime from the Billing section of the app (via the
              Stripe Customer Portal); cancellation takes effect at the end of the current
              billing period, and you retain access until then.</li>
            <li>[Describe your refund policy here — e.g. "Fees are non-refundable except where
              required by law" or "We offer a pro-rated refund within X days of a charge."]</li>
            <li>[If you offer a free trial: describe its length and what happens when it ends —
              e.g. whether the card is charged automatically.]</li>
            <li>We may change subscription pricing with advance notice; continued use after a
              price change takes effect constitutes acceptance of the new price.</li>
          </ul>
        </Section>

        <Section title="5. Your Data">
          <p>
            You retain ownership of the business data you input into the Service (inventory
            records, recipes, orders, financial figures, and similar). You grant us a license to
            host, process, and display that data solely to provide the Service to you. See our{' '}
            <Link to="/privacy" className="text-primary underline">Privacy Policy</Link> for how
            we handle personal data.
          </p>
          <p>
            You're responsible for the accuracy and legality of the data you input, and for
            having any necessary rights or consents to use it in the Service (for example,
            customer contact information you enter or import).
          </p>
        </Section>

        <Section title="6. Third-Party Integrations">
          <p>
            The Service can optionally connect to third-party platforms (currently Shopify and
            Odoo) to import order data. Your use of those platforms is governed by their own
            terms and privacy policies, which we don't control. We're not responsible for the
            availability, accuracy, or conduct of third-party services.
          </p>
        </Section>

        <Section title="7. Acceptable Use">
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose, or in a way that infringes others' rights;</li>
            <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems;</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service, except as permitted by law;</li>
            <li>Resell or provide the Service to third parties without our written consent;</li>
            <li>Interfere with or disrupt the integrity or performance of the Service.</li>
          </ul>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            We own all rights, title, and interest in the Service itself (excluding your data).
            These Terms don't grant you any rights to our trademarks, logos, or branding.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
            IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            OR NON-INFRINGEMENT. We don't guarantee the Service will be uninterrupted, error-free,
            or that inventory/cost calculations will be free of error — you're responsible for
            independently verifying figures material to your business decisions.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            [This section typically caps liability at fees paid in the preceding 12 months and
            excludes indirect/consequential damages. The exact wording and any exceptions
            required in your jurisdiction should be drafted or reviewed by a lawyer — enforceability
            varies by location and some limitations may not apply to consumers.]
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may stop using the Service and cancel your subscription at any time. We may
            suspend or terminate your access if you materially breach these Terms, don't pay fees
            when due, or if required by law. Upon termination, your right to use the Service ends;
            [describe data retention/export policy after termination here].
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We'll notify you of material changes
            (e.g. by email or in-app notice) before they take effect. Continued use of the
            Service after changes take effect constitutes acceptance.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p>
            [Specify the jurisdiction whose law governs these Terms, and where disputes will be
            resolved — this should match where your business is legally established and be
            confirmed with a lawyer.]
          </p>
        </Section>

        <Section title="14. Contact">
          <p>Questions about these Terms: [SUPPORT EMAIL / COMPANY ADDRESS].</p>
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

export default TermsPage;
