/* Macro flow for CODEX STUDYS: Batch (Today's classes + Subjects) -> Topics -> Lectures/Notes/DPP -> Player */
(function () {
  "use strict";

  var API = "/api/content/";
  var MIRROR = "https://proxy.streamvideo.co.in/fetch/api.penpencil.co/";
  var STREAM_API = "https://pw-stream.pages.dev/api/video-url";
  var PLAYER_ORIGIN = "https://pw-player2.ai.studio";

  var app = document.getElementById("app");
  var params = new URLSearchParams(location.search);

  /* ------------------------------------------------------------ helpers */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }
  function enc(v) { return encodeURIComponent(v == null ? "" : v); }
  function qs(obj) {
    var u = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
    });
    var s = u.toString();
    return s ? "?" + s : "";
  }
  function imageUrl(ref) { return ref && ref.baseUrl && ref.key ? ref.baseUrl + ref.key : null; }
  function plainText(html) {
    return String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function fmtDate(v) {
    var d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleDateString() : "";
  }
  function fmtTime(v) {
    var d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  }
  function skeleton(n, tall) {
    var out = tall ? '<div class="mx-skel tall"></div>' : "";
    for (var i = 0; i < n; i++) out += '<div class="mx-skel" style="margin-top:10px"></div>';
    return out;
  }
  function errorBox(msg) {
    return '<div class="mx-err"><p>' + esc(msg) + '</p><button class="btn btn-primary" type="button" data-retry>Retry</button></div>';
  }
  function bindRetry(root, fn) {
    var b = root.querySelector("[data-retry]");
    if (b) b.addEventListener("click", fn);
  }
  function href(o) { return "batch.html" + qs(o); }

  /* ----------------------------------------------------------- data API */
  var memo = new Map();

  function tryUrl(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) { /* not json */ }
          if (r.ok && j && j.success !== false) return { ok: true, json: j };
          return { ok: false, json: j, status: r.status };
        });
      })
      .catch(function () { return { ok: false, json: null, status: 0 }; });
  }

  // Own /api/content proxy first, open mirror as a direct fallback (works even on static hosting).
  function contentGet(path, p) {
    var key = path + qs(p);
    if (memo.has(key)) return memo.get(key);
    var pr = tryUrl(API + path + qs(p)).then(function (r) {
      if (r.ok) return r.json.data;
      return tryUrl(MIRROR + path + qs(p)).then(function (r2) {
        if (r2.ok) return r2.json.data;
        var last = r2.json ? r2 : r;
        var msg = (last.json && last.json.message) ||
          (last.status === 404 ? "This content isn't available." : "Couldn't load this content.");
        throw new Error(msg);
      });
    });
    memo.set(key, pr);
    pr.catch(function () { memo.delete(key); });
    return pr;
  }

  function getDetails(id) { return contentGet("v3/batches/" + id + "/details"); }

  function getTodaysSchedule(id) {
    return contentGet("v2/batches/" + id + "/todays-schedule").then(function (raw) {
      return (raw || []).map(function (entry) {
        var d = entry.data || {};
        var subj = d.subjectId;
        return Object.assign({}, d, {
          _id: d._id || entry._id || "",
          type: entry.type,
          subjectId: typeof subj === "string" ? subj : subj && subj._id
        });
      });
    });
  }

  /* ---------------------------------------------------------- Today's classes */
  function classStatus(item) {
    var raw = ((item.tag || "") + " " + (item.status || "")).toLowerCase();
    if (/end|complet|expired/.test(raw)) return "ended";
    if (/live|ongoing|started/.test(raw)) return "live";
    if (/upcoming|todo|scheduled/.test(raw)) return "upcoming";
    var now = Date.now();
    var start = item.startTime ? new Date(item.startTime).getTime() : NaN;
    var end = item.endTime ? new Date(item.endTime).getTime() : NaN;
    if (!isNaN(end) && now > end) return "ended";
    if (!isNaN(start) && now < start) return "upcoming";
    if (!isNaN(start) && !isNaN(end)) return "live";
    return null;
  }
  var STATUS_LABEL = { live: "Live", upcoming: "Upcoming", ended: "Ended" };

  function renderToday(id, fallbackSubjectId, items) {
    if (!items.length) return '<div class="mx-empty">No class scheduled for today.</div>';
    return '<div class="mx-strip">' + items.map(function (item) {
      var subjectId = item.batchSubjectId || item.subjectId || fallbackSubjectId;
      var status = classStatus(item);
      var banner = item.videoDetails && item.videoDetails.image;
      var title = item.topic || (item.videoDetails && item.videoDetails.name) || "";
      var when = [fmtTime(item.startTime), fmtTime(item.endTime)].filter(Boolean).join(" – ");
      var meta = [when, item.lectureType].filter(Boolean).join(" · ");
      var link = href({ v: "watch", batchId: id, subjectId: subjectId, scheduleId: item._id, title: title });
      return '<a class="mx-tcard" href="' + esc(link) + '">' +
        '<span class="mx-tthumb">' +
        (banner ? '<img src="' + esc(banner) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "▶") +
        (status ? '<span class="mx-badge ' + status + '">' + STATUS_LABEL[status] + "</span>" : "") +
        "</span>" +
        '<span class="mx-tbody">' +
        (title ? '<span class="mx-ttitle">' + esc(title) + "</span>" : "") +
        (meta ? '<span class="mx-tmeta" style="display:block">🕒 ' + esc(meta) + "</span>" : "") +
        "</span></a>";
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------------------ views */
  function viewBatch(id) {
    app.innerHTML = '<a class="mx-crumb" href="index.html#courses">← All courses</a>' + skeleton(4, true);
    getDetails(id).then(function (b) {
      document.title = (b.name || "Batch") + " — CODEX STUDYS";
      var cover = imageUrl(b.previewImage);
      var desc = plainText(b.shortDescription);
      var subjects = b.subjects || [];
      var meta = [
        b["class"] ? "Class " + esc(b["class"]) : "",
        b.language ? esc(b.language) : "",
        b.startDate ? "📅 " + esc(fmtDate(b.startDate)) : ""
      ].filter(Boolean).join(" · ");

      app.innerHTML =
        '<a class="mx-crumb" href="index.html#courses">← All courses</a>' +
        '<div class="mx-hero">' +
        (cover ? '<img src="' + esc(cover) + '" alt="' + esc(b.name) + '" referrerpolicy="no-referrer">' : "") +
        '<div class="mx-hero-body"><h1 class="mx-h1">' + esc(b.name) + "</h1>" +
        (meta ? '<div class="mx-meta">' + meta + "</div>" : "") +
        (desc ? '<p class="mx-desc">' + esc(desc) + "</p>" : "") +
        "</div></div>" +
        '<h2 class="mx-h2">Today\'s classes</h2><div id="today">' + skeleton(1) + "</div>" +
        '<h2 class="mx-h2">Subjects</h2>' +
        (subjects.length
          ? '<div class="mx-grid">' + subjects.map(function (s) {
              var img = imageUrl(s.imageId);
              return '<a class="mx-row" href="' + esc(href({ id: id, s: s.slug, st: s.subject })) + '">' +
                '<span class="mx-ico">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "📘") + "</span>" +
                '<span class="mx-rtext"><span class="mx-rtitle">' + esc(s.subject) + "</span>" +
                '<span class="mx-rsub">' + (s.lectureCount ? esc(s.lectureCount) + " lectures" : "View topics") + "</span></span>" +
                '<span class="mx-chev">›</span></a>';
            }).join("") + "</div>"
          : '<div class="mx-empty">No subjects published for this batch yet.</div>');

      var fallbackSubjectId = subjects[0] && subjects[0]._id || "";
      var today = document.getElementById("today");
      getTodaysSchedule(id)
        .then(function (items) { today.innerHTML = renderToday(id, fallbackSubjectId, items); })
        .catch(function () { today.innerHTML = '<div class="mx-empty">No class scheduled for today.</div>'; });
    }).catch(function (e) {
      app.innerHTML = '<a class="mx-crumb" href="index.html#courses">← All courses</a>' +
        errorBox(e.message || "This batch isn't available.");
      bindRetry(app, function () { viewBatch(id); });
    });
  }

  function viewSubject(id, slug, titleHint) {
    var back = href({ id: id });
    app.innerHTML = '<a class="mx-crumb" href="' + esc(back) + '">← Back to batch</a>' + skeleton(7);
    getDetails(id).then(function (b) {
      var subject = (b.subjects || []).filter(function (s) { return s.slug === slug; })[0];
      var heading = (subject && subject.subject) || titleHint || "Topics";
      document.title = heading + " — CODEX STUDYS";
      return contentGet("v2/batches/" + b.slug + "/subject/" + slug + "/topics").then(function (topics) {
        topics = topics || [];
        app.innerHTML =
          '<a class="mx-crumb" href="' + esc(back) + '">← Back to batch</a>' +
          '<h1 class="mx-h1">' + esc(heading) + '</h1><p class="mx-sub">' + esc(b.name) + "</p>" +
          (topics.length
            ? '<div class="mx-list">' + topics.map(function (t) {
                var sub = [
                  t.videos ? t.videos + " videos" : "",
                  t.notes ? t.notes + " notes" : "",
                  t.exercises ? t.exercises + " DPP" : ""
                ].filter(Boolean).join(" · ") || "Open topic";
                return '<a class="mx-row" href="' + esc(href({ id: id, s: slug, st: heading, t: t._id, tt: t.name })) + '">' +
                  '<span class="mx-ico">🗂</span>' +
                  '<span class="mx-rtext"><span class="mx-rtitle">' + esc(t.name) + '</span><span class="mx-rsub">' + esc(sub) + "</span></span>" +
                  '<span class="mx-chev">›</span></a>';
              }).join("") + "</div>"
            : '<div class="mx-empty">No topics published for this subject yet.</div>');
      });
    }).catch(function (e) {
      app.innerHTML = '<a class="mx-crumb" href="' + esc(back) + '">← Back to batch</a>' +
        errorBox(e.message || "Couldn't load topics.");
      bindRetry(app, function () { viewSubject(id, slug, titleHint); });
    });
  }

  var TABS = [
    { key: "videos", label: "Lectures" },
    { key: "notes", label: "Notes" },
    { key: "DppNotes", label: "DPP PDF" },
    { key: "DppVideos", label: "DPP Videos" },
    { key: "DppTests", label: "DPP Tests" }
  ];

  function viewTopic(id, slug, topicId, topicTitle, subjectTitle) {
    var back = href({ id: id, s: slug, st: subjectTitle });
    var state = { tab: "videos", page: 1, items: [], done: false, details: null };

    app.innerHTML = '<a class="mx-crumb" href="' + esc(back) + '">← Back to topics</a>' + skeleton(6);

    getDetails(id).then(function (b) {
      state.details = b;
      state.subjectId = ((b.subjects || []).filter(function (s) { return s.slug === slug; })[0] || {})._id || "";
      document.title = (topicTitle || "Topic") + " — CODEX STUDYS";
      app.innerHTML =
        '<a class="mx-crumb" href="' + esc(back) + '">← Back to topics</a>' +
        '<h1 class="mx-h1">' + esc(topicTitle || "Topic") + '</h1><p class="mx-sub">' + esc(subjectTitle || b.name || "") + "</p>" +
        '<div class="mx-tabs" role="tablist">' + TABS.map(function (t) {
          return '<button class="mx-tab' + (t.key === state.tab ? " active" : "") + '" type="button" role="tab" data-tab="' + t.key + '">' + esc(t.label) + "</button>";
        }).join("") + '</div><div id="tabBody"></div>';
      app.querySelectorAll("[data-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.tab = btn.dataset.tab;
          app.querySelectorAll("[data-tab]").forEach(function (x) { x.classList.toggle("active", x === btn); });
          loadTab(true);
        });
      });
      loadTab(true);
    }).catch(function (e) {
      app.innerHTML = '<a class="mx-crumb" href="' + esc(back) + '">← Back to topics</a>' +
        errorBox(e.message || "Couldn't load this topic.");
      bindRetry(app, function () { viewTopic(id, slug, topicId, topicTitle, subjectTitle); });
    });

    function fetchPage(tab, page) {
      if (tab === "DppTests") {
        return contentGet("v3/test-service/tests/dpp", {
          batchId: id, batchSubjectId: state.subjectId, chapterId: topicId, isSubjective: "false", page: page
        });
      }
      return contentGet("v2/batches/" + state.details.slug + "/subject/" + slug + "/contents", {
        page: page, contentType: tab, tag: topicId
      });
    }

    var token = 0;
    function loadTab(reset) {
      var body = document.getElementById("tabBody");
      var mine = ++token;
      if (reset) { state.page = 1; state.items = []; state.done = false; body.innerHTML = skeleton(6); }
      var tab = state.tab;
      fetchPage(tab, state.page).then(function (list) {
        if (mine !== token) return;
        list = list || [];
        var seen = {};
        state.items.forEach(function (x) { seen[keyOf(x)] = 1; });
        var fresh = list.filter(function (x) { return !seen[keyOf(x)]; });
        if (!fresh.length) state.done = true;
        state.items = state.items.concat(fresh);
        render(body, tab);
      }).catch(function (e) {
        if (mine !== token) return;
        if (state.items.length) { state.done = true; render(body, tab); return; }
        body.innerHTML = errorBox(e.message || "Couldn't load this topic.");
        bindRetry(body, function () { loadTab(true); });
      });
    }
    function keyOf(x) { return x._id || (x.test && x.test._id) || x.contentId || JSON.stringify(x).slice(0, 80); }

    function render(body, tab) {
      if (!state.items.length) { body.innerHTML = '<div class="mx-empty">Nothing published in this section yet.</div>'; return; }
      var html = '<div class="mx-list">' + state.items.map(function (item, i) {
        if (tab === "DppTests") return testRow(item);
        if (tab === "videos" || tab === "DppVideos") return videoRow(item);
        return noteRow(item, i);
      }).join("") + "</div>" +
        (state.done ? "" : '<button class="btn btn-quiet mx-more" type="button" id="moreBtn">Load more</button>');
      body.innerHTML = html;
      var more = document.getElementById("moreBtn");
      if (more) more.addEventListener("click", function () { more.textContent = "Loading…"; state.page++; loadTab(false); });
      if (tab === "notes" || tab === "DppNotes") hydrateNotes(body);
    }

    function videoRow(item) {
      var title = item.topic || (item.videoDetails && item.videoDetails.name) || "Lecture";
      var link = href({ v: "watch", batchId: id, subjectId: state.subjectId, scheduleId: item._id, title: title });
      var thumb = item.videoDetails && item.videoDetails.image;
      var sub = [item.videoDetails && item.videoDetails.duration, fmtDate(item.date)].filter(Boolean).join(" · ");
      return '<a class="mx-row" href="' + esc(link) + '">' +
        '<span class="mx-vthumb">' + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + "<i>▶</i></span>" +
        '<span class="mx-rtext"><span class="mx-rtitle wrap">' + esc(title) + "</span>" +
        (sub ? '<span class="mx-rsub">' + esc(sub) + "</span>" : "") + "</span></a>";
    }

    function testRow(t) {
      var x = t.test || {};
      var sub = [
        x.totalQuestions ? x.totalQuestions + " questions" : "",
        x.totalMarks ? x.totalMarks + " marks" : "",
        x.maxDuration ? x.maxDuration + " min" : ""
      ].filter(Boolean).join(" · ");
      return '<div class="mx-row"><span class="mx-ico">📝</span><span class="mx-rtext">' +
        '<span class="mx-rtitle wrap">' + esc(x.name || "DPP Test") + "</span>" +
        (sub ? '<span class="mx-rsub">' + esc(sub) + "</span>" : "") + "</span></div>";
    }

    // Listing responses ship attachments with an empty key; schedule-details has the real file key.
    function noteRow(item, i) {
      return '<div class="mx-note" data-note="' + i + '"><div class="mx-rtitle wrap">' + esc(item.topic || "Notes") +
        '</div><div class="mx-links"><span class="mx-rsub">Loading attachment…</span></div></div>';
    }
    function attachmentUrl(a) {
      if (!a || !a.baseUrl || !a.key) return null;
      var base = /\/$/.test(a.baseUrl) ? a.baseUrl : a.baseUrl + "/";
      return base + String(a.key).replace(/^\/+/, "");
    }
    function hydrateNotes(body) {
      body.querySelectorAll("[data-note]").forEach(function (el) {
        var item = state.items[Number(el.dataset.note)];
        if (!item) return;
        contentGet("v1/batches/" + state.details.slug + "/subject/" + slug + "/schedule/" + item._id + "/schedule-details")
          .then(function (d) { return d || {}; })
          .catch(function () { return {}; })
          .then(function (d) {
            var groups = (d.homeworkIds || item.homeworkIds || []).concat(d.exerciseIds || item.exerciseIds || []);
            var links = [];
            groups.forEach(function (hw) {
              (hw.attachmentIds || []).forEach(function (a) {
                var u = attachmentUrl(a);
                if (u) links.push({ name: a.name || hw.topic || "Open PDF", url: u });
              });
            });
            var box = el.querySelector(".mx-links");
            box.innerHTML = links.length
              ? links.map(function (l) {
                  return '<a class="mx-pill" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">📄 ' + esc(l.name) + "</a>";
                }).join("")
              : '<span class="mx-rsub">No attachment available.</span>';
          });
      });
    }
  }

  function viewWatch() {
    var batchId = params.get("batchId") || "";
    var subjectId = params.get("subjectId") || "";
    var scheduleId = params.get("scheduleId") || "";
    var title = params.get("title") || "Lecture";
    document.title = title + " — CODEX STUDYS";
    document.body.classList.add("mx-watching");

    var fallback = batchId ? href({ id: batchId }) : "index.html";
    app.innerHTML =
      '<div class="mx-watch"><div class="mx-watch-bar"><button type="button" id="backBtn">← Back</button>' +
      '<span class="mx-watch-title">' + esc(title) + '</span></div>' +
      '<div class="mx-watch-stage" id="stage">Loading stream…</div></div>';
    document.getElementById("backBtn").addEventListener("click", function () {
      if (history.length > 1) history.back(); else location.href = fallback;
    });

    function load() {
      var stage = document.getElementById("stage");
      stage.textContent = "Loading stream…";
      if (!batchId || !subjectId || !scheduleId) { stage.textContent = "Stream isn't available for this lecture."; return; }
      fetch(STREAM_API + qs({ batchId: batchId, subjectId: subjectId, scheduleId: scheduleId }), { headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          var hls = j && (j.HLS_STREAM_URL || j.hls_url);
          if (!hls) throw new Error("Stream isn't available for this lecture yet.");
          stage.innerHTML = '<iframe src="' + esc(PLAYER_ORIGIN + "/?url=" + enc(hls)) + '" title="' + esc(title) +
            '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        })
        .catch(function (e) {
          stage.innerHTML = '<div><p>' + esc(e.message || "Couldn't load this lecture.") +
            '</p><button class="btn btn-primary" type="button" id="retryStream">Retry</button></div>';
          document.getElementById("retryStream").addEventListener("click", load);
        });
    }
    load();
  }

  /* ----------------------------------------------------------------- router */
  var id = params.get("id") || "";
  if (params.get("v") === "watch") viewWatch();
  else if (!id) location.replace("index.html#courses");
  else if (params.get("t")) viewTopic(id, params.get("s") || "", params.get("t"), params.get("tt") || "", params.get("st") || "");
  else if (params.get("s")) viewSubject(id, params.get("s"), params.get("st") || "");
  else viewBatch(id);
})();
