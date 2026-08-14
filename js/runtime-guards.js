/* ScriptFlow Pro - Runtime Guards
 * Purpose: protect the application from known browser-extension message-channel
 * rejections. This does NOT hide application errors.
 *
 * The exact message below is produced when an extension listener keeps a Chrome
 * message channel open for an async response and the channel is closed first.
 * It originates outside the page's application code, so ScriptFlow cannot repair
 * the extension itself. We prevent that one external rejection from surfacing as
 * an unhandled promise error while leaving all other errors untouched.
 */
(function () {
  'use strict';

  const CHANNEL_ERROR = /A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received/i;

  function getMessage(reason) {
    try {
      if (!reason) return '';
      if (typeof reason === 'string') return reason;
      return String(reason.message || reason.error || reason.reason || reason);
    } catch (_) {
      return '';
    }
  }

  function isExternalChannelError(reason) {
    return CHANNEL_ERROR.test(getMessage(reason));
  }

  // Register immediately, before application modules and third-party SDKs load.
  // This is important because the rejection can occur during initial page startup.
  window.addEventListener('unhandledrejection', function (event) {
    if (isExternalChannelError(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('error', function (event) {
    if (isExternalChannelError(event.error || event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.ScriptFlowRuntimeGuards = Object.freeze({
    isExternalChannelError
  });
})();
