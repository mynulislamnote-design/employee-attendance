// Haversine Formula: পৃথিবীর বক্রতা বিবেচনা করে দুটি স্থানাঙ্কের মধ্যবর্তী দূরত্ব (মিটারে) বের করা
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // পৃথিবীর ব্যাসার্ধ (মিটারে)
  const toRad = (angle: number) => (angle * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance); // দূরত্ব ফেরত দেবে (মিটারে)
}

// কর্মী অনুমোদিত সীমার ভেতরে আছেন কি না যাচাই
export function checkLocationBoundary(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  allowedRadiusMeters: number,
): { isAllowed: boolean; distance: number } {
  const distance = calculateDistance(userLat, userLng, officeLat, officeLng);
  return {
    isAllowed: distance <= allowedRadiusMeters,
    distance,
  };
}
