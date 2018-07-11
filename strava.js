'use strict';

const strava = require('strava-v3');

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

const getActivityLatLngStream = activityId => {
  const LOW = 'low';
  const MEDIUM = 'medium';
  const HIGH = 'high';

  const options = {
    id: activityId,
    types: 'latlng',
    resolution: LOW,
  };

  return new Promise((resolve, reject) => {
    strava
      .streams
      .activity(options, (err, streams) => {
        if (err) {
          reject(err);
        } else {

          streams = streams.filter ? streams : [];

          // NOTE: we actually get a list of 2 streams back from Strava
          // one with the latlng and the second one with the distance
          // we will only resolve the latlng stream to prevent saving a lot of data (the dataset of streams can get big if you have many activities)
          const streamsWithOnlyLatLngStream = streams.filter(stream => stream.type === 'latlng');
          resolve(streamsWithOnlyLatLngStream[0]);
        }
      });
  });
};

exports.getActivities = getActivities;
exports.getActivityLatLngStream = getActivityLatLngStream;
