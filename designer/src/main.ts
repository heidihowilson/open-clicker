import { mount } from "svelte";

/* "/" is the first-visit onboarding (docs/onboarding). "/studio" keeps the full designer,
 * unlinked, as the expert tool. Each loads only its own styles. */
const target = document.getElementById("app");
if (!target) throw new Error("Missing #app");

if (location.pathname.replace(/\/+$/, "") === "/studio") {
  await Promise.all([import("./ds/tokens.css"), import("./ds/components.css"), import("./ui/pane.css")]);
  document.documentElement.dataset.theme = "ivory";
  document.title = "Open Clicker studio";
  /* The 3D legends and wordmark are drawn to canvases; wait for the brand fonts first. */
  await document.fonts.ready;
  const { default: App } = await import("./App.svelte");
  mount(App, { target });
} else {
  await import("./onboarding/onboarding.css");
  const { default: Onboarding } = await import("./onboarding/Onboarding.svelte");
  mount(Onboarding, { target });
}
