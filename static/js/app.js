(function () {
  'use strict';
  var positions = {};

  function loadConfig() {
    return fetch('config.json', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Marker configuration could not be loaded.');
      return response.json();
    }).then(function (config) {
      var markers = config.markers || {};
      Object.keys(markers).forEach(function (id) {
        var point = markers[id];
        if (point && typeof point.x === 'number' && typeof point.y === 'number' &&
            point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100) {
          positions[id] = point;
        }
      });
    }).catch(function (error) { toast(error.message, true); });
  }
  var state = { selected: null, limit: null, busy: false, cooldownUntil: 0, statusSnapshot: null };
  var list = document.getElementById('charger-list');
  var markers = document.getElementById('markers');
  var refresh = document.getElementById('refresh');
  var updated = document.getElementById('updated');
  var infoPopup = document.createElement('div');
  var activeInfo = null;
  var pinnedInfo = false;
  infoPopup.id = 'charger-info-popup';
  infoPopup.className = 'charger-tooltip';
  infoPopup.setAttribute('role', 'tooltip');
  infoPopup.hidden = true;
  document.body.appendChild(infoPopup);

  function hideInfo() {
    if (activeInfo) {
      activeInfo.setAttribute('aria-expanded', 'false');
      activeInfo.removeAttribute('aria-describedby');
    }
    activeInfo = null;
    pinnedInfo = false;
    infoPopup.hidden = true;
  }

  function showInfo(button, charger, id) {
    hideInfo();
    var evse = charger.evses && charger.evses[0];
    var stamp = evse && evse.retrievedAt && new Date(evse.retrievedAt);
    infoPopup.replaceChildren();
    [
      (charger.description || '—') + ' · ' + id,
      'Updated: ' + (stamp && !isNaN(stamp.getTime()) ? stamp.toLocaleString() : 'Unavailable')
    ].forEach(function (line) {
      var item = document.createElement('div');
      item.textContent = line;
      infoPopup.appendChild(item);
    });
    if (charger.error) {
      var error = document.createElement('div');
      error.textContent = 'Refresh error: ' + charger.error;
      infoPopup.appendChild(error);
    }
    infoPopup.hidden = false;
    activeInfo = button;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', infoPopup.id);
    var rect = button.getBoundingClientRect();
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - infoPopup.offsetWidth - 12));
    var top = rect.bottom + 8;
    if (top + infoPopup.offsetHeight > window.innerHeight - 12) top = rect.top - infoPopup.offsetHeight - 8;
    infoPopup.style.left = left + 'px';
    infoPopup.style.top = Math.max(12, top) + 'px';
  }

  document.addEventListener('click', function (event) {
    if (activeInfo && event.target !== activeInfo) hideInfo();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') hideInfo();
  });
  list.addEventListener('scroll', hideInfo);
  window.addEventListener('resize', hideInfo);

  function formatSince(value) {
    var since = value && new Date(value);
    if (!since || isNaN(since.getTime())) return '';
    var minutes = Math.max(0, Math.floor((Date.now() - since.getTime()) / 60000));
    if (minutes >= 9 * 24 * 60) return 'Since 9+ days';
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor(minutes % 1440 / 60);
    return 'Since ' + (days ? days + 'd ' : '') + (hours ? hours + 'h ' : '') + minutes % 60 + 'm';
  }

  function request(action, method) {
    return fetch('?action=' + action, { method: method || 'GET', cache: 'no-store' }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var detail = data.detail || {};
          var error = new Error(detail.message || 'Request failed.');
          error.code = detail.code || String(response.status);
          error.limit = detail.liveRefresh;
          error.retryAfter = detail.retryAfterSeconds;
          throw error;
        }
        return data;
      });
    });
  }

  function statusOf(charger) {
    var values = (charger.evses || []).map(function (evse) { return evse.status || ''; });
    if (!values.length) return 'unknown';
    if (values.some(function (value) { return /FAULT|ERROR/i.test(value); })) return 'fault';
    if (values.some(function (value) { return /CHARG|OCCUP|IN_USE|RESERV/i.test(value); })) return 'occupied';
    if (values.every(function (value) { return value === 'AVAILABLE'; })) return 'available';
    return 'unknown';
  }

  function toast(message, isError, persistent) {
    var node = document.createElement('div');
    node.className = 'toast' + (isError ? ' error' : '') + (persistent ? ' persistent' : '');
    node.setAttribute('role', isError ? 'alert' : 'status');
    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = isError ? '!' : persistent ? '↗' : '✓';
    node.appendChild(icon);
    var label = document.createElement('span');
    label.textContent = message;
    node.appendChild(label);
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close notification');
    close.textContent = '×';
    close.onclick = function () { node.remove(); };
    node.appendChild(close);
    document.getElementById('toasts').appendChild(node);
    if (!persistent) setTimeout(function () { node.remove(); }, 10000);
  }

  function select(id) {
    state.selected = id;
    Array.prototype.forEach.call(document.querySelectorAll('[data-charger]'), function (node) {
      node.classList.toggle('selected', node.getAttribute('data-charger') === id);
    });
    var card = Array.prototype.filter.call(list.querySelectorAll('[data-charger]'), function (node) {
      return node.getAttribute('data-charger') === id;
    })[0];
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function render(data, fromCache) {
    var chargers = Array.isArray(data.chargers) ? data.chargers : [];
    var latestUpdate = 0;
    chargers.forEach(function (charger) {
      (charger.evses || []).forEach(function (evse) {
        var time = Date.parse(evse.retrievedAt);
        if (!isNaN(time)) latestUpdate = Math.max(latestUpdate, time);
      });
    });
    if (!fromCache) {
      var nextStatuses = {};
      chargers.forEach(function (charger, index) {
        var id = String(charger.qr_code || index);
        var status = statusOf(charger);
        nextStatuses[id] = status;
        if (state.statusSnapshot && state.statusSnapshot[id] && state.statusSnapshot[id] !== status) {
          toast((charger.name || id) + ': ' + state.statusSnapshot[id] + ' → ' + status, false, true);
        }
      });
      state.statusSnapshot = nextStatuses;
    }
    try { sessionStorage.setItem('chargerSnapshot', JSON.stringify(data)); } catch (ignore) {}
    hideInfo();
    list.replaceChildren();
    markers.replaceChildren();
    var statusOrder = { available: 0, occupied: 1, fault: 2, unknown: 3 };
    var displayChargers = chargers.map(function (charger, index) {
      return { charger: charger, index: index, status: statusOf(charger) };
    }).sort(function (a, b) {
      return statusOrder[a.status] - statusOrder[b.status] || a.index - b.index;
    });
    document.getElementById('count-available').textContent = String(displayChargers.filter(function (item) { return item.status === 'available'; }).length);
    document.getElementById('count-total').textContent = String(chargers.length);
    displayChargers.forEach(function (item) {
      var charger = item.charger;
      var id = String(charger.qr_code || item.index);
      var status = item.status;
      var card = document.createElement('div');
      card.className = 'charger'; card.setAttribute('data-charger', id);
      var dot = document.createElement('i'); dot.className = 'dot ' + status; dot.setAttribute('aria-hidden', 'true');
      var main = document.createElement('div'); main.className = 'charger-main';
      var title = document.createElement('div'); title.className = 'charger-title';
      var name = document.createElement('button');
      name.type = 'button'; name.className = 'charger-name';
      name.textContent = charger.name || 'Charge point';
      var info = document.createElement('button');
      info.type = 'button'; info.className = 'charger-info'; info.textContent = 'i';
      info.setAttribute('aria-label', 'Details for ' + name.textContent);
      info.setAttribute('aria-expanded', 'false');
      info.setAttribute('aria-controls', infoPopup.id);
      info.onmouseenter = function () { if (!pinnedInfo) showInfo(info, charger, id); };
      info.onmouseleave = function () { if (!pinnedInfo) hideInfo(); };
      info.onfocus = function () { if (!pinnedInfo) showInfo(info, charger, id); };
      info.onblur = function () { if (!pinnedInfo) hideInfo(); };
      info.onclick = function (event) {
        event.stopPropagation();
        if (pinnedInfo && activeInfo === info) hideInfo();
        else { showInfo(info, charger, id); pinnedInfo = true; }
      };
      title.appendChild(name); title.appendChild(info); main.appendChild(title);
      var since = charger.evses && charger.evses[0] && charger.evses[0].since;
      var sinceText = status !== 'unknown' && formatSince(since);
      if (sinceText) {
        var sinceLine = document.createElement('small');
        sinceLine.textContent = sinceText;
        main.appendChild(sinceLine);
      }
      var label = document.createElement('span'); label.className = 'status ' + status;
      label.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      card.appendChild(dot); card.appendChild(main); card.appendChild(label);
      card.onclick = function () { select(id); };
      list.appendChild(card);
      if (positions[id]) {
        var marker = document.createElement('button');
        marker.type = 'button'; marker.className = 'marker ' + status;
        marker.setAttribute('data-charger', id);
        marker.setAttribute('aria-label', (charger.name || id) + ': ' + status);
        marker.style.left = positions[id].x + '%';
        marker.style.top = positions[id].y + '%';
        marker.onclick = function () { select(id); };
        markers.appendChild(marker);
      }
    });
    if (state.selected) select(state.selected);
    updated.textContent = 'Updated ' + new Date(latestUpdate || Date.now()).toLocaleString();
  }

  function applyLimit(limit) {
    state.limit = limit;
    if (limit && Number(limit.cooldownSecondsRemaining) > 0) {
      state.cooldownUntil = Date.now() + Number(limit.cooldownSecondsRemaining) * 1000;
    }
    updateButton();
  }

  function updateButton() {
    var seconds = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
    var remaining = state.limit && typeof state.limit.remainingToday === 'number' ? state.limit.remainingToday : 1;
    refresh.disabled = state.busy || seconds > 0 || remaining <= 0;
    refresh.innerHTML = '<span class="' + (state.busy ? 'spinning' : '') + '" aria-hidden="true">↻</span> ' +
      (state.busy ? 'Refreshing…' : remaining <= 0 ? 'Daily limit reached' : seconds > 0 ? 'Wait ' + seconds + 's' : 'Live refresh');
  }

  function loadLimit() {
    return request('limit').then(function (data) {
      applyLimit(data);
      setTimeout(loadLimit, 60000);
    }, function () {
      updateButton();
      setTimeout(loadLimit, 10000);
    });
  }

  function loadChargers() {
    return request('chargers').then(function (data) {
      render(data);
      setTimeout(loadChargers, 60000);
    }, function () {
      if (!state.statusSnapshot) {
        list.textContent = 'Could not load chargers. Retrying…';
        updated.textContent = 'Waiting for charger data…';
      }
      setTimeout(loadChargers, 10000);
    });
  }

  refresh.onclick = function () {
    if (state.busy || refresh.disabled) return;
    state.busy = true; updateButton();
    request('refresh', 'POST').then(function (data) {
      render(data);
      applyLimit(data.liveRefresh);
      state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + 60000);
      toast('Charger statuses refreshed.', false);
    }, function (error) {
      if (error.limit) applyLimit(error.limit);
      if (error.retryAfter) state.cooldownUntil = Date.now() + Number(error.retryAfter) * 1000;
      toast(error.code + ': ' + error.message, true);
    }).then(function () { state.busy = false; updateButton(); });
  };

  var theme = document.getElementById('theme-toggle');
  var themeColor = document.querySelector('meta[name="theme-color"]');
  var statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  function applyTheme(value) {
    document.documentElement.setAttribute('data-theme', value);
    if (themeColor) themeColor.content = value === 'dark' ? '#101914' : '#f5f7f5';
    if (statusBar) statusBar.content = value === 'dark' ? 'black' : 'default';
  }
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') applyTheme(saved);
  } catch (ignore) {}
  theme.onclick = function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (ignore) {}
  };
  loadConfig().then(function () {
    try {
      var cached = sessionStorage.getItem('chargerSnapshot');
      if (cached) {
        var snapshot = JSON.parse(cached);
        if (!snapshot.demo) render(snapshot, true);
      }
    } catch (ignore) {}
    loadChargers();
  });
  loadLimit();
  setInterval(updateButton, 1000);
  if (new URLSearchParams(window.location.search).get("coordinates") === "1") {
    var map = document.querySelector(".map");
    var image = map.querySelector("img");
    document.body.classList.add("coordinate-mode");
    toast("Coordinate helper active. Click the map and check the browser console.", false);
    map.addEventListener("click", function (event) {
      var rect = image.getBoundingClientRect();
      var x = Math.round((event.clientX - rect.left) / rect.width * 1000) / 10;
      var y = Math.round((event.clientY - rect.top) / rect.height * 1000) / 10;
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        console.log("Map position: {\"x\": " + x + ", \"y\": " + y + "}");
      }
    });
  }
}());
