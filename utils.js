const getSumForListObjectsProperties = (items, properties) => {
  return items
    .reduce((acc, currentValue) => {
      const res = {};

      properties
        .forEach(property => {
          res[property] = (acc[property] || 0) + currentValue[property];
        });

      return res;
    }, {});
};

exports.getSumForListObjectsProperties = getSumForListObjectsProperties;
