import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Initial terms governing access to ExploreWise while the service is in development.",
};

export default function TermsPage() {
  return (
    <LegalPage
      description="These initial terms describe the ground rules for using ExploreWise. The product is still in development, so features and these terms may change before public launch."
      eyebrow="ExploreWise legal"
      title="Terms of Service"
    >
      <LegalSection title="1. Acceptance">
        <p>
          By accessing or using ExploreWise, you agree to these Terms of
          Service. If you do not agree, do not use the service. ExploreWise is a
          product of Inventra Systems.
        </p>
      </LegalSection>

      <LegalSection title="2. Development-stage service">
        <p>
          ExploreWise is currently under development. Features may be added,
          changed, suspended, or removed, and previews on this website may not
          represent final functionality. Access may be limited while the
          service is tested and prepared for launch.
        </p>
      </LegalSection>

      <LegalSection title="3. Recommendations are informational">
        <p>
          ExploreWise is intended to help users discover options and organize
          plans. Recommendations, rankings, explanations, estimated budgets,
          routes, and itineraries are informational aids—not professional
          advice, bookings, or guarantees.
        </p>
        <p>
          Users should independently verify information that matters before
          traveling, making a reservation, attending an event, or spending
          money.
        </p>
      </LegalSection>

      <LegalSection title="4. Prices, hours, events, and availability">
        <p>
          Prices and totals may be estimates based on available information and
          may exclude taxes, fees, transport, tips, or individual choices.
          Opening hours, event schedules, availability, access rules, and
          promotions can change without notice.
        </p>
        <p>
          ExploreWise does not guarantee prices, opening hours, availability,
          event accuracy, merchant quality, or that any option will meet a
          user&apos;s needs. Critical details should be confirmed directly with
          the relevant business, venue, organizer, or official source.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-party businesses and services">
        <p>
          Places, events, merchants, transport providers, websites, and other
          third parties are independent from ExploreWise unless explicitly
          stated otherwise. ExploreWise is not responsible for their products,
          services, content, policies, safety, availability, or conduct.
        </p>
        <p>
          Any transaction or interaction with a third party is between the user
          and that third party and may be governed by separate terms.
        </p>
      </LegalSection>

      <LegalSection title="6. User responsibility">
        <p>
          Users are responsible for evaluating whether a recommendation is
          appropriate for their circumstances, including budget, health,
          accessibility, dietary needs, transportation, local conditions, age
          restrictions, weather, and personal safety.
        </p>
      </LegalSection>

      <LegalSection title="7. Accounts and behavior">
        <p>
          If accounts become available, users must provide accurate information,
          protect account credentials, and promptly report suspected
          unauthorized access. Users are responsible for activity performed
          through their accounts to the extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Acceptable use">
        <p>Users may not:</p>
        <ul>
          <li>use the service for unlawful, fraudulent, or harmful purposes;</li>
          <li>harass others or submit abusive, deceptive, or infringing content;</li>
          <li>attempt to bypass access controls or probe service security;</li>
          <li>interfere with service operation or other users&apos; access;</li>
          <li>scrape, copy, or automate access in a way that burdens the service;</li>
          <li>misrepresent an affiliation with ExploreWise or Inventra Systems; or</li>
          <li>use contributed information in violation of third-party rights.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. User contributions">
        <p>
          Future contribution features may allow users to suggest places,
          submit corrections, or provide other content. Users must have the
          right to submit that material and must not knowingly provide false,
          unlawful, or harmful information.
        </p>
        <p>
          Additional contribution terms, including the permissions needed to
          display and process submitted content, may be presented when those
          features launch.
        </p>
      </LegalSection>

      <LegalSection title="10. Intellectual property">
        <p>
          ExploreWise, its original branding, software, interface, and content
          are owned by Inventra Systems or its licensors and are protected by
          applicable intellectual-property laws. These terms do not grant
          ownership of the service or permission to use ExploreWise branding
          beyond ordinary use of the service.
        </p>
      </LegalSection>

      <LegalSection title="11. Service limitations">
        <p>
          To the extent permitted by applicable law, the service is provided on
          an “as available” basis. ExploreWise does not promise uninterrupted
          access, error-free operation, complete data, or that every
          recommendation will be suitable.
        </p>
        <p>
          Inventra Systems will not be liable for indirect, incidental, or
          consequential loss arising from use of the service where such
          limitations are permitted. Nothing in these terms excludes rights or
          liability that cannot lawfully be excluded.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes and termination">
        <p>
          ExploreWise may modify or discontinue parts of the service and may
          restrict or terminate access when reasonably necessary for security,
          legal compliance, abuse prevention, or enforcement of these terms.
          Updated terms will be posted with a revised effective date.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:developer@explore-wise.fun">
            developer@explore-wise.fun
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
