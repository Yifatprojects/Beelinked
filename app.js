/* ═══════════════════════════════════════════════════════════════════
   BeeLinked — app.js
   Hive yard field management · Supabase + Leaflet (Esri Satellite)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Credentials ─────────────────────────────────────────────────── */
  const SUPABASE_URL      = 'https://sjxxatsmpyvzfahqsgeq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqeHhhdHNtcHl2emZhaHFzZ2VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDU5NjIsImV4cCI6MjA5MDEyMTk2Mn0.q7vysnvKk7SZ8XNnlUdC99syqiHiiqPIoE89a8Y5leA';

  /* ── Supabase client ─────────────────────────────────────────────── */
  const { createClient } = window.supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ══════════════════════════════════════════════════════════════════
     MAP  — Esri World Imagery (satellite)
     Centre: [32.794, 35.033]  Zoom: 13
     ══════════════════════════════════════════════════════════════════ */
  const map = L.map('map', {
    center: [32.794, 35.033],
    zoom:   13,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, ' +
        'CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
      maxZoom: 19,
    }
  ).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);

  /** yard.id → L.Marker */
  const yardMarkers = new Map();

  /* ── Current-location layer ───────────────────────────────────────── */
  let _locMarker   = null;
  let _locCircle   = null;
  let _locWatchId  = null;

  const locIcon = L.divIcon({
    className: '',
    iconSize:  [22, 22],
    iconAnchor:[11, 11],
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:#3b82f6;border:3px solid #fff;
      box-shadow:0 0 0 3px rgba(59,130,246,0.35),0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
  });

  function updateMyLocation(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    if (_locMarker) {
      _locMarker.setLatLng([lat, lng]);
      _locCircle.setLatLng([lat, lng]).setRadius(accuracy);
    } else {
      _locCircle = L.circle([lat, lng], {
        radius: accuracy, color: '#3b82f6', fillColor: '#3b82f6',
        fillOpacity: 0.10, weight: 1, opacity: 0.4,
      }).addTo(map);
      _locMarker = L.marker([lat, lng], { icon: locIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip('You are here', {
          permanent: false, direction: 'top', offset: [0, -14],
          className: 'bl-tooltip',
        });
    }
  }

  let _locateBtn = null; // reference to the locate control button

  function onLocateError(err) {
    const denied = err && (err.code === 1 || err.code === err.PERMISSION_DENIED);
    if (_locateBtn) {
      _locateBtn.title = denied
        ? 'Location blocked — click to see how to enable it'
        : 'Unable to get location';
      _locateBtn.style.color  = '#f59e0b';
      _locateBtn.style.border = '2px solid #92400e';
      _locateBtn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9"/>
      </svg>`;
    }
    if (denied) {
      console.warn('[BeeLinked] Location permission denied. To enable: click the 🔒 / tune icon next to the URL → Site settings → Location → Allow.');
    }
  }

  function startLocationTracking() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(updateMyLocation, onLocateError, { enableHighAccuracy: true });
    _locWatchId = navigator.geolocation.watchPosition(updateMyLocation, onLocateError, {
      enableHighAccuracy: true, maximumAge: 10000, timeout: 20000,
    });
  }

  // Locate-me control button (top-left, below zoom)
  const LocateControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const btn = L.DomUtil.create('button', '');
      btn.title = 'Show my location';
      btn.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:36px;height:36px;border-radius:8px;cursor:pointer;
        background:#1e293b;border:2px solid #334155;color:#3b82f6;
        box-shadow:0 2px 8px rgba(0,0,0,0.5);transition:background 0.2s;
        margin-top:4px;
      `;
      btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round"
        d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8" stroke-opacity=".35"/>
      </svg>`;
      btn.onmouseover = () => { btn.style.background = '#1e3a5f'; };
      btn.onmouseout  = () => { btn.style.background = '#1e293b'; };
      _locateBtn = btn;

      L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation);
      L.DomEvent.on(btn, 'click', () => {
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser.');
          return;
        }
        // Check if permission is already denied
        if (navigator.permissions) {
          navigator.permissions.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'denied') {
              alert(
                'Location access is blocked.\n\n' +
                'To enable it in Chrome:\n' +
                '1. Click the 🔒 lock icon (or tune icon) next to the URL bar\n' +
                '2. Go to "Site settings"\n' +
                '3. Set "Location" to "Allow"\n' +
                '4. Reload the page'
              );
              return;
            }
            navigator.geolocation.getCurrentPosition(pos => {
              updateMyLocation(pos);
              map.setView([pos.coords.latitude, pos.coords.longitude], 15);
              // Reset button to normal on success
              btn.style.color  = '#3b82f6';
              btn.style.border = '2px solid #334155';
              btn.title = 'Show my location';
              btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8" stroke-opacity=".35"/></svg>`;
            }, onLocateError, { enableHighAccuracy: true });
          });
        } else {
          navigator.geolocation.getCurrentPosition(pos => {
            updateMyLocation(pos);
            map.setView([pos.coords.latitude, pos.coords.longitude], 15);
          }, onLocateError, { enableHighAccuracy: true });
        }
      });
      return btn;
    },
  });
  new LocateControl().addTo(map);

  // Start passive tracking immediately
  startLocationTracking();

  /* ── Weather widget (Open-Meteo, no API key required) ────────────── */
  const WMO_CODES = {
    0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
    45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',
    71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',
    80:'Light showers',81:'Showers',82:'Heavy showers',
    85:'Snow showers',86:'Heavy snow showers',
    95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail',
  };
  const WMO_ICONS = {
    0:'☀️',1:'🌤️',2:'⛅',3:'☁️',
    45:'🌫️',48:'🌫️',
    51:'🌦️',53:'🌦️',55:'🌧️',
    61:'🌧️',63:'🌧️',65:'🌧️',
    71:'🌨️',73:'❄️',75:'❄️',77:'🌨️',
    80:'🌦️',81:'🌧️',82:'⛈️',
    85:'🌨️',86:'❄️',
    95:'⛈️',96:'⛈️',99:'⛈️',
  };

  async function reverseGeocode(lat, lng) {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const addr = data.address ?? {};
      // Pick the most specific available label
      return addr.village ?? addr.town ?? addr.city ?? addr.county ?? addr.state ?? '';
    } catch {
      return '';
    }
  }

  async function fetchWeather(lat, lng) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,weathercode,windspeed_10m` +
        `&wind_speed_unit=kmh&timezone=auto`;

      const [weatherRes, cityName] = await Promise.all([
        fetch(url).then(r => r.json()),
        reverseGeocode(lat, lng),
      ]);

      const cur  = weatherRes.current;
      const code = cur.weathercode ?? 0;

      const temp = Math.round(cur.temperature_2m);
      const icon = WMO_ICONS[code] ?? '🌡️';

      // Pill (compact)
      document.getElementById('weatherIconSmall').textContent = icon;
      document.getElementById('weatherTempSmall').textContent = `${temp}°`;

      // Expanded card
      document.getElementById('weatherTemp').textContent   = temp;
      document.getElementById('weatherDesc').textContent   = WMO_CODES[code] ?? 'Unknown';
      document.getElementById('weatherIcon').textContent   = icon;
      document.getElementById('weatherWind').innerHTML     =
        `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 3.757A4 4 0 0121 7.5c0 2.21-1.79 4-4 4H3"/><path stroke-linecap="round" stroke-linejoin="round" d="M14.657 18.757A4 4 0 0118 22.5c2.21 0 4-1.79 4-4s-1.79-4-4-4H3"/></svg>
        ${Math.round(cur.windspeed_10m)} km/h`;
      document.getElementById('weatherHumidity').innerHTML =
        `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2C6.477 2 3 7.477 3 12a9 9 0 0018 0c0-4.523-3.477-10-9-10z"/></svg>
        ${cur.relative_humidity_2m}%`;
      document.getElementById('weatherLocation').textContent = cityName;
    } catch {
      document.getElementById('weatherDesc').textContent = 'Unavailable';
      document.getElementById('weatherIcon').textContent = '❓';
      document.getElementById('weatherIconSmall').textContent = '❓';
      document.getElementById('weatherTempSmall').textContent = '--°';
    }
  }

  // Hover / click to expand weather card
  (() => {
    const widget = document.getElementById('weatherWidget');
    const pill   = document.getElementById('weatherPill');
    const card   = document.getElementById('weatherCard');
    if (!widget || !pill || !card) return;

    let hoverTimer;

    const openCard  = () => { clearTimeout(hoverTimer); card.classList.remove('hidden'); };
    const closeCard = () => { hoverTimer = setTimeout(() => card.classList.add('hidden'), 150); };

    // Hover (desktop)
    pill.addEventListener('mouseenter', openCard);
    pill.addEventListener('mouseleave', closeCard);
    card.addEventListener('mouseenter', openCard);
    card.addEventListener('mouseleave', closeCard);

    // Click / tap (mobile)
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('hidden');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target)) card.classList.add('hidden');
    });
  })();

  // Returns centroid of all yard markers, or the map default center
  function yardsCenter() {
    const pts = [...yardMarkers.values()]
      .map(m => m.getLatLng())
      .filter(ll => ll);
    if (!pts.length) return { lat: 32.794, lng: 35.033 };
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return { lat, lng };
  }

  function fetchWeatherForYards() {
    const { lat, lng } = yardsCenter();
    fetchWeather(lat, lng);
  }

  // Initial fetch using default center; will be refreshed after yards load
  fetchWeather(32.794, 35.033);

  // Refresh every 15 minutes using yards centroid
  setInterval(fetchWeatherForYards, 15 * 60 * 1000);

  /* ── Today's Actions widget ──────────────────────────────────────── */
  function buildTodayWidget(yards) {
    const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // Collect all actions due today across all yards
    const items = [];
    (yards ?? []).forEach(yard => {
      (yard.actions ?? []).forEach(a => {
        if (!a.action_date) return;
        if (a.action_date.slice(0, 10) === todayStr) {
          items.push({ yard, action: a });
        }
      });
    });

    // Update count badge
    const countEl = document.getElementById('todayCount');
    if (countEl) {
      countEl.textContent = items.length;
      countEl.className = items.length
        ? 'text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30'
        : 'text-xs font-bold px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-500 border border-slate-700';
    }

    // Populate list
    const list  = document.getElementById('todayList');
    const empty = document.getElementById('todayEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    if (items.length === 0) {
      list.classList.add('hidden');
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.classList.remove('hidden');
      items.forEach(({ yard, action }) => {
        const status = getActionStatus(action);
        const style  = ACTION_STATUS_STYLE[status];

        const li = document.createElement('li');
        li.className = 'flex items-start gap-2 px-4 py-2.5 hover:bg-slate-800/40 transition';

        // Dot
        const dot = document.createElement('span');
        dot.className = 'shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 mt-2';

        // Main info (clicking opens yard modal)
        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1 cursor-pointer';
        info.innerHTML = `
          <p class="font-semibold text-slate-100 truncate">${yard.name ?? 'Yard'}</p>
          ${yard.apiaries?.name ? `<p class="text-slate-500 truncate text-[11px]">${yard.apiaries.name}</p>` : ''}
        `;
        info.addEventListener('click', () => {
          document.getElementById('todayBody').classList.add('hidden');
          document.getElementById('todayChevron').style.transform = '';
          document.getElementById('todayWidgetToggle').setAttribute('aria-expanded', 'false');
          const marker = yardMarkers.get(yard.id);
          if (marker) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
          handleMarkerClick(yard);
        });

        // Action type — clicking opens inline date reschedule
        const actionRow = document.createElement('div');
        actionRow.className = 'flex items-center gap-1 mt-0.5';

        const actionLabel = document.createElement('span');
        actionLabel.className = 'text-slate-400 text-xs truncate cursor-pointer hover:text-amber-300 underline underline-offset-2 decoration-dotted transition';
        actionLabel.title = 'Click to reschedule';
        actionLabel.textContent = action.action_type ?? action.title ?? 'Action';

        // Hidden date input
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = action.action_date?.slice(0, 10) ?? '';
        dateInput.className = 'hidden text-xs bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-slate-100 focus:outline-none focus:border-amber-400';

        actionLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          actionLabel.classList.add('hidden');
          dateInput.classList.remove('hidden');
          dateInput.focus();
          dateInput.showPicker?.();
        });

        dateInput.addEventListener('change', async () => {
          const newDate = dateInput.value;
          if (!newDate) return;
          dateInput.disabled = true;

          const { error } = await db.from('actions').update({ action_date: newDate }).eq('id', action.id);

          if (error) {
            setStatus('Reschedule failed: ' + error.message, true);
            dateInput.disabled = false;
            return;
          }

          // Update cached yard data
          action.action_date = newDate;
          const m = yardMarkers.get(yard.id);
          if (m) {
            const acts = (m._yard.actions ?? []).map(x =>
              x.id === action.id ? { ...x, action_date: newDate } : x
            );
            m._yard = { ...m._yard, actions: acts };
            upsertMarker(m._yard);
          }

          setStatus('Action rescheduled');
          // Rebuild widget — action may no longer be "today"
          buildTodayWidget([...yardMarkers.values()].map(m => m._yard));
        });

        dateInput.addEventListener('blur', () => {
          dateInput.classList.add('hidden');
          actionLabel.classList.remove('hidden');
        });

        actionRow.append(actionLabel, dateInput);
        info.appendChild(actionRow);

        // Status badge
        const badge = document.createElement('span');
        badge.className = `shrink-0 self-center text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${style.cls}`;
        badge.textContent = style.label;

        li.append(dot, info, badge);
        list.appendChild(li);
      });
    }
  }

  // Toggle expand/collapse
  document.getElementById('todayWidgetToggle')?.addEventListener('click', () => {
    const body    = document.getElementById('todayBody');
    const chevron = document.getElementById('todayChevron');
    const toggle  = document.getElementById('todayWidgetToggle');
    const open    = body.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', open);
    chevron.style.transform = open ? 'rotate(180deg)' : '';
  });

  /* ══════════════════════════════════════════════════════════════════
     MARKER COLOUR LOGIC
     ─────────────────────────────────────────────────────────────────
     Priority (highest → lowest):

       1. RED          yard.status === 'attention'
       2. SOLID GREEN  any action with action_date > now()
       3. YELLOW +     any action with action_date ≤ now()
          GREEN BADGE    AND action_date > last_seen_at  (new update not yet seen)
       4. SOLID YELLOW default — no qualifying actions
     ══════════════════════════════════════════════════════════════════ */

  /**
   * @param {Object} yard  Row from `yards` joined with `actions[]`
   * @returns {'attention'|'future'|'unseen'|'default'}
   */
  /* Returns 'planned' | 'waiting' | 'done' for a single action */
  function getActionStatus(action) {
    if (action.is_done) return 'done';
    const now = new Date();
    const dt  = action.action_date ? new Date(action.action_date) : null;
    if (!dt || dt > now) return 'planned';
    return 'waiting';
  }

  function resolveMarkerKind(yard) {
    if (yard.status === 'attention') return 'attention';

    const now     = new Date();
    const actions = (Array.isArray(yard.actions) ? yard.actions : [])
      .filter(a => !a.is_done); // ignore completed actions
    const seen    = yard.last_seen_at ? new Date(yard.last_seen_at) : null;

    // Rule 2 — upcoming planned action
    const hasFuture = actions.some((a) => a.action_date && new Date(a.action_date) > now);
    if (hasFuture) return 'future';

    // Rule 3 — waiting (past, unseen) action
    const hasUnseen = actions.some((a) => {
      if (!a.action_date) return false;
      const ad = new Date(a.action_date);
      if (ad > now) return false;
      if (seen && ad <= seen) return false;
      return true;
    });
    if (hasUnseen) return 'unseen';

    return 'default';
  }

  /* ══════════════════════════════════════════════════════════════════
     BEEHIVE SVG ICON
     5 stacked ellipse bands (narrowing top→ bottom widens), count badge
     ══════════════════════════════════════════════════════════════════ */

  /** Colours for each marker kind */
  const KIND_COLORS = {
    //              body fill   band outline  badge border
    attention: { fill: '#ef4444', band: '#b91c1c', badge: '#991b1b' },
    future:    { fill: '#22c55e', band: '#15803d', badge: '#14532d' },
    unseen:    { fill: '#eab308', band: '#a16207', badge: '#22c55e' }, // green badge = new unseen update
    default:   { fill: '#eab308', band: '#a16207', badge: '#92400e' },
  };

  /** Badge label CSS inside the modal */
  const KIND_META = {
    attention: { text: 'Needs Attention',  css: 'tag-attention' },
    future:    { text: 'Action Scheduled', css: 'tag-future'    },
    unseen:    { text: 'New Update',       css: 'tag-unseen'    },
    default:   { text: 'Up to Date',      css: 'tag-default'   },
  };

  /**
   * Builds a Leaflet DivIcon: beehive skep SVG + white count badge on top.
   *
   * SVG layout (viewBox 0 0 44 66):
   *   Badge  cy=9   r=9
   *   Band 1 cy=23  rx=9   (narrowest)
   *   Band 2 cy=31  rx=13
   *   Band 3 cy=39  rx=17
   *   Band 4 cy=47  rx=20
   *   Band 5 cy=55  rx=21  (widest)
   *   Base   cy=61  rx=21  flat dark base
   *   Hole   cy=55         entry hole
   *
   * Each band gets a top-sheen ellipse (white 22% opacity) for the 3-D ring look.
   */
  function buildDivIcon(kind, yard) {
    const c     = KIND_COLORS[kind] ?? KIND_COLORS.default;
    const count = yard?.hive_count ?? 0;
    const label = count > 0 ? String(count) : '?';
    const fSize = label.length >= 3 ? 6.5 : label.length === 2 ? 8 : 10;

    const BANDS = [
      { cy: 23, rx: 9  },
      { cy: 31, rx: 13 },
      { cy: 39, rx: 17 },
      { cy: 47, rx: 20 },
      { cy: 55, rx: 21 },
    ];

    const bandsSvg = BANDS.map(({ cy, rx }) =>
      `<ellipse cx="22" cy="${cy}" rx="${rx}" ry="3.5" fill="${c.fill}" stroke="${c.band}" stroke-width="0.8"/>` +
      `<ellipse cx="22" cy="${cy - 1.3}" rx="${Math.round(rx * 0.6)}" ry="1.4" fill="rgba(255,255,255,0.22)"/>`
    ).join('');

    const svg =
      `<svg width="44" height="66" viewBox="0 0 44 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      bandsSvg +
      `<ellipse cx="22" cy="61" rx="21" ry="2.5" fill="${c.band}"/>` +
      `<ellipse cx="22" cy="55" rx="5"  ry="3"   fill="rgba(0,0,0,0.45)"/>` +
      `<circle  cx="23" cy="10" r="9"             fill="rgba(0,0,0,0.18)"/>` +
      `<circle  cx="22" cy="9"  r="9"             fill="white" stroke="${c.badge}" stroke-width="2.5"/>` +
      `<text x="22" y="13.5" text-anchor="middle"` +
        ` font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif"` +
        ` font-size="${fSize}" font-weight="800" fill="#0f172a">${label}</text>` +
      `</svg>`;

    return L.divIcon({
      className: '',
      html: `<div class="bl-hive-wrap" role="img" aria-label="Yard: ${label} hives">${svg}</div>`,
      iconSize:   [44, 66],
      iconAnchor: [22, 63],
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     MARKER MANAGEMENT
     ══════════════════════════════════════════════════════════════════ */

  let _justDragged = false; // suppress click that fires right after dragend

  function attachClick(marker) {
    marker.off('click');
    marker.on('click', function () {
      if (_justDragged) { _justDragged = false; return; }
      handleMarkerClick(this._yard);
    });
  }

  function buildTooltipContent(yard) {
    const lines = [`<strong>${yard.name ?? 'Yard'}</strong>`];
    if (yard.apiaries?.name) lines.push(`🏠 ${yard.apiaries.name}`);
    if (yard.location)       lines.push(`📍 ${yard.location}`);

    const now = new Date();
    const futureActions = (yard.actions ?? [])
      .filter(a => a.action_date && new Date(a.action_date) > now)
      .sort((a, b) => new Date(a.action_date) - new Date(b.action_date));

    if (futureActions.length) {
      lines.push('<span style="color:#86efac;font-size:0.74rem;margin-top:2px;display:block">📅 Upcoming:</span>');
      futureActions.forEach(a => {
        const d = new Date(a.action_date).toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
        lines.push(`&nbsp;&nbsp;• ${a.action_type ?? a.title ?? 'Action'} <span style="color:#94a3b8">(${d})</span>`);
      });
    }

    return lines.join('<br>');
  }

  function attachTooltip(marker) {
    const content = buildTooltipContent(marker._yard);
    if (marker.getTooltip()) {
      marker.setTooltipContent(content);
    } else {
      marker.bindTooltip(content, {
        direction:  'top',
        offset:     [0, -58],
        opacity:    0.97,
        className:  'bl-tooltip',
      });
    }
  }

  function attachDrag(marker) {
    marker.off('dragstart dragend');

    marker.on('dragstart', () => {
      _justDragged = false;
      marker.getElement()?.style.setProperty('opacity', '0.65');
      marker.getElement()?.style.setProperty('filter', 'drop-shadow(0 0 8px #facc15)');
      setStatus(`Dragging "${marker._yard?.name ?? 'yard'}" — release to set new location`);
    });

    marker.on('dragend', async (e) => {
      _justDragged = true;
      marker.getElement()?.style.removeProperty('opacity');
      marker.getElement()?.style.removeProperty('filter');

      const { lat, lng } = e.target.getLatLng();
      const yardSnapshot = marker._yard; // capture before async

      const ok = await saveRelocate(yardSnapshot, lat, lng, { silent: true });

      if (!ok) {
        // Restore original position on failure
        marker.setLatLng([yardSnapshot.lat, yardSnapshot.lng]);
      }

      setTimeout(() => { _justDragged = false; }, 400);
    });
  }

  function upsertMarker(yard) {
    const lat = Number(yard.lat);
    const lng = Number(yard.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const kind = resolveMarkerKind(yard);
    const icon = buildDivIcon(kind, yard);

    let m = yardMarkers.get(yard.id);
    if (m) {
      m.setLatLng([lat, lng]);
      m.setIcon(icon);
      m._yard = yard;
      attachClick(m);
      attachTooltip(m);
      attachDrag(m);
      return;
    }

    m = L.marker([lat, lng], { icon, riseOnHover: true, draggable: true });
    m._yard = yard;
    attachClick(m);
    attachDrag(m);
    markersLayer.addLayer(m);
    yardMarkers.set(yard.id, m);
    attachTooltip(m);
  }

  /* ══════════════════════════════════════════════════════════════════
     MARKER CLICK — update last_seen_at, then show modal
     ══════════════════════════════════════════════════════════════════ */

  async function handleMarkerClick(yard) {
    const ts = new Date().toISOString();

    const { error: updateError } = await db
      .from('yards')
      .update({ last_seen_at: ts })
      .eq('id', yard.id);

    if (updateError) {
      console.error('[BeeLinked] last_seen_at update failed:', updateError.message);
      openModal({ ...yard, last_seen_at: ts });
      setStatus('Warning: sync failed — ' + updateError.message, true);
      return;
    }

    const { data, error: fetchError } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)')
      .eq('id', yard.id)
      .single();

    if (fetchError) {
      console.error('[BeeLinked] yard fetch failed:', fetchError.message);
      openModal({ ...yard, last_seen_at: ts });
      return;
    }

    const updated = data ?? { ...yard, last_seen_at: ts };
    upsertMarker(updated);
    openModal(updated);
    setStatus('Viewed: ' + (updated.name ?? updated.id));
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL
     ══════════════════════════════════════════════════════════════════ */

  const modalEl    = document.getElementById('modal');
  const modalClose = document.getElementById('modalClose');

  function fmt(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr));
    } catch { return dateStr; }
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
        .format(new Date(dateStr));
    } catch { return dateStr; }
  }

  function makeInfoRow(label, value) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-0.5';
    const lbl = document.createElement('span');
    lbl.className = 'text-[11px] uppercase tracking-widest text-slate-500 font-medium';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'text-slate-100 text-sm';
    val.textContent = String(value);
    wrap.append(lbl, val);
    return wrap;
  }

  const ACTION_STATUS_STYLE = {
    planned: { label: 'Planned',  cls: 'bg-green-900/60 text-green-300',   itemCls: 'action-future' },
    waiting: { label: 'Waiting',  cls: 'bg-orange-900/60 text-orange-300', itemCls: 'action-past'   },
    done:    { label: 'Done',     cls: 'bg-slate-700/80 text-slate-400',   itemCls: 'action-done'   },
  };

  function makeActionItem(action, onDeleted) {
    const status  = getActionStatus(action);
    const style   = ACTION_STATUS_STYLE[status];
    const dt      = action.action_date ? new Date(action.action_date) : null;

    const item = document.createElement('div');
    item.className = `rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
      status === 'done' ? 'bg-slate-800/30 opacity-60' : 'bg-slate-800/60'
    } ${style.itemCls}`;

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 mb-1';

    const title = document.createElement('span');
    title.className = `font-medium truncate flex-1 min-w-0 ${status === 'done' ? 'line-through text-slate-400' : 'text-slate-100'}`;
    title.textContent = action.title || action.action_type || 'Action';

    // Fixed-width right column so status + buttons always align
    const controls = document.createElement('div');
    controls.className = 'shrink-0 flex items-center gap-1';
    controls.style.width = '100px';

    const pill = document.createElement('span');
    pill.className = `text-[10px] px-1.5 py-0.5 rounded-full font-semibold w-16 text-center ${style.cls}`;
    pill.textContent = style.label;

    // Mark-done button (hidden for already-done actions)
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.title = 'Mark as done';
    doneBtn.className = `shrink-0 p-1 rounded-md transition active:scale-90 ${
      status === 'done'
        ? 'hidden'
        : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20'
    }`;
    doneBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
    </svg>`;

    doneBtn.addEventListener('click', async () => {
      doneBtn.disabled = true;
      doneBtn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3"/></svg>`;

      const { error } = await db.from('actions').update({ is_done: true }).eq('id', action.id);

      if (error) {
        doneBtn.disabled = false;
        doneBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
        setStatus('Failed to mark done: ' + error.message, true);
        return;
      }

      action.is_done = true;
      // Re-render item in-place
      const fresh = makeActionItem(action, onDeleted);
      item.replaceWith(fresh);
      if (onDeleted) onDeleted(action.id, true); // true = refresh marker only
      setStatus('Action marked as done');
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.title = 'Delete this action';
    delBtn.className = 'shrink-0 p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-900/20 active:scale-90 transition';
    delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"/>
    </svg>`;

    delBtn.addEventListener('click', async () => {
      if (!delBtn.dataset.confirm) {
        delBtn.dataset.confirm = '1';
        delBtn.title = 'Click again to confirm delete';
        delBtn.className = 'shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold text-red-400 border border-red-700 bg-red-900/30 hover:bg-red-800/50 active:scale-90 transition';
        delBtn.textContent = 'Confirm';
        setTimeout(() => {
          if (delBtn.dataset.confirm) {
            delete delBtn.dataset.confirm;
            delBtn.title = 'Delete this action';
            delBtn.className = 'shrink-0 p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-900/20 active:scale-90 transition';
            delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"/></svg>`;
          }
        }, 3000);
        return;
      }

      delBtn.disabled = true;
      delBtn.textContent = '…';

      const { error } = await db.from('actions').delete().eq('id', action.id);
      if (error) {
        delBtn.disabled = false;
        delBtn.textContent = 'Error';
        setStatus('Delete failed: ' + error.message, true);
        return;
      }

      item.style.opacity = '0';
      item.style.transform = 'scale(0.95)';
      setTimeout(() => {
        item.remove();
        if (onDeleted) onDeleted(action.id);
      }, 200);

      setStatus('Action deleted');
    });

    controls.append(pill, doneBtn, delBtn);
    header.append(title, controls);

    const date = document.createElement('p');
    date.className = 'text-xs text-slate-400';
    date.textContent = dt ? fmtDate(action.action_date) : 'No date';

    item.append(header, date);

    if (action.notes) {
      const notes = document.createElement('p');
      notes.className = 'text-xs text-slate-400 mt-1 line-clamp-2';
      notes.textContent = action.notes;
      item.append(notes);
    }

    return item;
  }

  let _currentModalYard = null;

  function makeCoordRow(yard) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-0.5';

    const lbl = document.createElement('span');
    lbl.className = 'text-[11px] uppercase tracking-widest text-slate-500 font-medium';
    lbl.textContent = 'Coordinates';

    const valRow = document.createElement('div');
    valRow.className = 'flex items-center gap-2';

    const val = document.createElement('span');
    val.className = 'text-slate-100 text-sm flex-1 min-w-0 truncate';
    val.textContent = yard.lat != null
      ? `${Number(yard.lat).toFixed(6)}, ${Number(yard.lng).toFixed(6)}`
      : '—';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Relocate this yard on the map';
    btn.className = 'shrink-0 flex items-center justify-center text-emerald-400 hover:text-emerald-300 w-7 h-7 rounded-md hover:bg-emerald-900/30 active:scale-95 transition';
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
    btn.addEventListener('click', () => startRelocate(yard));

    // Navigate button
    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.title = 'Navigate to this yard';
    navBtn.className = 'shrink-0 flex items-center justify-center text-sky-400 hover:text-sky-300 w-7 h-7 rounded-md hover:bg-sky-900/30 active:scale-95 transition';
    navBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7"/></svg>`;

    navBtn.addEventListener('click', () => {
      if (yard.lat == null || yard.lng == null) return;
      const lat = Number(yard.lat), lng = Number(yard.lng);

      // Build a small picker popup
      const existing = document.getElementById('bl-nav-picker');
      if (existing) existing.remove();

      const picker = document.createElement('div');
      picker.id = 'bl-nav-picker';
      picker.className = 'absolute z-[9999] bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 text-sm';
      picker.style.cssText = 'min-width:160px';

      const makePick = (label, icon, url) => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-700 transition cursor-pointer font-medium';
        a.innerHTML = `${icon} ${label}`;
        a.addEventListener('click', () => picker.remove());
        return a;
      };

      picker.append(
        makePick('Google Maps', '🗺️', `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
        makePick('Waze',        '🚗', `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`),
      );

      // Position near the button
      const rect = navBtn.getBoundingClientRect();
      picker.style.top  = `${rect.bottom + window.scrollY + 4}px`;
      picker.style.left = `${rect.left   + window.scrollX}px`;
      picker.style.position = 'fixed';
      picker.style.top  = `${rect.bottom + 4}px`;
      picker.style.left = `${rect.left}px`;

      document.body.appendChild(picker);

      // Close on outside click
      setTimeout(() => {
        const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 0);
    });

    valRow.append(val, navBtn, btn);
    wrap.append(lbl, valRow);
    return wrap;
  }

  function openModal(yard) {
    _currentModalYard = yard;
    const kind = resolveMarkerKind(yard);
    const meta = KIND_META[kind] ?? KIND_META.default;

    // Header
    document.getElementById('modalTitle').textContent    = yard.name ?? 'Yard';
    document.getElementById('modalSubtitle').textContent = yard.location ?? '';

    const badge = document.getElementById('modalBadge');
    badge.className   = `inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${meta.css}`;
    badge.textContent = meta.text;

    // Info grid
    const grid = document.getElementById('modalInfo');
    grid.innerHTML = '';
    const apiaryName = yard.apiaries?.name ?? null;
    grid.append(
      makeInfoRow('Hives',     yard.hive_count ?? '—'),
      makeInfoRow('Last Seen', fmt(yard.last_seen_at)),
      makeInfoRow('Status',    yard.status ?? 'active'),
      makeCoordRow(yard),
    );
    if (apiaryName) grid.append(makeInfoRow('Apiary', apiaryName));
    if (yard.notes) grid.append(makeInfoRow('Notes',  yard.notes));

    // Actions list
    const actionsWrap = document.getElementById('modalActionsWrap');
    const actionsList = document.getElementById('modalActionsList');
    actionsList.innerHTML = '';

    const actions = Array.isArray(yard.actions) ? yard.actions : [];
    if (actions.length === 0) {
      actionsWrap.classList.add('hidden');
    } else {
      actionsWrap.classList.remove('hidden');
      const countBadge = document.getElementById('modalActionsCount');
      let remaining = actions.length;
      countBadge.textContent = `(${remaining})`;

      // Sort: upcoming first, then most-recent past first
      const now = new Date();
      const sorted = [...actions].sort((a, b) => {
        const da = a.action_date ? new Date(a.action_date) : new Date(0);
        const db2 = b.action_date ? new Date(b.action_date) : new Date(0);
        const af = da > now, bf = db2 > now;
        if (af && !bf) return -1;
        if (!af && bf) return  1;
        return db2 - da;
      });

      const onDeleted = (deletedId, isDoneOnly = false) => {
        if (!isDoneOnly) {
          remaining -= 1;
          if (remaining <= 0) {
            actionsWrap.classList.add('hidden');
          } else {
            countBadge.textContent = `(${remaining})`;
          }
        }
        // Keep marker colour in sync
        if (_currentModalYard) {
          const m = yardMarkers.get(_currentModalYard.id);
          if (m) {
            if (isDoneOnly) {
              // Mark the action as done in the cached yard data
              const acts = (m._yard.actions ?? []).map(x =>
                x.id === deletedId ? { ...x, is_done: true } : x
              );
              m._yard = { ...m._yard, actions: acts };
            } else {
              m._yard = {
                ...m._yard,
                actions: (m._yard.actions ?? []).filter((x) => x.id !== deletedId),
              };
            }
            upsertMarker(m._yard);
          }
        }
        // Rebuild Today's widget so status badge reflects the change
        buildTodayWidget([...yardMarkers.values()].map(m => m._yard));
      };

      sorted.forEach((a) => actionsList.append(makeActionItem(a, onDeleted)));
    }

    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    modalEl.classList.add('hidden');
    document.body.style.overflow = '';
  }

  modalClose.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ══════════════════════════════════════════════════════════════════
     DATA LOADING
     ══════════════════════════════════════════════════════════════════ */

  function setStatus(msg, isError = false) {
    const el = document.getElementById('statusText');
    el.textContent = msg;
    el.className   = isError ? 'text-red-400 truncate' : 'text-slate-400 truncate';
  }

  /* ── Apiaries ────────────────────────────────────────────────── */
  let _apiaries = []; // [{ id, name }, ...]
  let _mapApiaryFilter = 'all'; // 'all' or apiary id (string)

  async function loadApiaries() {
    const { data, error } = await db
      .from('apiaries')
      .select('id, name')
      .order('name');
    if (error) {
      console.warn('[BeeLinked] loadApiaries:', error.message);
      return;
    }
    _apiaries = data ?? [];
    buildApiaryFilterBar();
  }

  function buildApiaryFilterBar() {
    const bar = document.getElementById('apiaryFilterBar');
    if (!bar) return;

    // Keep the "All" button, remove the rest
    bar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.dataset.apiaryFilter = 'all';
    allBtn.className = 'apiary-filter-btn shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition whitespace-nowrap' +
      (_mapApiaryFilter === 'all' ? ' active' : '');
    allBtn.textContent = 'All Apiaries';
    bar.appendChild(allBtn);

    _apiaries.forEach(({ id, name }) => {
      const btn = document.createElement('button');
      btn.dataset.apiaryFilter = String(id);
      btn.className = 'apiary-filter-btn shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition whitespace-nowrap' +
        (String(id) === _mapApiaryFilter ? ' active' : '');
      btn.textContent = name;
      bar.appendChild(btn);
    });

    // Single delegated listener
    bar.onclick = (e) => {
      const btn = e.target.closest('[data-apiary-filter]');
      if (!btn) return;
      _mapApiaryFilter = btn.dataset.apiaryFilter;
      bar.querySelectorAll('.apiary-filter-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.apiaryFilter === _mapApiaryFilter)
      );
      applyMapApiaryFilter();
    };
  }

  function applyMapApiaryFilter() {
    yardMarkers.forEach((marker, yardId) => {
      const yard = marker._yard;
      const show = _mapApiaryFilter === 'all' ||
        String(yard.apiary_id) === _mapApiaryFilter ||
        String(yard.apiaries?.id) === _mapApiaryFilter;
      if (show) {
        if (!markersLayer.hasLayer(marker)) markersLayer.addLayer(marker);
      } else {
        if (markersLayer.hasLayer(marker)) markersLayer.removeLayer(marker);
      }
    });
  }

  function populateApiaryDropdown(selectId, selectedId = null) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— No apiary —</option>';
    _apiaries.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value       = id;
      opt.textContent = name;
      if (String(id) === String(selectedId)) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  async function loadYards() {
    setStatus('Loading yards…');

    const { data, error } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)');

    if (error) {
      setStatus('Failed to load yards: ' + error.message, true);
      console.error('[BeeLinked] loadYards:', error);
      return;
    }

    markersLayer.clearLayers();
    yardMarkers.clear();

    const rows = data ?? [];
    if (rows.length === 0) {
      setStatus('No yards found. Add rows to the yards table in Supabase.');
      return;
    }

    rows.forEach((yard) => upsertMarker(yard));
    applyMapApiaryFilter();
    buildTodayWidget(rows);

    setStatus(`${rows.length} yard${rows.length === 1 ? '' : 's'} loaded`);

    // Refresh weather to the centroid of the actual yards
    fetchWeatherForYards();
  }

  /* ── UI controls ─────────────────────────────────────────────────── */

  document.getElementById('legendToggle').addEventListener('click', () => {
    const panel = document.getElementById('legendPanel');
    const btn   = document.getElementById('legendToggle');
    const nowHidden = panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!nowHidden));
  });

  document.getElementById('refreshBtn').addEventListener('click', loadYards);

  /* ── Boot ────────────────────────────────────────────────────────── */
  loadApiaries().then(loadYards);

  /* ══════════════════════════════════════════════════════════════════
     FAB — Floating Action Button
     ══════════════════════════════════════════════════════════════════ */

  let fabIsOpen = false;

  function setFab(open) {
    fabIsOpen = open;
    document.getElementById('fabMenu').classList.toggle('hidden', !open);
    document.getElementById('fabBtn').setAttribute('aria-expanded', String(open));
    document.getElementById('fabIcon').style.transform = open ? 'rotate(45deg)' : '';
  }

  document.getElementById('fabBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    setFab(!fabIsOpen);
  });

  // Close FAB when clicking anywhere outside it
  document.addEventListener('click', (e) => {
    if (fabIsOpen && !document.getElementById('fabWrap').contains(e.target)) {
      setFab(false);
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     NEW YARD FLOW
     1. User types name + hive count → clicks "Set on Map"
     2. A transparent overlay covers the map; cursor = crosshair
     3. User clicks anywhere → lat/lng captured → saved to Supabase
     ══════════════════════════════════════════════════════════════════ */

  let _pendingYardName     = null;
  let _pendingHiveCount    = 0;
  let _pendingApiaryId     = null;
  let _pendingRelocateYard = null;
  let _mapClickMode        = null; // 'new-yard' | 'relocate'

  function openNewYardModal() {
    setFab(false);
    document.getElementById('newYardName').value      = '';
    document.getElementById('newYardHiveCount').value = '';
    document.getElementById('newYardError').classList.add('hidden');
    populateApiaryDropdown('newYardApiarySelect');
    document.getElementById('newYardModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('newYardName').focus(), 80);
  }

  function closeNewYardModal() {
    document.getElementById('newYardModal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function enterMapClickMode(name, hiveCount, apiaryId) {
    _mapClickMode     = 'new-yard';
    _pendingYardName  = name;
    _pendingHiveCount = hiveCount;
    _pendingApiaryId  = apiaryId || null;
    document.getElementById('mapClickBannerMsg').innerHTML =
      `Tap the map to pin <strong class="font-bold text-white">${name}</strong>`;
    document.getElementById('mapClickBanner').classList.remove('hidden');
    document.getElementById('mapClickOverlay').classList.remove('hidden');
  }

  function enterRelocateMode(yard) {
    _mapClickMode        = 'relocate';
    _pendingRelocateYard = yard;
    document.getElementById('mapClickBannerMsg').innerHTML =
      `Tap map to set new location for <strong class="font-bold text-white">${yard.name ?? 'yard'}</strong>`;
    document.getElementById('mapClickBanner').classList.remove('hidden');
    document.getElementById('mapClickOverlay').classList.remove('hidden');
  }

  function exitMapClickMode() {
    _mapClickMode        = null;
    _pendingYardName     = null;
    _pendingHiveCount    = 0;
    _pendingApiaryId     = null;
    _pendingRelocateYard = null;
    document.getElementById('mapClickBanner').classList.add('hidden');
    document.getElementById('mapClickOverlay').classList.add('hidden');
  }

  async function startRelocate(yard) {
    closeModal();
    enterRelocateMode(yard);
  }

  async function saveRelocate(yard, lat, lng, { silent = false } = {}) {
    setStatus('Updating location…');

    const { error: updateError } = await db
      .from('yards')
      .update({ lat, lng })
      .eq('id', yard.id);

    if (updateError) {
      setStatus('Relocate failed: ' + updateError.message, true);
      console.error('[BeeLinked] saveRelocate update:', updateError);
      return false;
    }

    const { data: refreshed, error: fetchError } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)')
      .eq('id', yard.id)
      .single();

    if (fetchError) {
      setStatus('Relocate failed: ' + fetchError.message, true);
      console.error('[BeeLinked] saveRelocate fetch:', fetchError);
      return false;
    }

    const updated = refreshed ?? { ...yard, lat, lng };

    if (silent) {
      // Drag-drop: update marker data & icon without resetting its position
      const m = yardMarkers.get(updated.id);
      if (m) {
        m._yard = updated;
        m.setIcon(buildDivIcon(resolveMarkerKind(updated), updated));
        attachTooltip(m);
      }
    } else {
      upsertMarker(updated);
      map.panTo([lat, lng], { animate: true });
      openModal(updated);
    }

    setStatus(`"${updated.name}" relocated`);
    return true;
  }

  async function saveNewYard(name, hiveCount, apiaryId, lat, lng) {
    setStatus('Saving yard…');
    const { data, error } = await db
      .from('yards')
      .insert({ name, lat, lng, hive_count: hiveCount || 0, apiary_id: apiaryId || null })
      .select('*, actions(*), apiaries(id, name)')
      .single();

    if (error) {
      setStatus('Failed to create yard: ' + error.message, true);
      console.error('[BeeLinked] saveNewYard:', error);
      return;
    }

    upsertMarker(data);
    map.panTo([lat, lng], { animate: true });
    setStatus(`Yard "${name}" added`);
  }

  // "Set on Map" button
  document.getElementById('newYardConfirmBtn').addEventListener('click', () => {
    const name      = document.getElementById('newYardName').value.trim();
    const hiveCount = parseInt(document.getElementById('newYardHiveCount').value, 10) || 0;
    const apiaryId  = document.getElementById('newYardApiarySelect').value || null;
    const errEl     = document.getElementById('newYardError');

    if (!name) {
      errEl.textContent = 'Please enter a yard name.';
      errEl.classList.remove('hidden');
      document.getElementById('newYardName').focus();
      return;
    }
    errEl.classList.add('hidden');
    closeNewYardModal();
    enterMapClickMode(name, hiveCount, apiaryId);
  });

  // Enter key submits name form
  document.getElementById('newYardName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('newYardConfirmBtn').click();
  });

  // Transparent overlay click → capture lat/lng and dispatch by mode
  document.getElementById('mapClickOverlay').addEventListener('click', (e) => {
    const rect   = document.getElementById('mapClickOverlay').getBoundingClientRect();
    const point  = L.point(e.clientX - rect.left, e.clientY - rect.top);
    const latlng = map.containerPointToLatLng(point);
    const mode     = _mapClickMode;
    const name     = _pendingYardName;
    const count    = _pendingHiveCount;
    const apiaryId = _pendingApiaryId;
    const relocY   = _pendingRelocateYard;
    exitMapClickMode();
    if (mode === 'relocate') {
      saveRelocate(relocY, latlng.lat, latlng.lng);
    } else {
      saveNewYard(name, count, apiaryId, latlng.lat, latlng.lng);
    }
  });

  document.getElementById('cancelMapClick').addEventListener('click', exitMapClickMode);

  // Close new-yard modal triggers
  document.getElementById('newYardCancelBtn').addEventListener('click', closeNewYardModal);
  document.getElementById('newYardClose').addEventListener('click', closeNewYardModal);
  document.getElementById('newYardModal').addEventListener('click', (e) => {
    if (e.target.id === 'newYardModal') closeNewYardModal();
  });

  document.getElementById('btnNewYard').addEventListener('click', openNewYardModal);

  /* ══════════════════════════════════════════════════════════════════
     NEW ACTION FLOW
     1. Yard dropdown populated from current loaded yards
     2. Action type + date + optional notes
     3. Insert into `actions` table → refresh yard marker colour
     ══════════════════════════════════════════════════════════════════ */

  // Wire pill toggle clicks (once at load time — pills are static DOM)
  document.querySelectorAll('.action-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('selected');
      document.getElementById('actionTypeError').classList.add('hidden');
    });
  });

  function openNewActionModal(preselectedYardId = null) {
    setFab(false);

    // Populate yard dropdown (sorted alphabetically)
    const sel = document.getElementById('actionYardSelect');
    sel.innerHTML = '<option value="">— Select a yard —</option>';
    [...yardMarkers.values()]
      .map((m) => m._yard)
      .filter(Boolean)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .forEach((yard) => {
        const opt = document.createElement('option');
        opt.value       = yard.id;
        opt.textContent = yard.name ?? yard.id;
        if (preselectedYardId != null && String(yard.id) === String(preselectedYardId)) {
          opt.selected = true;
        }
        sel.appendChild(opt);
      });

    // Deselect all pills
    document.querySelectorAll('.action-pill').forEach((p) => p.classList.remove('selected'));
    document.getElementById('actionTypeError').classList.add('hidden');

    // Default date = today
    document.getElementById('actionDate').value  = new Date().toISOString().slice(0, 10);
    document.getElementById('actionNotes').value = '';
    document.getElementById('newActionError').classList.add('hidden');

    document.getElementById('newActionModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeNewActionModal() {
    document.getElementById('newActionModal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  document.getElementById('newActionSaveBtn').addEventListener('click', async () => {
    const yardId  = document.getElementById('actionYardSelect').value;
    const dateVal = document.getElementById('actionDate').value;
    const notes   = document.getElementById('actionNotes').value.trim();
    const errEl   = document.getElementById('newActionError');

    // Collect selected action types
    const selectedTitles = [...document.querySelectorAll('.action-pill.selected')]
      .map((p) => p.dataset.action);

    if (!yardId) {
      errEl.textContent = 'Please select a yard.';
      errEl.classList.remove('hidden');
      return;
    }
    if (selectedTitles.length === 0) {
      document.getElementById('actionTypeError').classList.remove('hidden');
      return;
    }
    if (!dateVal) {
      errEl.textContent = 'Please select a date.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const saveBtn = document.getElementById('newActionSaveBtn');
    saveBtn.disabled    = true;
    saveBtn.textContent = `Saving ${selectedTitles.length} action${selectedTitles.length > 1 ? 's' : ''}…`;

    // Use noon UTC to avoid timezone date-shift issues
    const actionDate = new Date(dateVal + 'T12:00:00').toISOString();

    // Build one row per selected action type
    const rows = selectedTitles.map((title) => ({
      yard_id:     yardId,
      title,
      action_type: title,
      action_date: actionDate,
      notes:       notes || null,
    }));

    const { error } = await db.from('actions').insert(rows);

    saveBtn.disabled = false;
    saveBtn.innerHTML =
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">` +
      `<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Save Action`;

    if (error) {
      errEl.textContent = 'Error: ' + error.message;
      errEl.classList.remove('hidden');
      return;
    }

    // Reload this yard so the marker colour reflects the new action
    const { data: refreshed } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)')
      .eq('id', yardId)
      .single();

    if (refreshed) upsertMarker(refreshed);

    const yardName = yardMarkers.get(yardId)?._yard?.name ?? 'yard';
    closeNewActionModal();
    const n = selectedTitles.length;
    setStatus(`${n} action${n > 1 ? 's' : ''} saved · ${yardName}`);
  });

  // Close triggers for new-action modal
  document.getElementById('newActionCancelBtn').addEventListener('click', closeNewActionModal);
  document.getElementById('newActionClose').addEventListener('click', closeNewActionModal);
  document.getElementById('newActionModal').addEventListener('click', (e) => {
    if (e.target.id === 'newActionModal') closeNewActionModal();
  });

  document.getElementById('btnNewAction').addEventListener('click', openNewActionModal);

  /* ══════════════════════════════════════════════════════════════════
     LIST VIEW
     Full-screen table of all yards + actions.
     Export to Excel (SheetJS) · Share via Web Share API / clipboard.
     ══════════════════════════════════════════════════════════════════ */

  const STATUS_LABEL = { attention: 'Attention', active: 'Active', inactive: 'Inactive' };
  const STATUS_CSS   = {
    attention: 'bg-red-900/60 text-red-300 border-red-700',
    active:    'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    inactive:  'bg-slate-700/60 text-slate-400 border-slate-600',
  };

  /* ── Column definitions ──────────────────────────────────────── */
  const COL_DEFS = {
    name: {
      label: 'Yard Name', sortKey: 'name',
      renderTd: (y) => `<td class="px-4 py-3 text-left font-semibold text-white">${y.name ?? '—'}</td>`,
    },
    location: {
      label: 'Location', sortKey: 'location',
      renderTd: (y) => `<td class="px-4 py-3 text-center text-slate-300">${y.location ?? '—'}</td>`,
    },
    hives: {
      label: 'Hives', sortKey: 'hives',
      renderTd: (y) => `<td class="px-4 py-3 text-center text-slate-200 font-medium">${y.hive_count ?? 0}</td>`,
    },
    status: {
      label: 'Status', sortKey: 'status',
      renderTd: (y) => {
        const css = STATUS_CSS[y.status] ?? STATUS_CSS.active;
        const lbl = STATUS_LABEL[y.status] ?? (y.status ?? 'Active');
        return `<td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${css}">${lbl}</span></td>`;
      },
    },
    seen: {
      label: 'Last Seen', sortKey: 'seen',
      renderTd: (y) => `<td class="px-4 py-3 text-center text-slate-300 text-xs whitespace-nowrap">${fmt(y.last_seen_at)}</td>`,
    },
    actions: {
      label: 'Actions', sortKey: null,
      renderTd: (y, upcoming, past) => `<td class="px-4 py-3 text-center">
        <div class="flex flex-wrap justify-center gap-1">
          ${upcoming.length ? `<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-300 border border-green-700">${upcoming.length} upcoming</span>` : ''}
          ${past.length     ? `<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300 border border-yellow-700">${past.length} past</span>` : ''}
          ${!upcoming.length && !past.length ? `<span class="text-[11px] text-hive-muted">None</span>` : ''}
        </div></td>`,
    },
    apiary: {
      label: 'Apiary', sortKey: 'apiary',
      renderTd: (y) => `<td class="px-4 py-3 text-center text-slate-300">${y.apiaries?.name ?? '—'}</td>`,
    },
    mapview: {
      label: 'Map View', sortKey: null,
      renderTd: () => `<td class="px-4 py-3 text-center">
        <button type="button" class="lv-mapview-btn inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg border border-emerald-800/60 hover:bg-emerald-900/30 active:scale-95 transition">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Open
        </button>
      </td>`,
    },
  };

  const DEFAULT_COL_ORDER = ['name', 'apiary', 'location', 'hives', 'status', 'seen', 'actions', 'mapview'];

  function loadColOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem('bl_col_order') ?? 'null');
      if (Array.isArray(saved)) {
        const valid   = saved.filter((k) => k in COL_DEFS);
        const missing = DEFAULT_COL_ORDER.filter((k) => !valid.includes(k));
        return [...valid, ...missing];
      }
    } catch {}
    return [...DEFAULT_COL_ORDER];
  }

  function saveColOrder() {
    localStorage.setItem('bl_col_order', JSON.stringify(_colOrder));
  }

  let _colOrder      = loadColOrder();
  let _draggedColIdx = null;

  /* ── Dynamic table header (also handles sort + drag-and-drop) ─── */
  function buildTableHeader() {
    const grip = `<svg class="inline-block w-2.5 h-3 ml-1.5 text-hive-muted/40 group-hover:text-hive-muted/60 transition" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/></svg>`;

    const row = document.getElementById('lvTheadRow');
    row.innerHTML = '';

    // Fixed # column
    const thIdx = document.createElement('th');
    thIdx.className = 'text-center px-4 py-3 text-[11px] uppercase tracking-widest text-hive-muted font-semibold w-8 select-none';
    thIdx.textContent = '#';
    row.appendChild(thIdx);

    _colOrder.forEach((key, colIdx) => {
      const def      = COL_DEFS[key];
      const isActive = !!def.sortKey && def.sortKey === _sortCol;
      const arrow    = def.sortKey
        ? `<span class="ml-0.5 ${isActive ? 'text-amber-400' : 'opacity-40'}">${isActive ? (_sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>`
        : '';
      const alignCls = key === 'name' ? 'text-left' : 'text-center';

      const th = document.createElement('th');
      th.className = [
        alignCls,
        'px-4 py-3 text-[11px] uppercase tracking-widest font-semibold',
        'cursor-grab select-none transition-colors group',
        isActive ? 'text-white' : 'text-hive-muted',
        def.sortKey ? 'hover:text-white' : '',
      ].filter(Boolean).join(' ');
      th.draggable  = true;
      th.innerHTML  = `${def.label}${arrow}${grip}`;

      // ── Sort on click (only if mouse didn't move — not a drag) ──
      if (def.sortKey) {
        th.addEventListener('click', () => {
          if (_draggedColIdx !== null) return;
          if (_sortCol === def.sortKey) {
            _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _sortCol = def.sortKey;
            _sortDir = 'asc';
          }
          buildListView();
        });
      }

      // ── Drag-and-drop ──────────────────────────────────────────────
      th.addEventListener('dragstart', (e) => {
        _draggedColIdx = colIdx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => th.classList.add('lv-col-dragging'), 0);
      });

      th.addEventListener('dragend', () => {
        th.classList.remove('lv-col-dragging');
        row.querySelectorAll('th').forEach((el) => {
          el.classList.remove('lv-drop-left', 'lv-drop-right');
        });
        _draggedColIdx = null;
      });

      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (_draggedColIdx === null || _draggedColIdx === colIdx) return;
        e.dataTransfer.dropEffect = 'move';
        row.querySelectorAll('th').forEach((el) => el.classList.remove('lv-drop-left', 'lv-drop-right'));
        th.classList.add(colIdx > _draggedColIdx ? 'lv-drop-right' : 'lv-drop-left');
      });

      th.addEventListener('dragleave', () => {
        th.classList.remove('lv-drop-left', 'lv-drop-right');
      });

      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('lv-drop-left', 'lv-drop-right');
        if (_draggedColIdx === null || _draggedColIdx === colIdx) return;
        const next = [..._colOrder];
        const [moved] = next.splice(_draggedColIdx, 1);
        next.splice(colIdx, 0, moved);
        _colOrder = next;
        saveColOrder();
        buildListView();
      });

      row.appendChild(th);
    });
  }

  let _sortCol          = 'name';
  let _sortDir          = 'asc';
  let _searchTerm       = '';
  let _filterStatus     = '';
  let _filterActionType = '';   // '' | 'none' | any action type string
  let _filterApiary     = '';   // '' | apiary id string
  let _filterDateFrom   = '';   // ISO date string e.g. '2025-01-01'
  let _filterDateTo     = '';

  const STATUS_FILTER_LABELS = { '': 'Status', active: 'Active', attention: 'Attention', inactive: 'Inactive' };

  /* Build the Actions filter menu from live Supabase data */
  function populateApiaryFilterMenu() {
    const menu = document.getElementById('filterApiaryMenu');
    menu.innerHTML = '';

    const makeOpt = (label, val) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lv-filter-opt w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-hive-card hover:text-white transition';
      btn.dataset.filter = 'apiary';
      btn.dataset.val    = val;
      btn.textContent    = label;
      return btn;
    };

    menu.appendChild(makeOpt('All Apiaries', ''));

    if (_apiaries.length > 0) {
      const div = document.createElement('div');
      div.className = 'border-t border-hive-border/60';
      menu.appendChild(div);
      _apiaries.forEach(({ id, name }) => menu.appendChild(makeOpt(name, String(id))));
    }
  }

  function populateActionsFilterMenu() {
    const menu = document.getElementById('filterActionsMenu');
    menu.innerHTML = '';

    // Collect all unique action types across all yards
    const types = new Set();
    yardMarkers.forEach((m) => {
      const acts = Array.isArray(m._yard?.actions) ? m._yard.actions : [];
      acts.forEach((a) => {
        const label = (a.title || a.action_type || '').trim();
        if (label) types.add(label);
      });
    });

    const makeOpt = (label, val) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lv-filter-opt w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-hive-card hover:text-white transition';
      btn.dataset.filter = 'actiontype';
      btn.dataset.val    = val;
      btn.textContent    = label;
      return btn;
    };

    menu.appendChild(makeOpt('All Action Types', ''));
    const div1 = document.createElement('div');
    div1.className = 'border-t border-hive-border/60';
    menu.appendChild(div1);
    menu.appendChild(makeOpt('No Actions', 'none'));

    if (types.size > 0) {
      const div2 = document.createElement('div');
      div2.className = 'border-t border-hive-border/60';
      menu.appendChild(div2);
      [...types].sort().forEach((t) => menu.appendChild(makeOpt(t, t)));
    }
  }

  function updateFilterButtons() {
    const hasStatus  = _filterStatus     !== '';
    const hasAction  = _filterActionType !== '';
    const hasApiary  = _filterApiary     !== '';
    const hasDate    = _filterDateFrom   !== '' || _filterDateTo !== '';
    const hasAny     = hasStatus || hasAction || hasApiary || hasDate || _searchTerm !== '';

    // Status button
    const sBtn = document.getElementById('filterStatusBtn');
    document.getElementById('filterStatusLabel').textContent = STATUS_FILTER_LABELS[_filterStatus] ?? 'Status';
    sBtn.classList.toggle('border-amber-500/70', hasStatus);
    sBtn.classList.toggle('text-amber-300',      hasStatus);
    sBtn.classList.toggle('bg-amber-900/20',     hasStatus);

    // Action Type button
    const aBtn = document.getElementById('filterActionsBtn');
    const aLabel = _filterActionType === ''     ? 'Action Type'
                 : _filterActionType === 'none' ? 'No Actions'
                 : _filterActionType;
    document.getElementById('filterActionsLabel').textContent = aLabel;
    aBtn.classList.toggle('border-amber-500/70', hasAction);
    aBtn.classList.toggle('text-amber-300',      hasAction);
    aBtn.classList.toggle('bg-amber-900/20',     hasAction);

    // Apiary button
    const apBtn   = document.getElementById('filterApiaryBtn');
    const apLabel = hasApiary
      ? (_apiaries.find((a) => String(a.id) === _filterApiary)?.name ?? 'Apiary')
      : 'Apiary';
    document.getElementById('filterApiaryLabel').textContent = apLabel;
    apBtn.classList.toggle('border-amber-500/70', hasApiary);
    apBtn.classList.toggle('text-amber-300',      hasApiary);
    apBtn.classList.toggle('bg-amber-900/20',     hasApiary);

    // Date button
    const dBtn = document.getElementById('filterDateBtn');
    let dLabel = 'Date Range';
    if (_filterDateFrom && _filterDateTo) dLabel = `${_filterDateFrom} → ${_filterDateTo}`;
    else if (_filterDateFrom)             dLabel = `From ${_filterDateFrom}`;
    else if (_filterDateTo)               dLabel = `Until ${_filterDateTo}`;
    document.getElementById('filterDateLabel').textContent = dLabel;
    dBtn.classList.toggle('border-amber-500/70', hasDate);
    dBtn.classList.toggle('text-amber-300',      hasDate);
    dBtn.classList.toggle('bg-amber-900/20',     hasDate);

    // Clear button
    document.getElementById('listViewClearFilters').classList.toggle('hidden', !hasAny);

    // Highlight active option in each menu (delegated — runs on dynamic content)
    document.querySelectorAll('.lv-filter-opt').forEach((opt) => {
      const isActive =
        (opt.dataset.filter === 'status'     && opt.dataset.val === _filterStatus)     ||
        (opt.dataset.filter === 'actiontype' && opt.dataset.val === _filterActionType) ||
        (opt.dataset.filter === 'apiary'     && opt.dataset.val === _filterApiary);
      opt.classList.toggle('text-amber-300', isActive);
      opt.classList.toggle('bg-hive-card',   isActive);
      opt.classList.toggle('font-semibold',  isActive);
    });
  }

  function closeAllFilterMenus() {
    document.querySelectorAll('.lv-filter-menu').forEach((m) => m.classList.add('hidden'));
  }

  function getAllYardsSorted() {
    const now = new Date();
    return [...yardMarkers.values()]
      .map((m) => m._yard)
      .filter(Boolean)
      .sort((a, b) => {
        let va, vb;
        switch (_sortCol) {
          case 'hives':
            va = a.hive_count ?? 0; vb = b.hive_count ?? 0;
            return _sortDir === 'asc' ? va - vb : vb - va;
          case 'status':
            va = a.status ?? ''; vb = b.status ?? '';
            break;
          case 'apiary':
            va = a.apiaries?.name ?? ''; vb = b.apiaries?.name ?? '';
            break;
          case 'location':
            va = a.location ?? ''; vb = b.location ?? '';
            break;
          case 'seen':
            va = a.last_seen_at ?? ''; vb = b.last_seen_at ?? '';
            break;
          default: // 'name'
            va = a.name ?? ''; vb = b.name ?? '';
        }
        const cmp = va.localeCompare(vb);
        return _sortDir === 'asc' ? cmp : -cmp;
      });
  }


  function buildListView() {
    const q   = _searchTerm.toLowerCase().trim();
    const now = new Date();

    const dateFrom = _filterDateFrom ? new Date(_filterDateFrom + 'T00:00:00') : null;
    const dateTo   = _filterDateTo   ? new Date(_filterDateTo   + 'T23:59:59') : null;

    const yards = getAllYardsSorted().filter((y) => {
      // Text search
      if (q && !(
        (y.name     ?? '').toLowerCase().includes(q) ||
        (y.location ?? '').toLowerCase().includes(q) ||
        (y.status   ?? '').toLowerCase().includes(q) ||
        (y.notes    ?? '').toLowerCase().includes(q) ||
        String(y.hive_count ?? '').includes(q)
      )) return false;

      // Status filter
      if (_filterStatus && (y.status ?? 'active') !== _filterStatus) return false;

      // Apiary filter
      if (_filterApiary && String(y.apiaries?.id ?? y.apiary_id ?? '') !== _filterApiary) return false;

      // Action type filter
      const acts = Array.isArray(y.actions) ? y.actions : [];
      if (_filterActionType === 'none' && acts.length > 0) return false;
      if (_filterActionType && _filterActionType !== 'none') {
        const hasType = acts.some((a) =>
          (a.title || a.action_type || '').trim() === _filterActionType
        );
        if (!hasType) return false;
      }

      // Date range filter — yard must have at least one action in range
      if (dateFrom || dateTo) {
        const inRange = acts.some((a) => {
          if (!a.action_date) return false;
          const d = new Date(a.action_date);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo   && d > dateTo)   return false;
          return true;
        });
        if (!inRange) return false;
      }

      return true;
    });

    buildTableHeader();
    updateFilterButtons();

    const totalYards = [...yardMarkers.values()].filter((m) => m._yard).length;
    const isFiltered = q || _filterStatus || _filterActionType || _filterApiary || _filterDateFrom || _filterDateTo;
    document.getElementById('listViewCount').textContent = isFiltered
      ? `${yards.length} of ${totalYards}`
      : `${yards.length} yard${yards.length !== 1 ? 's' : ''}`;

    let totalActions = 0;
    const totalCols  = _colOrder.length + 1; // +1 for the # column

    /* ── Desktop table rows ───────────────────────────────────────── */
    const tbody = document.getElementById('listViewTableBody');
    tbody.innerHTML = '';

    if (yards.length === 0) {
      const empty = document.createElement('tr');
      empty.innerHTML = `<td colspan="${totalCols}" class="px-4 py-10 text-center text-hive-muted text-sm">No yards match <span class="text-slate-300">"${q || 'current filters'}"</span></td>`;
      tbody.appendChild(empty);
    }

    yards.forEach((yard, idx) => {
      const actions  = Array.isArray(yard.actions) ? yard.actions : [];
      const upcoming = actions.filter((a) => a.action_date && new Date(a.action_date) > now);
      const past     = actions.filter((a) => !a.action_date || new Date(a.action_date) <= now);
      totalActions  += actions.length;

      // Main yard row — columns rendered in current _colOrder
      const tr = document.createElement('tr');
      tr.className = 'border-b border-hive-border hover:bg-hive-card/60 cursor-pointer transition group';
      let rowHtml = `<td class="px-4 py-3 text-center text-hive-muted text-xs">${idx + 1}</td>`;
      _colOrder.forEach((key) => { rowHtml += COL_DEFS[key].renderTd(yard, upcoming, past); });
      tr.innerHTML = rowHtml;

      // Map View button — open yard on map without triggering the row click
      const mapBtn = tr.querySelector('.lv-mapview-btn');
      if (mapBtn) {
        mapBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeListView();
          handleMarkerClick(yard);
        });
      }

      tr.addEventListener('click', () => { closeListView(); handleMarkerClick(yard); });
      tbody.appendChild(tr);

      // Action sub-rows — single spanning td, column-order-agnostic
      if (actions.length) {
        [...actions]
          .sort((a, b) => (b.action_date ?? '').localeCompare(a.action_date ?? ''))
          .forEach((action) => {
            const isFuture = action.action_date && new Date(action.action_date) > now;
            const atr = document.createElement('tr');
            atr.className = 'border-b border-hive-border/50 bg-hive-card/20 hover:bg-hive-card/40 transition';
            atr.innerHTML = `
              <td class="px-4 py-2 text-center text-hive-muted text-xs">↳</td>
              <td class="px-4 py-2" colspan="${_colOrder.length}">
                <div class="flex items-center gap-3 text-xs">
                  <span class="text-slate-300 font-medium">${action.title || action.action_type || 'Action'}</span>
                  ${action.notes ? `<span class="text-hive-muted">· ${action.notes}</span>` : ''}
                  <span class="ml-auto shrink-0 px-1.5 py-0.5 rounded-full font-semibold ${isFuture ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/30 text-yellow-300'}">${isFuture ? 'Upcoming' : 'Past'}</span>
                  <span class="shrink-0 text-slate-400">${action.action_date ? fmtDate(action.action_date) : '—'}</span>
                </div>
              </td>`;
            tbody.appendChild(atr);
          });
      }
    });

    /* ── Mobile cards ─────────────────────────────────────────────── */
    const cards = document.getElementById('listViewCards');
    cards.innerHTML = '';

    if (yards.length === 0) {
      cards.innerHTML = `<div class="px-4 py-10 text-center text-hive-muted text-sm">No yards match "<span class="text-slate-300">${q}</span>"</div>`;
    }

    yards.forEach((yard) => {
      const actions  = Array.isArray(yard.actions) ? yard.actions : [];
      const upcoming = actions.filter((a) => a.action_date && new Date(a.action_date) > now);
      const past     = actions.filter((a) => !a.action_date || new Date(a.action_date) <= now);
      const statusCss = STATUS_CSS[yard.status] ?? STATUS_CSS.active;
      const statusLbl = STATUS_LABEL[yard.status] ?? (yard.status ?? 'Active');

      const card = document.createElement('div');
      card.className = 'px-4 py-4 hover:bg-hive-card/40 active:bg-hive-card/60 cursor-pointer transition';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <p class="font-semibold text-white text-sm truncate">${yard.name ?? '—'}</p>
            <p class="text-xs text-hive-muted truncate">${yard.location ?? 'No location'}</p>
          </div>
          <span class="shrink-0 inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCss}">${statusLbl}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>🐝 ${yard.hive_count ?? 0} hives</span>
          <span>Seen: ${fmt(yard.last_seen_at)}</span>
          ${upcoming.length ? `<span class="text-green-400">${upcoming.length} upcoming action${upcoming.length > 1 ? 's' : ''}</span>` : ''}
          ${past.length    ? `<span class="text-yellow-400">${past.length} past action${past.length > 1 ? 's' : ''}</span>` : ''}
        </div>
        ${actions.length ? `
        <div class="mt-2 space-y-1">
          ${[...actions]
            .sort((a, b) => (b.action_date ?? '').localeCompare(a.action_date ?? ''))
            .slice(0, 3)
            .map((a) => {
              const isFut = a.action_date && new Date(a.action_date) > now;
              return `<div class="flex items-center gap-2 text-[11px]">
                <span class="shrink-0 w-1.5 h-1.5 rounded-full ${isFut ? 'bg-green-400' : 'bg-yellow-400'}"></span>
                <span class="text-slate-300">${a.title || a.action_type || 'Action'}</span>
                <span class="text-hive-muted ml-auto">${a.action_date ? fmtDate(a.action_date) : ''}</span>
              </div>`;
            }).join('')}
          ${actions.length > 3 ? `<p class="text-[11px] text-hive-muted pl-3.5">+${actions.length - 3} more…</p>` : ''}
        </div>` : ''}`;
      card.addEventListener('click', () => {
        closeListView();
        handleMarkerClick(yard);
      });
      cards.appendChild(card);
    });

    const totalHives = yards.reduce((s, y) => s + (y.hive_count ?? 0), 0);
    document.getElementById('listViewFooterNote').textContent =
      `${yards.length} yards · ${totalHives} total hives · ${totalActions} actions`;
  }

  function openListView() {
    _searchTerm       = '';
    _filterStatus     = '';
    _filterActionType = '';
    _filterApiary     = '';
    _filterDateFrom   = '';
    _filterDateTo     = '';
    document.getElementById('listViewSearch').value  = '';
    document.getElementById('filterDateFrom').value  = '';
    document.getElementById('filterDateTo').value    = '';
    closeAllFilterMenus();
    populateApiaryFilterMenu();
    populateActionsFilterMenu();
    buildListView();
    document.getElementById('listViewModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('listViewSearch').focus(), 120);
  }


  function closeListView() {
    document.getElementById('listViewModal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ── Excel export ─────────────────────────────────────────────── */
  function exportToExcel() {
    const yards = getAllYardsSorted();
    const now   = new Date();
    const XLSX  = window.XLSX;

    if (!XLSX) {
      setStatus('Excel library not loaded — try refreshing.', true);
      return;
    }

    // Sheet 1 — Yards summary
    const yardsRows = [
      ['Yard Name', 'Location', 'Hive Count', 'Status', 'Last Seen', 'Coordinates', 'Notes', 'Upcoming Actions', 'Past Actions'],
    ];
    yards.forEach((y) => {
      const actions  = Array.isArray(y.actions) ? y.actions : [];
      const upcoming = actions.filter((a) => a.action_date && new Date(a.action_date) > now).length;
      const past     = actions.filter((a) => !a.action_date || new Date(a.action_date) <= now).length;
      yardsRows.push([
        y.name ?? '',
        y.location ?? '',
        y.hive_count ?? 0,
        y.status ?? 'active',
        y.last_seen_at ? new Date(y.last_seen_at).toLocaleString() : '',
        y.lat != null ? `${Number(y.lat).toFixed(6)}, ${Number(y.lng).toFixed(6)}` : '',
        y.notes ?? '',
        upcoming,
        past,
      ]);
    });

    // Sheet 2 — All actions
    const actionsRows = [
      ['Yard Name', 'Action', 'Action Type', 'Date', 'Status', 'Notes'],
    ];
    yards.forEach((y) => {
      const actions = Array.isArray(y.actions) ? y.actions : [];
      [...actions]
        .sort((a, b) => (b.action_date ?? '').localeCompare(a.action_date ?? ''))
        .forEach((a) => {
          const isFuture = a.action_date && new Date(a.action_date) > now;
          actionsRows.push([
            y.name ?? '',
            a.title || a.action_type || '',
            a.action_type ?? '',
            a.action_date ? new Date(a.action_date).toLocaleDateString() : '',
            isFuture ? 'Upcoming' : 'Past',
            a.notes ?? '',
          ]);
        });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(yardsRows),    'Yards');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actionsRows),  'Actions');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `BeeLinked_${dateStr}.xlsx`);
    setStatus('Excel file downloaded');
  }

  /* ── Share (Web Share API / clipboard fallback) ────────────────── */
  async function shareListView() {
    const yards = getAllYardsSorted();
    const now   = new Date();

    // Build CSV text
    const lines = ['Yard Name,Location,Hives,Status,Last Seen,Upcoming Actions,Past Actions'];
    yards.forEach((y) => {
      const actions  = Array.isArray(y.actions) ? y.actions : [];
      const upcoming = actions.filter((a) => a.action_date && new Date(a.action_date) > now).length;
      const past     = actions.filter((a) => !a.action_date || new Date(a.action_date) <= now).length;
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      lines.push([
        esc(y.name), esc(y.location), y.hive_count ?? 0,
        esc(y.status), esc(y.last_seen_at ? new Date(y.last_seen_at).toLocaleString() : ''),
        upcoming, past,
      ].join(','));
    });
    const csvText = lines.join('\n');

    // Try Web Share API (works on mobile)
    if (navigator.share) {
      try {
        const blob = new Blob([csvText], { type: 'text/csv' });
        const file = new File([blob], `BeeLinked_${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' });
        const shareData = { title: 'BeeLinked – Yard Data', files: [file] };

        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
          setStatus('Shared successfully');
          return;
        }
        // Fall back to sharing text only
        await navigator.share({ title: 'BeeLinked – Yard Data', text: csvText });
        setStatus('Shared successfully');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(csvText);
      setStatus('Yard data copied to clipboard (CSV)');
    } catch {
      setStatus('Share not available on this browser', true);
    }
  }

  /* ── Event listeners ──────────────────────────────────────────── */
  document.getElementById('listViewBtn').addEventListener('click', openListView);
  document.getElementById('listViewClose').addEventListener('click', closeListView);
  document.getElementById('listViewBackBtn').addEventListener('click', closeListView);
  document.getElementById('listViewExportBtn').addEventListener('click', exportToExcel);
  document.getElementById('listViewShareBtn').addEventListener('click', shareListView);

  // Search
  document.getElementById('listViewSearch').addEventListener('input', (e) => {
    _searchTerm = e.target.value;
    buildListView();
  });

  // Filter dropdown toggle helper
  function toggleMenu(menuId, e) {
    e.stopPropagation();
    const menu   = document.getElementById(menuId);
    const isOpen = !menu.classList.contains('hidden');
    closeAllFilterMenus();
    menu.classList.toggle('hidden', isOpen);
  }

  document.getElementById('filterStatusBtn').addEventListener('click',  (e) => toggleMenu('filterStatusMenu',  e));
  document.getElementById('filterActionsBtn').addEventListener('click', (e) => toggleMenu('filterActionsMenu', e));
  document.getElementById('filterDateBtn').addEventListener('click',    (e) => toggleMenu('filterDateMenu',    e));

  // Filter option selection — event delegation (handles dynamic action type options)
  document.getElementById('filterStatusMenu').addEventListener('click', (e) => {
    const opt = e.target.closest('.lv-filter-opt');
    if (!opt) return;
    _filterStatus = opt.dataset.val;
    closeAllFilterMenus();
    buildListView();
  });

  document.getElementById('filterActionsMenu').addEventListener('click', (e) => {
    const opt = e.target.closest('.lv-filter-opt');
    if (!opt) return;
    _filterActionType = opt.dataset.val;
    closeAllFilterMenus();
    buildListView();
  });

  // Date range — Apply button
  document.getElementById('filterDateApplyBtn').addEventListener('click', () => {
    _filterDateFrom = document.getElementById('filterDateFrom').value;
    _filterDateTo   = document.getElementById('filterDateTo').value;
    closeAllFilterMenus();
    buildListView();
  });

  // Date range — Clear button
  document.getElementById('filterDateClearBtn').addEventListener('click', () => {
    _filterDateFrom = '';
    _filterDateTo   = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    buildListView();
    updateFilterButtons();
  });

  // Apiary filter toggle + selection
  document.getElementById('filterApiaryBtn').addEventListener('click', (e) => toggleMenu('filterApiaryMenu', e));
  document.getElementById('filterApiaryMenu').addEventListener('click', (e) => {
    const opt = e.target.closest('.lv-filter-opt');
    if (!opt) return;
    _filterApiary = opt.dataset.val;
    closeAllFilterMenus();
    buildListView();
  });

  // Clear ALL filters
  document.getElementById('listViewClearFilters').addEventListener('click', () => {
    _searchTerm       = '';
    _filterStatus     = '';
    _filterActionType = '';
    _filterApiary     = '';
    _filterDateFrom   = '';
    _filterDateTo     = '';
    document.getElementById('listViewSearch').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    buildListView();
  });

  // Close menus when clicking outside the filter bar
  document.getElementById('listViewModal').addEventListener('click', (e) => {
    if (!e.target.closest('#filterStatusWrap') &&
        !e.target.closest('#filterActionsWrap') &&
        !e.target.closest('#filterApiaryWrap') &&
        !e.target.closest('#filterDateWrap')) {
      closeAllFilterMenus();
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     EDIT YARD FLOW
     ══════════════════════════════════════════════════════════════════ */

  function openEditYardModal(yard) {
    document.getElementById('editYardName').value      = yard.name ?? '';
    document.getElementById('editYardHiveCount').value = yard.hive_count ?? 0;
    document.getElementById('editYardStatus').value    = yard.status ?? 'active';
    document.getElementById('editYardLocation').value  = yard.location ?? '';
    document.getElementById('editYardNotes').value     = yard.notes ?? '';
    document.getElementById('editYardError').classList.add('hidden');
    populateApiaryDropdown('editYardApiary', yard.apiaries?.id ?? yard.apiary_id ?? null);
    document.getElementById('editYardModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('editYardName').focus(), 80);
  }

  function closeEditYardModal() {
    document.getElementById('editYardModal').classList.add('hidden');
  }

  document.getElementById('modalEditBtn').addEventListener('click', () => {
    if (_currentModalYard) openEditYardModal(_currentModalYard);
  });

  document.getElementById('modalAddActionBtn').addEventListener('click', () => {
    if (!_currentModalYard) return;
    const yardId = _currentModalYard.id;
    closeModal();
    openNewActionModal(yardId);
  });

  document.getElementById('modalShareBtn').addEventListener('click', async () => {
    const yard = _currentModalYard;
    if (!yard) return;

    const now     = new Date();
    const actions = Array.isArray(yard.actions) ? yard.actions : [];
    const upcoming = actions.filter((a) => a.action_date && new Date(a.action_date) > now);
    const past     = actions.filter((a) => !a.action_date || new Date(a.action_date) <= now);

    const lines = [
      `🐝 ${yard.name ?? 'Yard'}`,
      yard.apiaries?.name  ? `🏠 Apiary: ${yard.apiaries.name}` : null,
      yard.location        ? `📍 Location: ${yard.location}` : null,
      `🪣 Hives: ${yard.hive_count ?? 0}`,
      `⚡ Status: ${yard.status ?? 'active'}`,
      yard.lat != null     ? `🗺️ Coords: ${Number(yard.lat).toFixed(6)}, ${Number(yard.lng).toFixed(6)}` : null,
      yard.last_seen_at    ? `👁️ Last seen: ${fmt(yard.last_seen_at)}` : null,
      actions.length       ? `\n📋 Actions (${actions.length}):` : null,
      ...upcoming.map((a) => `  • [Upcoming] ${a.title || a.action_type} — ${a.action_date ? fmtDate(a.action_date) : 'no date'}`),
      ...past.map((a)     => `  • [Past] ${a.title || a.action_type} — ${a.action_date ? fmtDate(a.action_date) : 'no date'}`),
      yard.notes           ? `\n📝 Notes: ${yard.notes}` : null,
    ].filter(Boolean).join('\n');

    const btn = document.getElementById('modalShareBtn');

    // Try native share (great on mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: yard.name ?? 'Yard', text: lines });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(lines);
      const orig = btn.innerHTML;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    } catch {
      setStatus('Share not supported on this browser', true);
    }
  });

  document.getElementById('editYardSaveBtn').addEventListener('click', async () => {
    const name      = document.getElementById('editYardName').value.trim();
    const hiveCount = parseInt(document.getElementById('editYardHiveCount').value, 10) || 0;
    const status    = document.getElementById('editYardStatus').value;
    const location  = document.getElementById('editYardLocation').value.trim() || null;
    const notes     = document.getElementById('editYardNotes').value.trim() || null;
    const apiaryId  = document.getElementById('editYardApiary').value || null;
    const errEl     = document.getElementById('editYardError');

    if (!name) {
      errEl.textContent = 'Yard name is required.';
      errEl.classList.remove('hidden');
      document.getElementById('editYardName').focus();
      return;
    }
    errEl.classList.add('hidden');

    const saveBtn = document.getElementById('editYardSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const yardId = _currentModalYard.id;
    const { error: updateError } = await db
      .from('yards')
      .update({ name, hive_count: hiveCount, status, location, notes, apiary_id: apiaryId })
      .eq('id', yardId);

    saveBtn.disabled = false;
    saveBtn.innerHTML =
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">` +
      `<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Save Changes`;

    if (updateError) {
      errEl.textContent = 'Error: ' + updateError.message;
      errEl.classList.remove('hidden');
      return;
    }

    const { data: refreshed } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)')
      .eq('id', yardId)
      .single();

    const apiary  = _apiaries.find((a) => String(a.id) === String(apiaryId)) ?? null;
    const updated = refreshed ?? { ..._currentModalYard, name, hive_count: hiveCount, status, location, notes, apiary_id: apiaryId, apiaries: apiary };
    upsertMarker(updated);
    closeEditYardModal();
    openModal(updated);
    setStatus(`"${name}" updated`);
  });

  document.getElementById('editYardCancelBtn').addEventListener('click', closeEditYardModal);
  document.getElementById('editYardClose').addEventListener('click', closeEditYardModal);
  document.getElementById('editYardModal').addEventListener('click', (e) => {
    if (e.target.id === 'editYardModal') closeEditYardModal();
  });

})();
