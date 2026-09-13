/* Native device location only. Loading this script never requests permission. */
(function installCrowLocation(window) {
  'use strict';

  let pending = null;
  const messages = {
    denied: 'Location access was declined. You can choose a destination or try again.',
    unavailable: 'Your location is not available right now. Choose a destination or try again.',
    timeout: 'Finding your location took too long. Choose a destination or try again.',
  };

  function unavailable(message) {
    return { status: 'unavailable', place: null, message: message || messages.unavailable };
  }

  function locate() {
    if (pending) return pending;
    if (window.isSecureContext !== true) {
      return Promise.resolve(unavailable('Location access needs HTTPS or localhost. You can still choose a destination.'));
    }
    let geolocation;
    try { geolocation = window.navigator?.geolocation; }
    catch { return Promise.resolve(unavailable('This browser cannot share your location. Choose a destination to start.')); }
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      return Promise.resolve(unavailable('This browser cannot share your location. Choose a destination to start.'));
    }

    const request = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        resolve(result);
      };
      // Some browsers never call either callback when a permission prompt is
      // left open. Stop waiting locally after the native eight-second timeout.
      const watchdog = window.setTimeout(() => finish({ status: 'timeout', place: null, message: messages.timeout }), 9000);
      const failure = error => {
        const status = error?.code === 1 ? 'denied' : error?.code === 3 ? 'timeout' : 'unavailable';
        finish({ status, place: null, message: messages[status] });
      };
      try {
        geolocation.getCurrentPosition(position => {
          if (settled) return;
          const latitude = position?.coords?.latitude;
          const longitude = position?.coords?.longitude;
          const accuracy = position?.coords?.accuracy;
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
              !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
              (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0))) {
            finish(unavailable('Your browser returned an invalid location. Choose a destination or try again.'));
            return;
          }
          finish({ status: 'located', place: { name: 'Your location', lat: latitude, lng: longitude },
            ...(accuracy === undefined ? {} : { accuracy }), message: 'Found your location. Bringing your crow nearby.' });
        }, failure, { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
      } catch (error) {
        failure({ code: ['NotAllowedError', 'SecurityError'].includes(error?.name) ? 1 : 2 });
      }
    });
    pending = request;
    // Clear after settlement, including synchronous browser/mock callbacks,
    // so a later explicit retry can make a fresh native location request.
    request.then(() => { if (pending === request) pending = null; });
    return request;
  }

  window.CrowLocation = Object.freeze({ locate });
})(window);
