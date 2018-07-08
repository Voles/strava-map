window.mapboxgl.accessToken = 'pk.eyJ1IjoibmRlcXVla2VyIiwiYSI6ImNqaGNmZGI5MzA4NmgzY282bzhybHB5MzcifQ.5PP4hhbqa12HYVAYjlg7uA';

var map = new window.mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/outdoors-v9',
  zoom: 3,
  center: [12, 54]
});

map.on('load', function () {
  fetch('/strava')
    .then(response => response.json())
    .then(res => {
      document.getElementById('statistics').classList.remove('is-hidden');

      document.getElementById('distance').innerText = Math.round(res.statistics.distance / 1000);
      document.getElementById('duration').innerText = `${Math.round(res.statistics.duration / 60 / 60)} uur`;

      map.addLayer({
        "id": "route",
        "type": "line",
        "source": {
          "type": "geojson",
          "data": res.geojson
        },
        "layout": {
          "line-join": "round",
          "line-cap": "round"
        },
        "paint": {
          "line-color": "#888",
          "line-width": 3
        }
      });

      map.fitBounds(res.bounds, {
        padding: 125
      });
    });

});
