/* home-wire.js — connects the redesigned landing (public/home.html, a Claude
 * design-tool artifact) to the app's real routes. Behavior only: it adds no
 * markup and changes nothing visual. Click delegation on document survives the
 * design's live re-renders. Only the exact CTA/footer labels below are routed;
 * the interactive "control room" demo (student rows, Grant +5 min, Next, peek
 * modal) and the in-page scroll anchors (#monitor/#institutions/#verify) are
 * deliberately left alone. */
(function () {
  var ROUTES = {
    'Enter your exam': '/exam',
    'Open the admin portal →': '/admin',
    'Open the admin portal': '/admin',
    'Verify a certificate →': '/verify',
    'Take an exam': '/exam',
    'Student guide': '/students.html',
    'Device check': '/check',
    'Admin portal': '/admin',
    'Write to us': 'mailto:chinmay@matramedia.co.in'
  };
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!el) return;
    var txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
    var dest = ROUTES[txt];
    if (!dest) return;
    e.preventDefault();
    if (dest.indexOf('mailto:') === 0) window.location.href = dest;
    else window.location.assign(dest);
  }, true);
})();
