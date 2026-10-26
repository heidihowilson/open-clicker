import { mount } from "svelte";
import "./ds/tokens.css";
import "./ds/components.css";
import "./ui/pane.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app");
/* The 3D legends and wordmark are drawn to canvases; wait for the brand fonts first. */
await document.fonts.ready;
export default mount(App, { target });
