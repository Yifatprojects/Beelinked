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
  function resolveMarkerKind(yard) {
    if (yard.status === 'attention') return 'attention';

    const now     = new Date();
    const actions = Array.isArray(yard.actions) ? yard.actions : [];
    const seen    = yard.last_seen_at ? new Date(yard.last_seen_at) : null;

    // Rule 2 — upcoming action
    const hasFuture = actions.some((a) => a.action_date && new Date(a.action_date) > now);
    if (hasFuture) return 'future';

    // Rule 3 — past action that hasn't been seen yet
    const hasUnseen = actions.some((a) => {
      if (!a.action_date) return false;
      const ad = new Date(a.action_date);
      if (ad > now) return false;             // future — handled above
      if (seen && ad <= seen) return false;   // already seen
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

  function attachClick(marker) {
    marker.off('click');
    marker.on('click', function () {
      handleMarkerClick(this._yard);
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
      return;
    }

    m = L.marker([lat, lng], { icon, riseOnHover: true });
    m._yard = yard;
    attachClick(m);
    markersLayer.addLayer(m);
    yardMarkers.set(yard.id, m);
  }

  /* ══════════════════════════════════════════════════════════════════
     MARKER CLICK — update last_seen_at, then show modal
     ══════════════════════════════════════════════════════════════════ */

  async function handleMarkerClick(yard) {
    const ts = new Date().toISOString();

    // Update last_seen_at and return the full row (with actions join)
    const { data, error } = await db
      .from('yards')
      .update({ last_seen_at: ts })
      .eq('id', yard.id)
      .select('*, actions(*), apiaries(id, name)')
      .single();

    if (error) {
      console.error('[BeeLinked] last_seen_at update failed:', error.message);
      openModal({ ...yard, last_seen_at: ts });
      setStatus('Warning: sync failed — ' + error.message, true);
      return;
    }

    const updated = data ?? { ...yard, last_seen_at: ts };
    upsertMarker(updated);   // refresh icon colour
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

  function makeActionItem(action, onDeleted) {
    const now      = new Date();
    const dt       = action.action_date ? new Date(action.action_date) : null;
    const isFuture = dt && dt > now;

    const item = document.createElement('div');
    item.className = `rounded-lg bg-slate-800/60 px-3 py-2.5 text-sm ${isFuture ? 'action-future' : 'action-past'} transition-all duration-200`;

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2 mb-1';

    const title = document.createElement('span');
    title.className = 'font-medium text-slate-100 truncate';
    title.textContent = action.title || action.action_type || 'Action';

    const pill = document.createElement('span');
    pill.className = `shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
      isFuture ? 'bg-green-900/60 text-green-300' : 'bg-yellow-900/50 text-yellow-300'
    }`;
    pill.textContent = isFuture ? 'Upcoming' : 'Past';

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.title = 'Delete this action';
    delBtn.className = 'shrink-0 ml-1 p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-900/20 active:scale-90 transition';
    delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"/>
    </svg>`;

    delBtn.addEventListener('click', async () => {
      // Switch to a confirming state
      if (!delBtn.dataset.confirm) {
        delBtn.dataset.confirm = '1';
        delBtn.title = 'Click again to confirm delete';
        delBtn.className = 'shrink-0 ml-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-red-400 border border-red-700 bg-red-900/30 hover:bg-red-800/50 active:scale-90 transition';
        delBtn.textContent = 'Confirm';
        // Auto-cancel after 3 s
        setTimeout(() => {
          if (delBtn.dataset.confirm) {
            delete delBtn.dataset.confirm;
            delBtn.title = 'Delete this action';
            delBtn.className = 'shrink-0 ml-1 p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-900/20 active:scale-90 transition';
            delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"/></svg>`;
          }
        }, 3000);
        return;
      }

      // Confirmed — delete
      delBtn.disabled = true;
      delBtn.textContent = '…';

      const { error } = await db.from('actions').delete().eq('id', action.id);

      if (error) {
        delBtn.disabled = false;
        delBtn.textContent = 'Error';
        setStatus('Delete failed: ' + error.message, true);
        return;
      }

      // Animate out and remove
      item.style.opacity = '0';
      item.style.transform = 'scale(0.95)';
      setTimeout(() => {
        item.remove();
        if (onDeleted) onDeleted(action.id);
      }, 200);

      setStatus('Action deleted');
    });

    header.append(title, pill, delBtn);

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
      ? `${Number(yard.lat).toFixed(5)}, ${Number(yard.lng).toFixed(5)}`
      : '—';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Relocate this yard on the map';
    btn.className = 'shrink-0 flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded-md hover:bg-emerald-900/30 active:scale-95 transition';
    btn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Relocate`;
    btn.addEventListener('click', () => startRelocate(yard));

    valRow.append(val, btn);
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

      const onDeleted = (deletedId) => {
        remaining -= 1;
        if (remaining <= 0) {
          actionsWrap.classList.add('hidden');
        } else {
          countBadge.textContent = `(${remaining})`;
        }
        // Keep marker colour in sync
        if (_currentModalYard) {
          const m = yardMarkers.get(_currentModalYard.id);
          if (m) {
            m._yard = {
              ...m._yard,
              actions: (m._yard.actions ?? []).filter((x) => x.id !== deletedId),
            };
            upsertMarker(m._yard);
          }
        }
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

    setStatus(`${rows.length} yard${rows.length === 1 ? '' : 's'} loaded`);
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

  async function saveRelocate(yard, lat, lng) {
    setStatus('Updating location…');

    const { error: updateError } = await db
      .from('yards')
      .update({ lat, lng })
      .eq('id', yard.id);

    if (updateError) {
      setStatus('Relocate failed: ' + updateError.message, true);
      console.error('[BeeLinked] saveRelocate update:', updateError);
      return;
    }

    const { data: refreshed, error: fetchError } = await db
      .from('yards')
      .select('*, actions(*), apiaries(id, name)')
      .eq('id', yard.id)
      .single();

    if (fetchError) {
      setStatus('Relocate failed: ' + fetchError.message, true);
      console.error('[BeeLinked] saveRelocate fetch:', fetchError);
      return;
    }

    const updated = refreshed ?? { ...yard, lat, lng };
    upsertMarker(updated);
    map.panTo([lat, lng], { animate: true });
    openModal(updated);
    setStatus(`"${updated.name}" relocated`);
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

  function openNewActionModal() {
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

  const DEFAULT_COL_ORDER = ['name', 'location', 'hives', 'status', 'seen', 'actions', 'mapview'];

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
  let _filterDateFrom   = '';   // ISO date string e.g. '2025-01-01'
  let _filterDateTo     = '';

  const STATUS_FILTER_LABELS = { '': 'Status', active: 'Active', attention: 'Attention', inactive: 'Inactive' };

  /* Build the Actions filter menu from live Supabase data */
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
    const hasDate    = _filterDateFrom   !== '' || _filterDateTo !== '';
    const hasAny     = hasStatus || hasAction || hasDate || _searchTerm !== '';

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
        (opt.dataset.filter === 'actiontype' && opt.dataset.val === _filterActionType);
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
    const isFiltered = q || _filterStatus || _filterActionType || _filterDateFrom || _filterDateTo;
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
    _filterDateFrom   = '';
    _filterDateTo     = '';
    document.getElementById('listViewSearch').value  = '';
    document.getElementById('filterDateFrom').value  = '';
    document.getElementById('filterDateTo').value    = '';
    closeAllFilterMenus();
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

  // Clear ALL filters
  document.getElementById('listViewClearFilters').addEventListener('click', () => {
    _searchTerm       = '';
    _filterStatus     = '';
    _filterActionType = '';
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
      yard.lat != null     ? `🗺️ Coords: ${Number(yard.lat).toFixed(5)}, ${Number(yard.lng).toFixed(5)}` : null,
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
