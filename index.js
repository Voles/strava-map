'use strict';

const express = require('express');
const compression = require('compression');
const cache = require('memory-cache');
const geojsonExtent = require('geojson-extent');
const schedule = require('node-schedule');
const debug = require('debug')('strava-map');
const app = express();

const getActivities = require('./strava').getActivities;
const getActivityLatLngStream = require('./strava').getActivityLatLngStream;
const getSumForListObjectsProperties = require('./utils').getSumForListObjectsProperties;
const convertStravaLatLngStreamToGeoJSONLineString = require('./geojson').convertStravaLatLngStreamToGeoJSONLineString;

app.use(compression());
app.use(express.static('.'));

cache.put('activitiesFetchedAfter', null);

// every 15 mins, from 6:00 - 23:00
// via https://stackoverflow.com/a/41743794
const job = schedule
  .scheduleJob('*/2 6-23 * * *', function (fireDate) {
    debug(`This job was supposed to run at ${fireDate}, but actually ran at ${new Date()}`);

    const JULY_14TH = 1531526400;

    const after = !cache.get('activitiesFetchedAfter') ?
      JULY_14TH :
      cache.get('activitiesFetchedAfter');

    const currentUnixDateTimeInSeconds = Math.floor(Date.now() / 1000);
    cache.put('activitiesFetchedAfter', currentUnixDateTimeInSeconds);

    debug(`Get all activities for user, after ${after}`);

    getAllActivitiesForUser({ after: after, per_page: 25 })
      .then(activities => {
        debug(`Got ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`);

        // only save a subset of properties from the activity, to prevent memory issues
        const activitiesSubset = activities
          .map(activity => Object.assign({}, {
            id: activity.id,
            distance: activity.distance,
            moving_time: activity.moving_time,
          }));

        cache.put('activities', activitiesSubset);
        return activitiesSubset;
      })
      .then(activities => {
        return Promise
          .all(
            activities
              .filter(activity => !!activity)
              .map(activity => cacheGetActivityRouteStream(activity.id))
          )
      })
      .then(() => {
        debug('Finished getting all new activities & activity latlng streams');
      })
      .catch(err => {
        console.error(err);
      });
  });

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
  new Promise(resolve => {
    if (cache.get('activities')) {
      resolve(cache.get('activities'));
    } else {
      resolve([]);
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

app.listen(3000, () => debug('App running and listening on port 3000'));
