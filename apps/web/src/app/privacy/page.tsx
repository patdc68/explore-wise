import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ExploreWise expects to collect, use, protect, and manage information as the product develops.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      description="This initial policy explains how ExploreWise expects to handle information as the product is developed. Features and practices may evolve before public launch, and this page will be updated when they do."
      eyebrow="ExploreWise legal"
      title="Privacy Policy"
    >
      <LegalSection title="1. About this policy">
        <p>
          ExploreWise is a product of Inventra Systems. ExploreWise is currently
          in development and is intended to help people discover food,
          activities, events, attractions, and local experiences that fit their
          context.
        </p>
        <p>
          This policy describes the categories of information the service may
          process, why that information may be used, and the choices that may be
          available to users. Not every feature described here is active today.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we may collect">
        <p>As ExploreWise develops, information may include:</p>
        <ul>
          <li>
            <strong>Account information:</strong> identifiers and profile
            details provided if account registration becomes available.
          </li>
          <li>
            <strong>Location information:</strong> a device location, selected
            area, or approximate location when a user explicitly permits or
            supplies it.
          </li>
          <li>
            <strong>Preferences and context:</strong> budgets, interests, moods,
            group context, dietary preferences, and similar discovery inputs.
          </li>
          <li>
            <strong>Saved information:</strong> favorites, saved plans, and
            other choices associated with an account.
          </li>
          <li>
            <strong>Contribution data:</strong> place suggestions, corrections,
            feedback, or other material a user chooses to submit in future
            community features.
          </li>
          <li>
            <strong>Usage and diagnostic information:</strong> interactions,
            device and browser details, error reports, performance information,
            and security logs needed to operate and improve the service.
          </li>
          <li>
            <strong>Communications:</strong> information included when someone
            contacts ExploreWise for support, business, or privacy matters.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How information may be used">
        <p>Information may be used to:</p>
        <ul>
          <li>provide, personalize, and improve discovery features;</li>
          <li>save user preferences and favorites when requested;</li>
          <li>calculate relevant location, time, and budget-based results;</li>
          <li>respond to support, privacy, and business communications;</li>
          <li>understand reliability, diagnose errors, and protect the service;</li>
          <li>develop new features and evaluate product performance; and</li>
          <li>meet applicable legal obligations and enforce service terms.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Location choices">
        <p>
          Precise device location will only be requested when a feature needs it
          and the user grants permission through their device or browser.
          ExploreWise may also allow users to enter a neighborhood, city, or
          other location manually. Device permissions can be changed through
          operating-system or browser settings.
        </p>
      </LegalSection>

      <LegalSection title="5. Service providers and third parties">
        <p>
          ExploreWise may rely on service providers to host infrastructure,
          store data, deliver communications, monitor reliability, process
          approved AI requests, and support product operations. These providers
          may process information on ExploreWise&apos;s behalf under their own
          terms and applicable agreements.
        </p>
        <p>
          The current backend uses Supabase for database and authentication
          infrastructure. Future product features may use additional providers,
          including mapping, analytics, email, place-data, payment, and AI
          services. This policy will be updated as material integrations are
          introduced.
        </p>
        <p>
          Information may also be disclosed when reasonably necessary to
          address legal process, protect users or the public, investigate abuse,
          or support a business reorganization. ExploreWise does not promise
          that information is never shared.
        </p>
      </LegalSection>

      <LegalSection title="6. Future AI processing">
        <p>
          Planned conversational and itinerary features may send relevant
          request text and limited context to an AI service. ExploreWise intends
          to limit this processing to what is useful for the requested feature
          and to keep core search, geographical filtering, budgets, and
          candidate selection grounded in application and database logic.
        </p>
        <p>
          Details about active AI providers, retention settings, and user
          controls will be provided before those features are publicly
          available.
        </p>
      </LegalSection>

      <LegalSection title="7. Data retention">
        <p>
          Information may be retained for as long as reasonably needed to
          provide the service, maintain security and records, resolve disputes,
          satisfy legal obligations, and improve the product. Retention periods
          may differ by data type and operational need. Data may remain in
          backups for a limited period after deletion from active systems.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          ExploreWise plans to use reasonable technical and organizational
          safeguards appropriate to the service, including access controls and
          database-level authorization. No internet service or storage system
          can guarantee absolute security, and users should avoid sending
          sensitive information that a feature does not request.
        </p>
      </LegalSection>

      <LegalSection title="9. Your choices and rights">
        <p>
          Depending on available features and applicable law, users may be able
          to access, correct, export, or request deletion of certain personal
          information; withdraw permissions; or object to particular uses.
          Identity verification may be required before completing a request.
        </p>
        <p>
          ExploreWise is not claiming certification under any particular
          privacy regime at this development stage. Rights and response
          procedures may vary by location and will be refined as the service
          expands.
        </p>
      </LegalSection>

      <LegalSection title="10. International expansion">
        <p>
          ExploreWise is starting in Metro Manila and is being designed for
          future international use. As the service expands, information may be
          processed in countries other than a user&apos;s own. Appropriate
          notices and safeguards will be evaluated for each launch market.
        </p>
      </LegalSection>

      <LegalSection title="11. Children">
        <p>
          ExploreWise is not currently designed as a service directed to young
          children. Age requirements and any family-specific protections will
          be clarified before accounts or community features are publicly
          launched.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes and contact">
        <p>
          This policy may change as ExploreWise&apos;s features, providers, and
          launch markets develop. Material updates will be reflected here with
          a revised date.
        </p>
        <p>
          Questions or privacy requests can be sent to{" "}
          <a href="mailto:developer@explore-wise.fun">
            developer@explore-wise.fun
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
