import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SEV7N SIGNS", short_name: "SEV7N SIGNS", description: "Tested trading signals with honest numbers. Powered by SEV7N FOLD.",
    start_url: "/", display: "standalone", background_color: "#efebe4", theme_color: "#141416",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
