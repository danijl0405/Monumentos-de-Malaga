const SESSION_KEY = 'monumentos-session';
const FAVORITES_KEY = 'monumentos-favoritos-admin';
const INITIAL_CENTER = [36.7213, -4.4217];
const INITIAL_ZOOM = 15;
const DETAIL_ZOOM = 18;

const map = L.map('map').setView(INITIAL_CENTER, INITIAL_ZOOM);
const monumentList = document.getElementById('monumentList');
const monumentCount = document.getElementById('monumentCount');
const authButton = document.getElementById('authButton');
const loginForm = document.getElementById('loginForm');
const loginModalElement = document.getElementById('loginModal');
const loginModal = new bootstrap.Modal(loginModalElement);
const defaultMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

let monuments = [];
let markers = {};

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  updateAuthUI();
  loadMonuments();
  setTimeout(function() {
    map.invalidateSize();
  }, 100);
});

function bindEvents() {
  window.addEventListener('resize', function() {
    map.invalidateSize();
  });

  authButton.addEventListener('click', function() {
    if (isLoggedIn()) {
      logout();
      return;
    }

    loginModal.show();
  });

  loginForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username, password: password })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo iniciar sesion');
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify({ username: data.username }));
      loginModal.hide();
      loginForm.reset();
      updateAuthUI();
      renderList();
      updateMarkerStyles();

      Swal.fire({
        icon: 'success',
        title: 'Sesion iniciada',
        text: 'Ya puedes guardar favoritos en el navegador.',
        confirmButtonText: 'Aceptar'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Login incorrecto',
        text: error.message,
        confirmButtonText: 'Reintentar'
      });
    }
  });

  loginModalElement.addEventListener('hidden.bs.modal', function() {
    loginForm.reset();
  });
}

async function loadMonuments() {
  try {
    const response = await fetch('/api/monumentos');

    if (!response.ok) {
      throw new Error('No se pudieron cargar los monumentos');
    }

    const data = await response.json();

    monuments = data.features
      .filter(function(feature) {
        return feature.geometry && feature.geometry.type === 'Point';
      })
      .map(normalizeMonument)
      .sort(function(firstMonument, secondMonument) {
        return firstMonument.name.localeCompare(secondMonument.name, 'es');
      });

    renderMarkers();
    renderList();
  } catch (error) {
    monumentList.innerHTML = '<div class="list-group-item text-danger">Error al cargar los monumentos.</div>';

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message,
      confirmButtonText: 'Cerrar'
    });
  }
}

function normalizeMonument(feature) {
  const properties = feature.properties || {};
  const coordinates = feature.geometry.coordinates || [];

  return {
    id: String(properties.ID || feature.id),
    name: properties.NOMBRE || 'Sin nombre',
    address: (properties.DIRECCION || 'Sin direccion').trim(),
    description: (properties.DESCRIPCION || 'Sin descripcion disponible.').trim(),
    url: properties.URL,
    lat: coordinates[1],
    lng: coordinates[0]
  };
}

function renderMarkers() {
  const bounds = [];

  Object.keys(markers).forEach(function(monumentId) {
    map.removeLayer(markers[monumentId]);
  });
  markers = {};

  monuments.forEach(function(monument) {
    const marker = L.marker([monument.lat, monument.lng], {
      icon: getMarkerIcon(monument.id)
    })
      .addTo(map)
      .bindTooltip(monument.name);

    marker.on('click', function() {
      focusMonument(monument.id);
    });

    markers[monument.id] = marker;
    bounds.push([monument.lat, monument.lng]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function renderList() {
  monumentCount.textContent = monuments.length;

  if (monuments.length === 0) {
    monumentList.innerHTML = '<div class="list-group-item text-muted">No hay monumentos disponibles.</div>';
    return;
  }

  monumentList.innerHTML = monuments
    .map(function(monument) {
      const favorite = isFavorite(monument.id);
      const itemClass = favorite ? 'favorite-item' : '';
      const buttonClass = favorite ? 'btn-secondary' : 'btn-outline-secondary';
      const iconClass = favorite ? 'bi-heart-fill' : 'bi-heart';

      return `
        <div class="list-group-item monument-item ${itemClass}" data-id="${monument.id}" role="button" tabindex="0">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="text-start flex-grow-1 overflow-hidden">
              <h3 class="h4 monument-name mb-0">${escapeHtml(monument.name)}</h3>
              <p class="mb-2 monument-address">${escapeHtml(monument.address)}</p>
            </div>
          </div>
          <button type="button" class="btn btn-sm ${buttonClass} favorite-toggle" data-id="${monument.id}" title="Activar o desactivar favorito">
              <i class="bi ${iconClass}"></i>
          </button>
        </div>
      `;
    })
    .join('');

  monumentList.querySelectorAll('.monument-item').forEach(function(item) {
    item.addEventListener('click', function() {
      focusMonument(item.dataset.id);
    });

    item.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusMonument(item.dataset.id);
      }
    });
  });

  monumentList.querySelectorAll('.favorite-toggle').forEach(function(button) {
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      toggleFavorite(button.dataset.id);
    });
  });
}

