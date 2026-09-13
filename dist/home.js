// Preserve existing Instagram callback links and popup completion through the new entry page.
if (new URL(location.href).searchParams.has('instagram')) {
  location.replace(new URL('explore.html' + location.search, location.href).href);
}
