import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — DagsThreads Studio',
  description: 'Privacy policy for the DagsThreads Studio t-shirt generator application.',
};

const UPDATED = 'July 11, 2026';
const CONTACT = 'eugene.vestel@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-2xl border bg-card p-8 shadow-sm space-y-8">
        <header className="space-y-2">
          <p className="font-display text-sm tracking-wide text-primary">DagsThreads Studio</p>
          <h1 className="text-2xl font-semibold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {UPDATED}</p>
        </header>

        <Section title="App purpose">
          <p>
            DagsThreads Studio (the &ldquo;App&rdquo;) is a design-to-storefront tool. It helps shop
            operators create t-shirt designs (from typed slogans or AI-assisted generation), review
            them, and publish finished products to their own Etsy shop through the Printify
            print-on-demand platform. It also collects listing performance statistics (views,
            favorites, sales) so operators can see what sells. The App is an operator tool — it is
            not a marketplace and does not sell anything directly to consumers.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong className="text-foreground">Account data.</strong> Email address and a hashed
            password (bcrypt) for each operator account. We never store plain-text passwords.
          </p>
          <p>
            <strong className="text-foreground">Connected-service credentials.</strong> If you
            connect an Etsy account, we store the OAuth access and refresh tokens Etsy issues so
            the App can act on your behalf (publishing photos, reading your listing stats and
            receipts). We store your Printify shop and product identifiers. You can disconnect
            Etsy at any time from Settings, which deletes the tokens.
          </p>
          <p>
            <strong className="text-foreground">Content you create.</strong> Slogans, design briefs,
            generated design images, product mockups, listing titles/descriptions/tags, and pricing
            choices.
          </p>
          <p>
            <strong className="text-foreground">Usage and performance data.</strong> Listing
            statistics returned by the Etsy API (views, favorites, sales counts), generation cost
            accounting, and technical logs (timestamps, success/failure of API calls) used to keep
            the pipeline reliable.
          </p>
          <p>
            <strong className="text-foreground">Cookies.</strong> A single signed session cookie
            (<code>tshirt_session</code>) keeps you logged in. We do not use advertising or
            cross-site tracking cookies.
          </p>
        </Section>

        <Section title="How we use information">
          <p>
            Solely to operate the App for you: authenticating you, generating and storing designs,
            publishing products to your Printify and Etsy accounts, fetching your listing
            statistics, and showing you dashboards. We do not sell, rent, or share personal data
            with third parties for their own marketing. We do not use your data to train AI models.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>The App relies on these processors to function:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Etsy</strong> — listing publishing and stats via the Etsy Open API.</li>
            <li><strong className="text-foreground">Printify</strong> — print-on-demand product creation and fulfillment.</li>
            <li><strong className="text-foreground">Vercel</strong> — application hosting and image/file storage (Vercel Blob).</li>
            <li><strong className="text-foreground">Neon</strong> — PostgreSQL database hosting.</li>
            <li><strong className="text-foreground">Google (Gemini), Groq, Recraft</strong> — AI text/SVG/image generation. Only the design brief or slogan text needed to generate a design is sent; no account credentials are shared with AI providers.</li>
          </ul>
          <p>
            Each provider processes data under its own privacy policy. The term &ldquo;Etsy&rdquo;
            is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or
            certified by Etsy, Inc.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            Account data, designs, and listing records are kept while your account is active.
            Disconnecting Etsy deletes your Etsy tokens immediately. To delete your account and
            associated data entirely, email us at{' '}
            <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> and we
            will remove it within 30 days, except records we must keep for legal or accounting
            reasons.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Passwords are hashed with bcrypt, sessions are signed (JWT via jose), all traffic is
            served over HTTPS, and connected-service tokens are stored server-side only and never
            exposed to the browser. No method of storage is 100% secure, but we follow current
            good practice for a tool of this kind.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The App is a business tool intended for adults and is not directed at children under 13.
            We do not knowingly collect data from children.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We will post any changes on this page and update the &ldquo;Last updated&rdquo; date
            above. Material changes will be highlighted in the App.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests:{' '}
            <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </Section>

        <footer className="border-t pt-4 text-sm">
          <Link href="/login" className="text-primary underline">Back to sign in</Link>
        </footer>
      </div>
    </main>
  );
}
