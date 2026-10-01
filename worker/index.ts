// fia-app Worker entry (wrangler.jsonc `main`). Static assets are served by the ASSETS binding
// exactly as before; only `/api/*` runs this code first (run_worker_first). workerd requires the
// entry module to export handlers only, so the endpoint lives in worker/feedback.ts.
import { FEEDBACK_PATH, handleFeedback, json, type Env } from './feedback';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === FEEDBACK_PATH) return handleFeedback(request, env);
    if (pathname.startsWith('/api/')) return json(404, { error: 'not-found' });
    return env.ASSETS.fetch(request);
  },
};
