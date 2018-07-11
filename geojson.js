const convertStravaLatLngStreamToGeoJSONLineString = latLngStream => {
  if (!latLngStream) {
    return;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: latLngStream.data.map(coord => coord.slice().reverse())
    },
    properties: {}
  };
};

exports.convertStravaLatLngStreamToGeoJSONLineString = convertStravaLatLngStreamToGeoJSONLineString;