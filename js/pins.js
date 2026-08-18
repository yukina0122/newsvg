const pins = [];
const pinsDiv = document.getElementById("pins");
const status = document.getElementById("status");

function renderPins() {
  pinsDiv.innerHTML = "";

  pins.forEach((pin) => {
    const element = document.createElement("div");
    element.className = "pin";
    element.textContent = `${pin.name}（${pin.distance}m）`;

    element.addEventListener("click", () => {
      alert(
        `${pin.name}\n${pin.category}\n緯度: ${pin.latitude}\n経度: ${pin.longitude}`
      );
    });

    pinsDiv.appendChild(element);
  });
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (degree) => degree * Math.PI / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

async function queryOverpass(query, timeoutMs = 15000, retriesPerEndpoint = 1) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt <= retriesPerEndpoint; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`タイムアウト(${timeoutMs}ms): ${endpoint}`)),
        timeoutMs
      );

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`Overpass APIの応答エラー: ${response.status} (${endpoint})`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        console.warn(
          `[Overpass] ${endpoint} 失敗 (試行${attempt + 1}/${retriesPerEndpoint + 1})`,
          error
        );
      }
    }
  }

  throw lastError;
}
async function fetchOsmPins(latitude, longitude) {
  const delta = 0.0015;

  const query = `
    [out:json][timeout:8];
    (
      nwr["amenity"~"^(cafe|restaurant|fast_food|toilets|pharmacy|hospital|parking)$"]["name"]
        (${latitude - delta},${longitude - delta},${latitude + delta},${longitude + delta});

      nwr["shop"]["name"]
        (${latitude - delta},${longitude - delta},${latitude + delta},${longitude + delta});

      nwr["tourism"~"^(attraction|information)$"]["name"]
        (${latitude - delta},${longitude - delta},${latitude + delta},${longitude + delta});
    );
    out tags center;
  `;

  const data = await queryOverpass(query);

  const results = data.elements
    .map((item) => {
      const pinLatitude = item.lat ?? item.center?.lat;
      const pinLongitude = item.lon ?? item.center?.lon;

      return {
        osmId: `${item.type}/${item.id}`,
        name: item.tags?.name,
        category: item.tags?.amenity ?? item.tags?.shop ?? item.tags?.tourism,
        latitude: pinLatitude,
        longitude: pinLongitude,
        distance: getDistanceMeters(latitude, longitude, pinLatitude, pinLongitude),
      };
    })
    .filter((pin) => pin.name && pin.latitude && pin.longitude)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);

  // 成功したらキャッシュ保存(次回失敗時のフォールバック用)
  try {
    localStorage.setItem(
      "pins_cache",
      JSON.stringify({ latitude, longitude, results, savedAt: Date.now() })
    );
  } catch (e) {
    console.warn("キャッシュ保存に失敗", e);
  }

  return results;
}

function readPinsCache(latitude, longitude, maxAgeMs = 30 * 60 * 1000, maxDistanceMeters = 500) {
  try {
    const raw = localStorage.getItem("pins_cache");
    if (!raw) return null;

    const cache = JSON.parse(raw);
    const age = Date.now() - cache.savedAt;
    const distance = getDistanceMeters(latitude, longitude, cache.latitude, cache.longitude);

    if (age > maxAgeMs || distance > maxDistanceMeters) return null;
    return cache;
  } catch {
    return null;
  }
}

function loadNearbyPins() {
  if (!navigator.geolocation) {
    alert("この端末では位置情報を使えません");
    return;
  }

  status.textContent = "位置情報を取得中…";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        status.textContent = "周辺施設を検索中…";

        const { latitude, longitude } = position.coords;
        const nearbyPins = await fetchOsmPins(latitude, longitude);

        pins.length = 0;
        pins.push(...nearbyPins);

        renderPins();
        status.textContent = `${pins.length}件の周辺ピンを表示中`;
      } catch (error) {
        console.error(error);

        const { latitude, longitude } = position.coords;
        const cached = readPinsCache(latitude, longitude);

        if (cached) {
          pins.length = 0;
          pins.push(...cached.results);
          renderPins();
          status.textContent = `オフラインキャッシュを表示中(${pins.length}件)`;
        } else {
          status.textContent = "ピンの取得に失敗しました。電波状況の良い場所で再試行してください";
        }
      }
    },
    () => {
      status.textContent = "位置情報の許可が必要です";
    }
  );
}