import { CategoryCard } from "@/components/category-card";
import { FeatureCard } from "@/components/feature-card";
import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { Section } from "@/components/section";
import {
  contextFeatures,
  discoveryCategories,
  faqItems,
} from "@/data/site";

const requestChips = ["₱1,500", "2 people", "Makati", "Tonight", "Date"];

const previewPlan = [
  { label: "Dinner", detail: "A relaxed start", price: "₱780", tone: "orange" },
  { label: "Activity", detail: "Something playful", price: "₱360", tone: "blue" },
  { label: "Dessert", detail: "A sweet finish", price: "₱180", tone: "purple" },
] as const;

const budgetPrompts = [
  "What can we do with ₱500?",
  "Plan a date under ₱1,500.",
  "Anything free happening nearby?",
  "Four friends. ₱3,000. Tonight.",
];

export default function Home() {
  return (
    <>
      <Navigation />
      <main>
        <section className="hero-section">
          <div aria-hidden="true" className="hero-glow hero-glow-one" />
          <div aria-hidden="true" className="hero-glow hero-glow-two" />
          <div className="hero-shell">
            <div className="hero-copy">
              <p className="eyebrow">Local discovery, built around you</p>
              <h1>
                Explore more.
                <span>Spend wisely.</span>
              </h1>
              <p className="hero-description">
                Tell us your budget, time, location, and mood. ExploreWise helps
                you figure out what to do next.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#how-it-works">
                  See how it works
                  <span aria-hidden="true">↓</span>
                </a>
                <a className="button button-secondary" href="#discover">
                  Explore what&apos;s possible
                </a>
              </div>
              <p className="hero-note">
                <span aria-hidden="true">●</span>
                Starting in Metro Manila
              </p>
            </div>

            <div className="recommendation-stage">
              <div aria-hidden="true" className="stage-sticker stage-sticker-top">
                right now
              </div>
              <div className="recommendation-card clay-card">
                <div className="preview-header">
                  <div>
                    <p className="card-eyebrow">Illustrative preview</p>
                    <h2>Your evening, mapped out</h2>
                  </div>
                  <span className="wise-dot" aria-label="Wise preview">
                    W
                  </span>
                </div>

                <div aria-label="Example request" className="request-chips">
                  {requestChips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>

                <div className="plan-list">
                  {previewPlan.map((item, index) => (
                    <div className="plan-row" key={item.label}>
                      <span
                        aria-hidden="true"
                        className={`plan-icon accent-${item.tone}`}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <p>{item.label}</p>
                        <span>{item.detail}</span>
                      </div>
                      <strong>{item.price}</strong>
                    </div>
                  ))}
                </div>

                <div className="plan-total">
                  <div>
                    <span>Estimated total</span>
                    <strong>₱1,320</strong>
                  </div>
                  <span className="budget-left">₱180 left</span>
                </div>
                <p className="preview-disclaimer">
                  Example UI only. Not live recommendations or verified prices.
                </p>
              </div>
              <div aria-hidden="true" className="stage-sticker stage-sticker-bottom">
                fits the moment
              </div>
            </div>
          </div>
        </section>

        <Section
          className="problem-section"
          eyebrow="The familiar question"
          id="why-explorewise"
          title="You know the context. You just need the plan."
          description="Most of us already know what we can spend, how long we have, and who is coming. The hard part is turning all of that into a useful answer."
        >
          <div className="problem-grid">
            <div className="context-stack">
              <div><span>Budget</span><strong>₱1,500</strong></div>
              <div><span>Time</span><strong>3 hours</strong></div>
              <div><span>Company</span><strong>Just us two</strong></div>
              <div><span>Mood</span><strong>Easygoing</strong></div>
            </div>
            <blockquote className="question-card clay-card">
              <span aria-hidden="true">“</span>
              <p>What should we do?</p>
              <footer>
                ExploreWise turns the details of your moment into ideas that
                make sense together.
              </footer>
            </blockquote>
          </div>
        </Section>

        <Section
          eyebrow="How it works"
          id="how-it-works"
          title="From context to a plan in three steps."
          description="Less tab-hopping. Less group-chat indecision. More time actually going somewhere."
        >
          <div className="steps-grid">
            <FeatureCard
              accent="lime"
              description="Share your budget, location, available time, group size, and mood."
              eyebrow="01 · Start with context"
              title="Tell us what you’ve got"
            />
            <FeatureCard
              accent="blue"
              description="It evaluates suitable food, activities, events, and experiences that can fit."
              eyebrow="02 · Make the pieces work"
              title="ExploreWise finds the fit"
            />
            <FeatureCard
              accent="purple"
              description="Get a recommendation or an itinerary designed around the moment."
              eyebrow="03 · Leave the planning loop"
              title="Go explore"
            />
          </div>
        </Section>

        <Section
          className="discover-section"
          eyebrow="Discover your way"
          id="discover"
          title="A city has more than one answer."
          description="ExploreWise is being designed for spontaneous cravings, carefully planned dates, family days, and everything in between."
        >
          <div className="category-grid">
            {discoveryCategories.map((category, index) => (
              <CategoryCard
                accent={category.accent}
                hint={category.hint}
                index={index}
                key={category.label}
                label={category.label}
              />
            ))}
          </div>
          <p className="visual-only-note">
            Category cards are a preview and are not interactive yet.
          </p>
        </Section>

        <section className="budget-section">
          <div className="budget-shell">
            <div className="budget-copy">
              <p className="eyebrow">Budget first, always useful</p>
              <h2>
                Your budget isn&apos;t a limitation.
                <span>It&apos;s where the plan starts.</span>
              </h2>
              <p>
                ExploreWise begins with what is realistic, then looks for the
                most interesting way to use it—whether that means one memorable
                stop, a full evening, or something completely free.
              </p>
            </div>
            <div className="prompt-stack" aria-label="Illustrative prompts">
              {budgetPrompts.map((prompt, index) => (
                <div className="prompt-bubble" key={prompt}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <p>{prompt}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Section
          className="ask-wise-section"
          eyebrow="Ask Wise · Coming soon"
          title="A natural way to ask a very specific question."
          description="Ask Wise is the planned conversational layer for moments that do not fit neatly into a search box."
        >
          <div className="wise-preview clay-card">
            <div className="chat-heading">
              <span className="wise-dot">W</span>
              <div>
                <h3>Ask Wise</h3>
                <p>Preview conversation</p>
              </div>
              <span className="coming-pill">Coming soon</span>
            </div>
            <div className="chat-thread">
              <div className="chat-message chat-user">
                <p>
                  We&apos;re four friends in BGC tonight with ₱3,000. Somewhere
                  we can talk first, then something fun. No bars.
                </p>
                <span>You</span>
              </div>
              <div className="chat-message chat-wise">
                <p className="chat-intro">
                  Here is one shape the evening could take:
                </p>
                <ol>
                  <li>
                    <strong>Start with dinner</strong>
                    <span>A relaxed, conversation-friendly option · about ₱1,600</span>
                  </li>
                  <li>
                    <strong>Then do something playful</strong>
                    <span>An indoor group activity nearby · about ₱1,000</span>
                  </li>
                  <li>
                    <strong>Keep a little room</strong>
                    <span>Shared dessert or coffee · about ₱400</span>
                  </li>
                </ol>
                <span>Wise · Illustrative response</span>
              </div>
            </div>
            <div className="grounded-note">
              <span aria-hidden="true">◎</span>
              <p>
                AI-assisted, grounded in real place and event data. This
                feature is a preview and is not currently live.
              </p>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Built for real life"
          title="Because the same idea does not fit every moment."
          description="ExploreWise is being built to understand the constraints and preferences that actually shape a good day out."
        >
          <div className="capability-grid">
            {contextFeatures.map((feature) => (
              <article
                className={`capability-card accent-${feature.accent}`}
                key={feature.title}
              >
                <span aria-hidden="true" className="capability-icon">✓</span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
                {feature.status ? (
                  <span className="planned-pill">{feature.status}</span>
                ) : null}
              </article>
            ))}
          </div>
        </Section>

        <section className="manila-section">
          <div aria-hidden="true" className="map-pattern" />
          <div className="manila-shell">
            <div>
              <p className="eyebrow">Our first chapter</p>
              <h2>
                Starting in Metro Manila.
                <span>Built for anywhere.</span>
              </h2>
            </div>
            <p>
              ExploreWise will begin by learning one of the world&apos;s most
              energetic urban regions deeply. Underneath, the platform is being
              designed for new currencies, timezones, languages, and cities as
              it grows.
            </p>
          </div>
        </section>

        <Section
          className="faq-section"
          eyebrow="A few useful answers"
          id="faq"
          title="Before you ask…"
        >
          <div className="faq-list">
            {faqItems.map((item, index) => (
              <details key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <span aria-hidden="true" className="faq-plus">+</span>
                </summary>
                <p>{item.answer}</p>
                <span aria-hidden="true" className="faq-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </details>
            ))}
          </div>
        </Section>

        <section className="final-cta" id="coming-soon">
          <div className="final-cta-card clay-card">
            <span className="coming-pill">Coming soon</span>
            <h2>Not sure where to go next?</h2>
            <p>
              ExploreWise is taking shape in Metro Manila. We are building the
              thoughtful way to turn “what should we do?” into a plan.
            </p>
            <a
              className="button button-primary"
              href="mailto:developer@explore-wise.fun?subject=ExploreWise%20early%20access"
            >
              Say hello
              <span aria-hidden="true">↗</span>
            </a>
            <small>No sign-up form yet. This opens your email app.</small>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
