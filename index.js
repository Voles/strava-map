'use strict';

const express = require('express');
const compression = require('compression');
const cache = require('memory-cache');
const geojsonExtent = require('geojson-extent');
const app = express();

const getActivities = require('./strava').getActivities;
const getActivityLatLngStream = require('./strava').getActivityLatLngStream;
const getSumForListObjectsProperties = require('./utils').getSumForListObjectsProperties;
const convertStravaLatLngStreamToGeoJSONLineString = require('./geojson').convertStravaLatLngStreamToGeoJSONLineString;

app.use(compression());
app.use(express.static('.'));

function getAllActivitiesForUser(options, page, activities) {
  activities = activities || [];
  page = page || 1;

  return new Promise((resolve, reject) => {
    getActivities(Object.assign({}, options, { page: page }))
      .then(payload => {
        const newActivities = activities.concat(payload);
        if (payload.length >= options.per_page) {
          return getAllActivitiesForUser(options, page + 1, newActivities);
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
      // const FIRST_OF_JANUARY_2018 = 1514764800;
      // const JULY_15TH_2018 = 1531612800;
      const JULY_8TH = 1531008000;
      const JULY_11TH_AFTER_NOON = 1531310416;
      return getAllActivitiesForUser({ after: JULY_11TH_AFTER_NOON, per_page: 25 })
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
      getActivityLatLngStream(activityId)
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
  let stats;

  cacheGetActivities()
    .then(activities => {
      stats = getSumForListObjectsProperties(activities, ['moving_time', 'distance']);

      return Promise
        .all(
          activities
            .filter(activity => !!activity)
            .map(activity =>
              cacheGetActivityRouteStream(activity.id)
                .then(latLngStream => convertStravaLatLngStreamToGeoJSONLineString(latLngStream))
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
            duration: stats.moving_time,
            distance: stats.distance
          }
        });
    })
     .catch(err => {
       console.log(err);
     });
});

app.listen(3000, () => console.log('App running and listening on port 3000'));
