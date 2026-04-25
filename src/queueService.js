/**
 * Simple serial queue: processes items one at a time.
 */
function createQueue(processor) {
  const items = [];
  let processing = false;

  async function processNext() {
    if (processing || items.length === 0) return;
    processing = true;
    const item = items.shift();

    try {
      await processor(item);
    } catch {
      // Errors are handled inside processor; continue regardless
    }

    processing = false;
    processNext();
  }

  return {
    add(item) {
      items.push(item);
      processNext();
    },
    clear() {
      items.length = 0;
    },
    size() {
      return items.length;
    },
    isProcessing() {
      return processing;
    },
  };
}

module.exports = { createQueue };
