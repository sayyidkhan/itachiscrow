// Keep the journey card independent of chat, voice, and provider setup.
(() => {
  const card = document.getElementById('travel-transition');
  if (!card) return;
  const stages = {departing:'Leaving the familiar', cruising:'Crossing the globe', descending:'A new place comes into view', approaching:'Almost there'};
  const hide = () => { card.hidden = true; document.body.classList.remove('long-flight'); };
  document.addEventListener('crow:flight', ({detail: flight}) => {
    if (!flight?.stage || flight.cancelled || flight.arrived || !(flight.routeDistanceMeters >= 50000)) { hide(); return; }
    document.getElementById('travel-stage').textContent = stages[flight.stage] || 'On our way';
    document.getElementById('travel-origin').textContent = flight.from?.name || 'Your starting point';
    document.getElementById('travel-destination').textContent = flight.to?.name || flight.destination?.name || 'Your destination';
    document.getElementById('travel-distance').textContent = `${Math.round(flight.routeDistanceMeters / 1000).toLocaleString()} km`;
    document.getElementById('travel-progress').style.width = `${Math.max(0, Math.min(1, flight.progress || 0)) * 100}%`;
    card.hidden = false;
    document.body.classList.add('long-flight');
  });
  for (const event of ['crow:context', 'crow:destination', 'crow:landed']) {
    document.addEventListener(event, ({detail}) => { if (detail?.mode !== 'arriving' || !detail.flightStage) hide(); });
  }
  window.addEventListener('pagehide', hide);
})();
