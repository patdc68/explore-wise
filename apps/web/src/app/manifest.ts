import type { MetadataRoute } from "next";

import { siteDescription } from "@/data/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ExploreWise",
    short_name: "ExploreWise",
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ea",
    theme_color: "#17233b",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
