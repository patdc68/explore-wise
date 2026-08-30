export type Accent = "lime" | "blue" | "purple" | "orange";

export const siteUrl = "https://explore-wise.fun";

export const siteDescription =
  "Discover food, activities, events, and experiences that fit your budget, time, location, and mood.";

export const navigationItems = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Discover", href: "/#discover" },
  { label: "Why ExploreWise", href: "/#why-explorewise" },
  { label: "FAQ", href: "/#faq" },
] as const;

export const discoveryCategories: Array<{
  label: string;
  hint: string;
  accent: Accent;
}> = [
  { label: "Eat", hint: "A meal that fits", accent: "orange" },
  { label: "Coffee", hint: "Slow down nearby", accent: "purple" },
  { label: "Date", hint: "Make a whole plan", accent: "lime" },
  { label: "Activities", hint: "Do something fun", accent: "blue" },
  { label: "Events", hint: "See what is on", accent: "orange" },
  { label: "Family", hint: "Good for the group", accent: "purple" },
  { label: "Free", hint: "Spend less, do more", accent: "lime" },
  { label: "Explore", hint: "Find a new corner", accent: "blue" },
  { label: "Night Out", hint: "Keep the evening going", accent: "purple" },
  { label: "Surprise Me", hint: "Leave room for discovery", accent: "orange" },
];

export const contextFeatures: Array<{
  title: string;
  description: string;
  accent: Accent;
  status?: string;
}> = [
  {
    title: "Budget-aware",
    description: "Plans shaped around what the whole moment can cost.",
    accent: "lime",
  },
  {
    title: "Location-aware",
    description: "Suggestions that make sense from where you actually are.",
    accent: "blue",
  },
  {
    title: "Time-aware",
    description: "A quick hour and a full day should lead to different plans.",
    accent: "purple",
  },
  {
    title: "Weather-aware",
    description: "Future suggestions can adapt when the forecast changes.",
    accent: "orange",
    status: "Planned",
  },
  {
    title: "Mood-aware",
    description: "Quiet, adventurous, spontaneous, or somewhere in between.",
    accent: "purple",
  },
  {
    title: "Group-aware",
    description: "A solo afternoon is not the same as four friends tonight.",
    accent: "blue",
  },
];

export const faqItems = [
  {
    question: "Is ExploreWise available now?",
    answer:
      "Not yet. ExploreWise is in development, and this site is an early look at the experience we are building.",
  },
  {
    question: "Will ExploreWise only cover Metro Manila?",
    answer:
      "Metro Manila is the first launch market. The platform and its data model are being built to expand to more cities and countries over time.",
  },
  {
    question: "Are the prices in these previews live?",
    answer:
      "No. Every recommendation and price shown on this landing page is illustrative UI, not a live offer or verified venue listing.",
  },
  {
    question: "Is ExploreWise an AI app?",
    answer:
      "ExploreWise will use AI selectively for natural-language requests and planning, while search, location, filtering, budgets, and candidate selection remain grounded in application logic and real data.",
  },
] as const;
