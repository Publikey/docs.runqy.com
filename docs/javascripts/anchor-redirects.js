/* Old deep links into pages that were split in the November 2026 reorganisation.
   A redirect sends /server/configuration/#how-priorities-are-applied to the new server
   configuration page, which no longer has that section: this sends the reader on to the page
   that does. Keys are page paths relative to the docs root, values map old anchors to targets. */
(function () {
  var moved = {
    "reference/server-config/": {
      "sub-queues": "concepts/queues/",
      "how-priorities-are-applied": "concepts/queues/#how-priorities-are-applied",
      "strict-priority": "concepts/queues/#how-priorities-are-applied",
      "queue-worker-definitions-yaml": "reference/queue-config/",
      "task-lifecycle-limits": "guides/task-lifecycle/",
      "vaults": "guides/vaults/"
    },
    "concepts/architecture/": {
      "sub-queues": "concepts/queues/",
      "degraded-state": "concepts/workers/#crash-recovery",
      "redis-keys": "guides/monitoring/"
    },
    "concepts/workers/": {
      "installation": "getting-started/installation/",
      "docker": "getting-started/installation/"
    }
  };

  var hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;

  // The docs root is wherever this script was loaded from, minus "javascripts/…".
  var script = document.currentScript;
  if (!script) return;
  var root = script.src.replace(/javascripts\/anchor-redirects\.js.*$/, "");
  var page = window.location.href.split("#")[0].split("?")[0];
  if (page.indexOf(root) !== 0) return;

  var targets = moved[page.slice(root.length)];
  if (targets && targets[hash] && !document.getElementById(hash)) {
    window.location.replace(root + targets[hash]);
  }
})();
