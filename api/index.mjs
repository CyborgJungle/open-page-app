import app from '../worker/index.js';

export default {
  fetch(request) {
    const url = new URL(request.url);
    // Vercel rewrites all app paths to this shared function.
    if (url.pathname === '/api/index') {
      const path = url.searchParams.get('__page_path');
      if (path !== null) {
        url.pathname = '/' + path.replace(/^\/+/, '');
        url.searchParams.delete('__page_path');
        request = new Request(url, request);
      }
    }
    return app.fetch(request);
  }
};