function focusMonument(monumentId) {
  const monument = monuments.find(function(item) {
    return item.id === monumentId;
  });

  if (!monument) {
    return;
  }

  map.flyTo([monument.lat, monument.lng], DETAIL_ZOOM, {
    duration: 1.2
  });

  openMonumentModal(monument);
}

function openMonumentModal(monument) {
  const url = normalizeUrl(monument.url);
  const extraLink = url
    ? `<p class="mb-0"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Mas informacion</a></p>`
    : '';

  Swal.fire({
    icon: 'info',
    title: monument.name,
    html: `
      <div class="monument-popup-content">
        <p><strong>Direccion:</strong> ${escapeHtml(monument.address)}</p>
        <p>${formatText(monument.description)}</p>
        ${extraLink}
      </div>
    `,
    confirmButtonText: 'OK',
    width: 640,
    customClass: {
      popup: 'monument-popup',
      title: 'monument-popup-title',
      confirmButton: 'monument-popup-button'
    }
  });
}

function toggleFavorite(monumentId) {
  if (!isLoggedIn()) {
    Swal.fire({
      icon: 'warning',
      title: 'Debes iniciar sesion',
      text: 'Solo el usuario autenticado puede gestionar favoritos.',
      confirmButtonText: 'Ir al login'
    }).then(function(result) {
      if (result.isConfirmed) {
        loginModal.show();
      }
    });
    return;
  }

  const favorites = getStoredFavorites();
  const index = favorites.indexOf(monumentId);

  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push(monumentId);
  }

  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  renderList();
  updateMarkerStyles();
}

function updateMarkerStyles() {
  Object.keys(markers).forEach(function(monumentId) {
    markers[monumentId].setIcon(getMarkerIcon(monumentId));
  });
}

function getMarkerIcon(monumentId) {
  return defaultMarkerIcon;
}

function updateAuthUI() {
  const session = getSession();

  if (session) {
    authButton.textContent = 'Logout';
    authButton.className = 'btn btn-secondary btn-sm';
    authButton.removeAttribute('data-bs-toggle');
    authButton.removeAttribute('data-bs-target');
  } else {
    authButton.textContent = 'Login';
    authButton.className = 'btn btn-secondary btn-sm';
    authButton.setAttribute('data-bs-toggle', 'modal');
    authButton.setAttribute('data-bs-target', '#loginModal');
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
  renderList();
  updateMarkerStyles();

  Swal.fire({
    icon: 'success',
    title: 'Sesion cerrada',
    text: 'Los favoritos siguen guardados localmente para el usuario admin.',
    confirmButtonText: 'Aceptar'
  });
}

function isLoggedIn() {
  return Boolean(getSession());
}

function getSession() {
  try {
    const rawSession = localStorage.getItem(SESSION_KEY);
    return rawSession ? JSON.parse(rawSession) : null;
  } catch (error) {
    return null;
  }
}

function isFavorite(monumentId) {
  return getStoredFavorites().indexOf(monumentId) >= 0;
}

function getStoredFavorites() {
  if (!isLoggedIn()) {
    return [];
  }

  try {
    const rawFavorites = localStorage.getItem(FAVORITES_KEY);
    return rawFavorites ? JSON.parse(rawFavorites) : [];
  } catch (error) {
    return [];
  }
}

function normalizeUrl(url) {
  if (!url) {
    return '';
  }

  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

function formatText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
