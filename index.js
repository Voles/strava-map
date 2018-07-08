const express = require('express');
const compression = require('compression');
const cache = require('memory-cache');
const geojsonExtent = require('geojson-extent');
const strava = require('strava-v3');
const app = express();

app.use(compression());
app.use(express.static('.'));

const getActivities = options => {
	return new Promise((resolve, reject) => {
		strava
			.athlete
			.listActivities(options , (err, payload) => {
				if (err) {
					reject(err);
				} else {
					resolve(payload);
				}
			});
	});
};

function convert(stream) {
  if (!stream || !stream.filter) return;
  return stream.filter(function(e) {
    return e.type === 'latlng';
  }).map(function(e) {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: e.data.map(function(coord) {
          return coord.slice().reverse();
        })
      },
      properties: {}
    };
  })[0];
}

const getActivityStream = activityId => {
  return new Promise((resolve, reject) => {
    strava
      .streams
      .activity({ id: activityId, types: 'latlng', resolution: 'low' }, (err, payload) => {
        if (err) {
          reject(err);
        } else {
          resolve(payload);
        }
      });
  });
};

function doIt(options, page, activities) {
  activities = activities || [];
  page = page || 1;

  return new Promise((resolve, reject) => {
    getActivities(Object.assign({}, options, { page: page }))
      .then(payload => {
        const newActivities = activities.concat(payload);
        if (payload.length >= options.per_page) {
          return doIt(options, page + 1, newActivities);
        } else {
          return newActivities;
        }
      })
      .then(activities => {
        resolve(activities);
      })
      .catch(err => {
        reject(err);
      });
  });
}

const cacheGetActivities = () =>
  new Promise((resolve, reject) => {
    if (cache.get('activities')) {
      resolve(cache.get('activities'));
    } else {
      const FIRST_OF_JANUARY_2018 = 1514764800;
      const JULY_15TH_2018 = 1531612800;
      return doIt({ after: JULY_15TH_2018, per_page: 25 })
        .then(activities => {
          cache.put('activities', activities, 1000 * 60 * 60 * 2); // 2u
          resolve(activities);
        })
        .catch(err => {
          reject(err);
        });
    }
  });

const cacheGetActivityRouteStream = activityId =>
  new Promise((resolve, reject) => {
    if (cache.get(`activity_${activityId}`)) {
      resolve(cache.get(`activity_${activityId}`));
    } else {
      getActivityStream(activityId)
        .then(res => {
          cache.put(`activity_${activityId}`, res);
          resolve(res);
        })
        .catch(err => {
          reject(err);
        });
    }
  });

app.get('/strava', (req, res) => {
  let duration = 0;
  let distance = 0;

  cacheGetActivities()
    .then(activities => {
      duration = activities.reduce((acc, currentValue) => acc + currentValue.moving_time, 0);
      distance = activities.reduce((acc, currentValue) => acc + currentValue.distance, 0);

      console.log(activities
        .filter(activity => !!activity).length);

      return Promise
        .all(
          activities
            .filter(activity => !!activity)
            .map(activity =>
              cacheGetActivityRouteStream(activity.id)
                .then(res => convert(res))
            )
        )
    })
    .then(activitiesRoutes => {
      const geojson = {
        "type": "FeatureCollection",
        "features": activitiesRoutes.filter(activity => !!activity)
      };

      const bounds = geojsonExtent(geojson);

      res
        .status(200)
        .send({
          geojson,
          bounds,
          statistics: {
            duration,
            distance
          }
        });
    })
     .catch(err => {
       console.log(err);
     });
});

app.listen(3000, () => console.log('Example app listening on port 3000!'))
