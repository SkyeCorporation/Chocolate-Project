export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt");

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt diperlukan" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    try {
      const response = await env.AI.run(
        "@cf/black-forest-labs/flux-1-schnell",
        { prompt: prompt, num_steps: 4 }
      );

      // Flux returns { image: "base64string" }
      if (response && response.image) {
        const binaryStr = atob(response.image);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new Response(bytes.buffer, {
          headers: { "content-type": "image/jpeg" }
        });
      }

      // Fallback: response is already binary (other models)
      return new Response(response, {
        headers: { "content-type": "image/jpeg" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }
};
