/* eslint-disable no-restricted-globals */

const parseJsonText = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (typeof text === 'string' && /\bNaN\b/.test(text)) {
      return JSON.parse(text.replace(/\bNaN\b/g, 'null'));
    }
    throw err;
  }
};

self.onmessage = async (event) => {
  const { id, url } = event.data || {};
  if (!id || !url) return;

  const postProgress = (stage, loaded = 0, total = 0) => {
    self.postMessage({
      id,
      type: 'progress',
      stage,
      loaded,
      total,
      percent: total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : null,
    });
  };

  try {
    postProgress('downloading');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const total = Number(response.headers.get('content-length') || 0);
    let stream = response.body;

    // Pipe through browser gzip decompressor if requesting a .gz file
    if (url.endsWith('.gz') && typeof DecompressionStream !== 'undefined') {
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }

    let text = '';

    if (stream && typeof stream.getReader === 'function') {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const chunks = [];
      let loaded = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        chunks.push(decoder.decode(value, { stream: true }));
        postProgress('downloading', loaded, total);
      }
      chunks.push(decoder.decode());
      text = chunks.join('');
      postProgress('downloading', loaded, total || loaded);
    } else {
      const resp = new Response(stream);
      text = await resp.text();
      postProgress('downloading', text.length, total || text.length);
    }

    postProgress('parsing', total || text.length, total || text.length);
    const data = parseJsonText(text);
    self.postMessage({ id, type: 'done', data });
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: err?.message || String(err),
      name: err?.name || 'Error',
    });
  }
};