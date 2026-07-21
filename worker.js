import { onRequestPost as submitHandler } from "./functions/api/submit.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return submitHandler({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },
};
